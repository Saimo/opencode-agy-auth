import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgyCatalogStore } from "../../src/acp/catalog";
import { AcpClientPool, resolveConversationsDir } from "../../src/acp/client";
import { AgyAcpLanguageModel } from "../../src/acp/language-model";
import {
  stripAgyMcpTitlePrefix,
  stripInjectedToolSummary,
} from "../../src/acp/mcp-bridge";
import { AgySessionManager } from "../../src/acp/sessions";
import { AgyTurnOutcomeError } from "../../src/acp/turn-outcome";
import type { LanguageModelV3Prompt, LanguageModelV3StreamPart } from "../../src/acp/types";
import type { AgyToolMode, OpenCodeV2PermissionAssertInput } from "../../src/plugin/types";

const MOCK_AGY_PATH = resolve(__dirname, "../fixtures/mock-agy-acp.mjs");

async function drainStream(
  stream: ReadableStream<LanguageModelV3StreamPart>,
): Promise<LanguageModelV3StreamPart[]> {
  const out: LanguageModelV3StreamPart[] = [];
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      out.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return out;
}

describe("acp/language-model, acp/sessions, and acp/mcp-bridge", () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "agy-lm-test-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const d of tempDirs.splice(0, tempDirs.length)) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  function createHarness(opts?: {
    toolMode?: AgyToolMode;
    watchdogTimeoutMs?: number;
    env?: NodeJS.ProcessEnv;
    onPermissionAssert?: (input: OpenCodeV2PermissionAssertInput) => Promise<void>;
  }) {
    const geminiDir = makeTempDir();
    const workspaceDir = makeTempDir();
    const pool = new AcpClientPool();
    const catalog = new AgyCatalogStore();
    const storageMap = new Map<string, unknown>();

    const manager = new AgySessionManager({
      pool,
      catalog,
      getSpawnConfig: () => ({
        binaryPath: MOCK_AGY_PATH,
        geminiDir,
        cwd: workspaceDir,
        ...(opts?.env ? { env: opts.env } : {}),
      }),
      getToolMode: () => opts?.toolMode ?? "opencode",
      getWatchdogTimeoutMs: () => opts?.watchdogTimeoutMs ?? 5_000,
      storage: {
        get: async (k) => storageMap.get(k),
        set: async (k, v) => {
          storageMap.set(k, v);
        },
        remove: async (k) => {
          storageMap.delete(k);
        },
      },
      permission: {
        assert: opts?.onPermissionAssert ?? (async () => {}),
      },
    });

    const cleanup = async () => {
      await manager.dispose();
      await pool.dispose();
    };

    return { geminiDir, workspaceDir, pool, catalog, storageMap, manager, cleanup };
  }

  it("strips Run mcp_opencode_ prefix and injected toolSummary unless declared in schema (#36138)", () => {
    expect(stripAgyMcpTitlePrefix("Run mcp_opencode_bash")).toBe("bash");
    expect(stripAgyMcpTitlePrefix("mcp_opencode_read_file")).toBe("read_file");

    expect(
      stripInjectedToolSummary(
        { path: "a.ts", toolSummary: "Read file" },
        { type: "object", properties: { path: { type: "string" } } },
      ),
    ).toEqual({ path: "a.ts" });

    // Preserves toolSummary when explicitly declared in schema
    expect(
      stripInjectedToolSummary(
        { path: "a.ts", toolSummary: "Explicitly wanted" },
        {
          type: "object",
          properties: {
            path: { type: "string" },
            toolSummary: { type: "string" },
          },
        },
      ),
    ).toEqual({ path: "a.ts", toolSummary: "Explicitly wanted" });
  });

  it("executes Pause-and-Yield OpenCode MCP tool calls, strips toolSummary, and forwards multimodal image/resource outputs (#36138, #36144)", async () => {
    const h = createHarness();
    try {
      const model = new AgyAcpLanguageModel("gemini-4-carbon", h.manager);
      const tools = [
        {
          type: "function" as const,
          name: "read_file",
          description: "Read workspace file",
          inputSchema: {
            type: "object",
            properties: { path: { type: "string" } },
            additionalProperties: false,
          },
        },
      ];

      const step1Prompt: LanguageModelV3Prompt = [
        { role: "system", content: "You are a helpful coding agent." },
        {
          role: "user",
          content: [{ type: "text", text: "[SCENARIO:single_mcp_tool]" }],
        },
      ];

      // Step 1: Model yields `tool-call` (`providerExecuted: false`) and parks `session/prompt`
      const { stream: s1 } = await model.doStream({
        prompt: step1Prompt,
        tools,
        headers: { "x-opencode-session-id": "oc_ses_1" },
      });
      const parts1 = await drainStream(s1);

      const toolCallPart = parts1.find((p) => p.type === "tool-call");
      expect(toolCallPart).toBeDefined();
      expect(toolCallPart!.type === "tool-call" && toolCallPart.toolName).toBe("read_file");
      expect(toolCallPart!.type === "tool-call" && toolCallPart.providerExecuted).toBe(false);
      // Verify `toolSummary` injected by mock-agy-acp was stripped!
      expect(
        toolCallPart!.type === "tool-call" ? JSON.parse(toolCallPart.input) : null,
      ).toEqual({ path: "README.md" });

      const finish1 = parts1.find((p) => p.type === "finish");
      expect(finish1?.type === "finish" && finish1.finishReason.unified).toBe("tool-calls");

      const callId = toolCallPart!.type === "tool-call" ? toolCallPart.toolCallId : "";

      // Step 2: OpenCode supplies multimodal `tool-result` (`text` + `image-data` + `file-data`)
      const step2Prompt: LanguageModelV3Prompt = [
        ...step1Prompt,
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: callId,
              toolName: "read_file",
              input: { path: "README.md" },
            },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: callId,
              toolName: "read_file",
              output: {
                type: "content",
                value: [
                  { type: "text", text: "HelloFromOpenCode" },
                  {
                    type: "image-data",
                    data: "data:image/png;base64,iVBORw0KGgo=",
                    mediaType: "image/png",
                  },
                  {
                    type: "file-data",
                    data: Buffer.from("%PDF-1.4").toString("base64"),
                    mediaType: "application/pdf",
                    filename: "spec.pdf",
                  },
                ],
              },
            },
          ],
        },
      ];

      const step2Res = await model.doGenerate({
        prompt: step2Prompt,
        tools,
        headers: { "x-opencode-session-id": "oc_ses_1" },
      });

      expect(step2Res.finishReason.unified).toBe("stop");
      const finalText = step2Res.content
        .filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text")
        .map((c) => c.text)
        .join("");
      expect(finalText).toContain("blocks=[text,image,resource]");
      expect(finalText).toContain("text=HelloFromOpenCode");
    } finally {
      await h.cleanup();
    }
  });

  it("coalesces parallel OpenCode MCP tool calls over HTTP MCP transport", async () => {
    const h = createHarness({
      env: { ...process.env, MOCK_AGY_HTTP_MCP: "1" },
    });
    try {
      const model = new AgyAcpLanguageModel("gemini-4-carbon", h.manager);
      const tools = [
        {
          type: "function" as const,
          name: "alpha",
          inputSchema: { type: "object", properties: { key: { type: "string" } } },
        },
        {
          type: "function" as const,
          name: "beta",
          inputSchema: { type: "object", properties: { key: { type: "string" } } },
        },
      ];

      const prompt1: LanguageModelV3Prompt = [
        { role: "user", content: [{ type: "text", text: "[SCENARIO:parallel_mcp_tools]" }] },
      ];

      const step1 = await model.doGenerate({
        prompt: prompt1,
        tools,
        headers: { "x-opencode-session-id": "oc_parallel_1" },
      });

      const toolCalls = step1.content.filter(
        (c): c is Extract<typeof c, { type: "tool-call" }> => c.type === "tool-call",
      );
      expect(toolCalls).toHaveLength(2);
      expect(toolCalls.map((t) => t.toolName).sort()).toEqual(["alpha", "beta"]);

      const prompt2: LanguageModelV3Prompt = [
        ...prompt1,
        {
          role: "assistant",
          content: toolCalls.map((tc) => ({
            type: "tool-call" as const,
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            input: JSON.parse(tc.input),
          })),
        },
        {
          role: "tool",
          content: toolCalls.map((tc) => ({
            type: "tool-result" as const,
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            output: {
              type: "text" as const,
              value: tc.toolName === "alpha" ? "valA" : "valB",
            },
          })),
        },
      ];

      const step2 = await model.doGenerate({
        prompt: prompt2,
        tools,
        headers: { "x-opencode-session-id": "oc_parallel_1" },
      });

      const text = step2.content
        .filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text")
        .map((c) => c.text)
        .join("");
      expect(text).toContain("Parallel results: A=valA, B=valB");
    } finally {
      await h.cleanup();
    }
  });

  it("self-resumes crashed ACP workers via session/resume (#36181) and injects <conversation-checkpoint> on rewinds/forks", async () => {
    const h = createHarness();
    try {
      const model = new AgyAcpLanguageModel("gemini-4-hydrogen", h.manager);

      const turn1Messages: LanguageModelV3Prompt = [
        {
          role: "user",
          content: [{ type: "text", text: "Hello turn 1 [SCENARIO:crash_after_turn_1]" }],
        },
      ];

      const res1 = await model.doGenerate({
        prompt: turn1Messages,
        headers: {
          "x-opencode-session-id": "oc_resume_1",
          "x-agy-tier": "xhigh",
          "x-opencode-agy-agent": "plan",
        },
      });
      const text1 = res1.content
        .filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text")
        .map((c) => c.text)
        .join("");
      expect(text1).toContain("model=gemini-4-hydrogen");
      expect(text1).toContain("thought=xhigh");
      expect(text1).toContain("mode=plan");
      expect(res1.usage.inputTokens.total).toBe(100);
      expect(res1.usage.inputTokens.cacheRead).toBe(25);
      expect(res1.usage.outputTokens.reasoning).toBe(12);

      // Wait for mock worker to exit(1)
      await new Promise((r) => setTimeout(r, 60));

      // Turn 2 extends history strictly -> spawns replacement worker, calls `session/resume`, and sends ONLY delta!
      const turn2Messages: LanguageModelV3Prompt = [
        ...turn1Messages,
        { role: "assistant", content: [{ type: "text", text: text1 }] },
        { role: "user", content: [{ type: "text", text: "Delta message turn 2" }] },
      ];

      const res2 = await model.doGenerate({
        prompt: turn2Messages,
        headers: { "x-opencode-session-id": "oc_resume_1" },
      });
      const text2 = res2.content
        .filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text")
        .map((c) => c.text)
        .join("");
      expect(text2).toContain("resumed=true");
      expect(text2).toContain("Delta message turn 2");
      expect(text2).not.toContain("Hello turn 1");

      // Rewind / edited Turn 1 -> history diverges -> creates fresh session with <conversation-checkpoint>!
      const rewoundMessages: LanguageModelV3Prompt = [
        { role: "user", content: [{ type: "text", text: "Edited first message" }] },
        { role: "assistant", content: [{ type: "text", text: "Edited assistant reply" }] },
        { role: "user", content: [{ type: "text", text: "Post-rewind follow up" }] },
      ];

      const res3 = await model.doGenerate({
        prompt: rewoundMessages,
        headers: { "x-opencode-session-id": "oc_resume_1" },
      });
      const text3 = res3.content
        .filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text")
        .map((c) => c.text)
        .join("");
      expect(text3).toContain("resumed=false");
      expect(text3).toContain("<conversation-checkpoint>");
      expect(text3).toContain("Edited first message");
      expect(text3).toContain("Post-rewind follow up");
    } finally {
      await h.cleanup();
    }
  });

  it("automatically recovers from Claude 400 Invalid signature errors on resumed sessions (#28889)", async () => {
    const h = createHarness();
    try {
      const model = new AgyAcpLanguageModel("claude-sonnet-5-5", h.manager);

      const m1: LanguageModelV3Prompt = [
        { role: "user", content: [{ type: "text", text: "Initial Claude question [SCENARIO:crash_after_turn_1]" }] },
      ];
      const r1 = await model.doGenerate({
        prompt: m1,
        headers: { "x-opencode-session-id": "oc_claude_sig" },
      });
      const reply1 = r1.content
        .filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text")
        .map((c) => c.text)
        .join("");

      await new Promise((r) => setTimeout(r, 60));

      // Turn 2 resumes into a corrupted thinking signature (`wasResumed === true` triggers 400 Invalid signature)
      const m2: LanguageModelV3Prompt = [
        ...m1,
        {
          role: "assistant",
          content: [
            { type: "reasoning", text: "Old reasoning with stale signature" },
            { type: "text", text: reply1 },
          ],
        },
        {
          role: "user",
          content: [{ type: "text", text: "Follow up [SCENARIO:invalid_signature_on_resume]" }],
        },
      ];

      const r2 = await model.doGenerate({
        prompt: m2,
        headers: { "x-opencode-session-id": "oc_claude_sig" },
      });
      const reply2 = r2.content
        .filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text")
        .map((c) => c.text)
        .join("");

      expect(reply2).toContain("Recovered via fresh session (hasCheckpoint=true)");
    } finally {
      await h.cleanup();
    }
  });

  it("supports hybrid mode with ctx.permission.assert, diff rawOutput synthesis (#36138), and unsettled tool settlement (#28450)", async () => {
    const assertedPermissions: OpenCodeV2PermissionAssertInput[] = [];
    const h = createHarness({
      toolMode: "hybrid",
      onPermissionAssert: async (input) => {
        assertedPermissions.push(input);
      },
    });

    try {
      const model = new AgyAcpLanguageModel("gemini-4-carbon", h.manager);
      const res = await model.doGenerate({
        prompt: [
          { role: "user", content: [{ type: "text", text: "[SCENARIO:hybrid_native_tools]" }] },
        ],
        headers: { "x-opencode-session-id": "oc_hybrid_1", "x-opencode-agy-agent": "code" },
      });

      expect(assertedPermissions).toHaveLength(1);
      expect(assertedPermissions[0]!.action).toBe("shell");
      expect(assertedPermissions[0]!.resources).toEqual(["echo hybrid"]);

      const toolCalls = res.content.filter((c) => c.type === "tool-call");
      const toolResults = res.content.filter(
        (c): c is Extract<typeof c, { type: "tool-result" }> => c.type === "tool-result",
      );
      expect(toolCalls).toHaveLength(2);
      // Both `native_edit_1` AND unsettled `native_unsettled_1` (#28450) must have terminal `tool-result`s!
      expect(toolResults).toHaveLength(2);

      const editResult = toolResults.find((r) => r.toolCallId === "native_edit_1");
      expect(editResult?.result).toEqual({
        diffs: [{ path: "src/demo.ts", oldText: "const a = 1;", newText: "const a = 2;" }],
      });

      const unsettledResult = toolResults.find((r) => r.toolCallId === "native_unsettled_1");
      expect(unsettledResult?.result).toEqual({
        locations: [{ path: "README.md", line: 1 }],
      });
    } finally {
      await h.cleanup();
    }
  });

  it("detects silent 502 stalls via SQLite watchdog (#33596), surfaces swallowed 429s, ignores superseded 429s, and cleans up auxiliary .db files", async () => {
    const h = createHarness({ watchdogTimeoutMs: 120 });
    try {
      const model = new AgyAcpLanguageModel("gemini-4-carbon", h.manager);

      // 1. Silent 502 hang -> watchdog triggers within ~120ms and throws AgyTurnOutcomeError(502)
      let caught502: unknown;
      try {
        await model.doGenerate({
          prompt: [
            { role: "user", content: [{ type: "text", text: "[SCENARIO:silent_502_hang]" }] },
          ],
          headers: { "x-opencode-session-id": "oc_502" },
        });
      } catch (err) {
        caught502 = err;
      }
      expect(caught502).toBeInstanceOf(AgyTurnOutcomeError);
      expect((caught502 as AgyTurnOutcomeError).statusCode).toBe(502);

      // 2. Swallowed 429 empty turn -> surfaces exact 429 + retryAfterMs
      let caught429: unknown;
      try {
        await model.doGenerate({
          prompt: [
            { role: "user", content: [{ type: "text", text: "[SCENARIO:swallowed_429]" }] },
          ],
          headers: { "x-opencode-session-id": "oc_429" },
        });
      } catch (err) {
        caught429 = err;
      }
      expect(caught429).toBeInstanceOf(AgyTurnOutcomeError);
      expect((caught429 as AgyTurnOutcomeError).statusCode).toBe(429);
      expect((caught429 as AgyTurnOutcomeError).retryAfterMs).toBe(2000);

      // 3. Transient superseded 429 -> succeeds without error
      const okRes = await model.doGenerate({
        prompt: [
          {
            role: "user",
            content: [{ type: "text", text: "[SCENARIO:superseded_429_then_ok]" }],
          },
        ],
        headers: { "x-opencode-session-id": "oc_superseded" },
      });
      expect(okRes.content).toEqual([
        { type: "text", text: "Recovered cleanly after internal retry." },
      ]);

      // 4. Stateless auxiliary call (`kind: "title"`) cleans up its `.db` file immediately
      const auxGeminiDir = makeTempDir();
      const auxPool = new AcpClientPool();
      const auxManager = new AgySessionManager({
        pool: auxPool,
        catalog: new AgyCatalogStore(),
        getSpawnConfig: () => ({ binaryPath: MOCK_AGY_PATH, geminiDir: auxGeminiDir }),
        getToolMode: () => "opencode",
        getWatchdogTimeoutMs: () => 5_000,
      });
      try {
        const auxModel = new AgyAcpLanguageModel("gemini-3.5-flash-lite", auxManager);
        const titleRes = await auxModel.doGenerate({
          prompt: [{ role: "user", content: [{ type: "text", text: "Generate title" }] }],
          headers: {
            "x-opencode-session-id": "oc_main",
            "x-opencode-agy-kind": "title",
          },
        });
        expect(titleRes.finishReason.unified).toBe("stop");
        const convDir = resolveConversationsDir({ geminiDir: auxGeminiDir });
        if (existsSync(convDir)) {
          expect(readdirSync(convDir)).toEqual([]);
        }
      } finally {
        await auxManager.dispose();
        await auxPool.dispose();
      }
    } finally {
      await h.cleanup();
    }
  });
});
