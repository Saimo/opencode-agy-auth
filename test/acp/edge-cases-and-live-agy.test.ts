import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hasLocalAgyAuthHint, probeAgyAuthAndCatalog } from "../../src/acp/auth";
import { AgyCatalogStore } from "../../src/acp/catalog";
import { AcpClientPool, resolveAgyBinaryPath, resolveConversationsDir } from "../../src/acp/client";
import { AgyAcpLanguageModel } from "../../src/acp/language-model";
import { OpenCodeMcpBridge } from "../../src/acp/mcp-bridge";
import {
  AgySessionManager,
  buildPromptBlocksFromMessages,
  mapNativeToolPermissionChecks,
} from "../../src/acp/sessions";
import * as turnOutcomeModule from "../../src/acp/turn-outcome";
import { AcpRpcError } from "../../src/acp/types";
import { setupOpenCodeV2 } from "../../src/plugin/v2";
import { executeAgyWebSearch } from "../../src/plugin/v2-websearch";

const MOCK_AGY_PATH = resolve(__dirname, "../fixtures/mock-agy-acp.mjs");
const REAL_AGY_PATH = join(homedir(), ".local", "bin", "agy");

describe("acp edge cases and boundary conditions", () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "agy-edge-test-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const d of tempDirs.splice(0, tempDirs.length)) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("handles empty websearch queries without spawning ACP workers", async () => {
    const pool = new AcpClientPool();
    try {
      const empty = await executeAgyWebSearch({
        query: "   ",
        pool,
        spawnConfig: { binaryPath: "/nonexistent/agy" },
      });
      expect(empty).toEqual([]);
    } finally {
      await pool.dispose();
    }
  });

  it("converts empty and multimodal LanguageModelV3Prompt inputs into valid ACP content blocks", () => {
    expect(buildPromptBlocksFromMessages([])).toEqual([
      { type: "text", text: "Continue." },
    ]);

    const capabilities = {
      promptCapabilities: { image: true, embeddedContext: true },
    };

    const blocks = buildPromptBlocksFromMessages(
      [
        {
          role: "user",
          content: [
            { type: "text", text: "Inspect these files" },
            {
              type: "file",
              filename: "diagram.png",
              mediaType: "image/png",
              data: new Uint8Array([137, 80, 78, 71]),
            },
            {
              type: "file",
              filename: "notes.txt",
              mediaType: "text/plain",
              data: `data:text/plain;base64,${Buffer.from("hello notes").toString("base64")}`,
            },
            {
              type: "file",
              filename: "doc.pdf",
              mediaType: "application/pdf",
              data: Buffer.from("%PDF-1.7").toString("base64"),
            },
            {
              type: "file",
              filename: "remote.png",
              mediaType: "image/png",
              data: new URL("https://example.com/remote.png"),
            },
          ],
        },
      ],
      capabilities,
    );

    expect(blocks).toEqual([
      { type: "text", text: "Inspect these files" },
      {
        type: "image",
        mimeType: "image/png",
        data: Buffer.from([137, 80, 78, 71]).toString("base64"),
      },
      {
        type: "resource",
        resource: {
          uri: "attachment:///notes.txt",
          mimeType: "text/plain",
          text: "hello notes",
        },
      },
      {
        type: "resource",
        resource: {
          uri: "attachment:///doc.pdf",
          mimeType: "application/pdf",
          blob: Buffer.from("%PDF-1.7").toString("base64"),
        },
      },
      {
        type: "resource_link",
        uri: "https://example.com/remote.png",
        name: "remote.png",
        mimeType: "image/png",
      },
    ]);
  });

  it("enforces path boundary checks accurately in mapNativeToolPermissionChecks", () => {
    // Sibling prefix `/workspace/proj-evil` MUST be flagged as `external_directory`
    const siblingChecks = mapNativeToolPermissionChecks(
      {
        sessionId: "s1",
        toolCall: {
          toolCallId: "t1",
          title: "edit_file",
          kind: "edit",
          locations: [{ path: "/workspace/proj-evil/secret.ts" }],
        },
        options: [],
      },
      "/workspace/proj",
    );
    expect(siblingChecks.map((c) => c.action)).toEqual(["external_directory", "edit"]);

    // File named `..hidden.txt` INSIDE `/workspace/proj` MUST NOT be misclassified as external
    const dotDotInsideChecks = mapNativeToolPermissionChecks(
      {
        sessionId: "s1",
        toolCall: {
          toolCallId: "t2",
          title: "edit_file",
          kind: "edit",
          locations: [{ path: "/workspace/proj/..hidden.txt" }],
        },
        options: [],
      },
      "/workspace/proj",
    );
    expect(dotDotInsideChecks.map((c) => c.action)).toEqual(["edit"]);
  });

  it("handles pre-aborted signals, hybrid permission denials, and relative binaryPath with custom cwd", async () => {
    const geminiDir = makeTempDir();
    const customCwd = makeTempDir();
    const pool = new AcpClientPool();
    const catalog = new AgyCatalogStore();

    // Relative binaryPath must resolve to absolute before posix_spawn changes cwd
    expect(resolveAgyBinaryPath({ binaryPath: "./test/fixtures/mock-agy-acp.mjs" })).toBe(
      MOCK_AGY_PATH,
    );

    const manager = new AgySessionManager({
      pool,
      catalog,
      getSpawnConfig: () => ({
        binaryPath: "./test/fixtures/mock-agy-acp.mjs",
        geminiDir,
        cwd: customCwd,
      }),
      getToolMode: () => "hybrid",
      getWatchdogTimeoutMs: () => 5_000,
      permission: {
        assert: async () => {
          throw new Error("User denied shell execution");
        },
      },
    });

    try {
      const model = new AgyAcpLanguageModel("gemini-4-carbon", manager);

      // 1. Pre-aborted AbortSignal rejects cleanly without wedging session lock
      await expect(
        model.doGenerate({
          prompt: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
          headers: { "x-opencode-session-id": "ses_abort_then_ok" },
          abortSignal: AbortSignal.abort(new Error("ImmediateAbort")),
        }),
      ).rejects.toThrow("ImmediateAbort");

      // 2. Subsequent call on the same session succeeds AND hybrid permission denial sends reject_once (`shellAllowed=false`)
      const res = await model.doGenerate({
        prompt: [
          { role: "user", content: [{ type: "text", text: "[SCENARIO:hybrid_native_tools]" }] },
        ],
        headers: { "x-opencode-session-id": "ses_abort_then_ok" },
      });

      const text = res.content
        .filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text")
        .map((c) => c.text)
        .join("");
      expect(text).toContain("Hybrid finished (shellAllowed=false)");
    } finally {
      await manager.dispose();
      await pool.dispose();
    }
  });

  it("deduplicates agy 1.5.8 dual configOptions + availableModels payloads and self-heals polluted disk caches", async () => {
    const geminiDir = makeTempDir();
    const cacheDir = makeTempDir();
    const pool = new AcpClientPool();

    try {
      const probe = await probeAgyAuthAndCatalog(pool, {
        binaryPath: MOCK_AGY_PATH,
        geminiDir,
        env: { ...process.env, MOCK_AGY_158_CATALOG: "1" },
      });
      expect(probe.state).toBe("ready");
      const ids = probe.catalog!.models.map((m) => m.id);
      expect(ids).toEqual([
        "gemini-4-carbon",
        "gemini-4-argon",
        "gemini-4-hydrogen",
        "gemini-pro-orchestrator",
        "gemini-pro-orchestrator-argon",
        "gemini-3.8-flash",
        "claude-opus-5-5",
        "claude-sonnet-5-5",
        "gpt-oss-120b-medium",
      ]);

      // Verify probe only issued 8 set_config_option RPCs (9 base models minus 1 initial) instead of 27
      const lease = await pool.acquire({
        binaryPath: MOCK_AGY_PATH,
        geminiDir,
        includeDefaultCustomizations: false,
        env: { ...process.env, MOCK_AGY_158_CATALOG: "1" },
      });
      try {
        const s = await lease.connection.createSession({
          cwd: geminiDir,
          mcpServers: [],
          _meta: { disableBuiltInTools: true },
        });
        let echoed = "";
        const unsub = lease.connection.onSessionUpdate(s.sessionId, (n) => {
          if (n.update.sessionUpdate === "agent_message_chunk" && n.update.content.type === "text") {
            echoed += n.update.content.text;
          }
        });
        await lease.connection.prompt({
          sessionId: s.sessionId,
          prompt: [{ type: "text", text: "[SCENARIO:echo_mcp_tools]" }],
        });
        unsub();
        // 8 probes + 1 restoreInitialModel = 9 (vs 28 when polluted!)
        expect(JSON.parse(echoed).setConfigCallCount).toBeLessThanOrEqual(9);
      } finally {
        lease.release();
      }

      // Seed a polluted disk cache containing `<base>-<tier>` duplicates and verify self-healing
      const diskCacheFile = join(cacheDir, "agy-acp-catalog.json");
      writeFileSync(
        diskCacheFile,
        JSON.stringify({
          version: 1,
          updatedAt: Date.now(),
          defaultModelId: "gemini-4-carbon-medium",
          models: [
            { id: "gemini-4-carbon", name: "Gemini 4 Carbon", thoughtLevels: ["low", "medium"] },
            { id: "gemini-4-carbon-low", name: "Gemini 4 Carbon (Low)", thoughtLevels: ["low"] },
            { id: "gemini-4-carbon-high", name: "Gemini 4 Carbon (High)", thoughtLevels: ["high"] },
            { id: "gpt-oss-120b-medium", name: "GPT-OSS 120B (Medium)", thoughtLevels: [] },
          ],
        }),
        "utf8",
      );

      const store = new AgyCatalogStore({ cacheDir });
      expect(store.listEntries().map((e) => e.id)).toEqual([
        "gemini-4-carbon",
        "gpt-oss-120b-medium",
      ]);
      expect(store.defaultModel).toBe("gemini-4-carbon");
      expect(store.getEntry("gemini-4-carbon")?.thoughtLevels).toEqual(["low", "medium", "high"]);
      expect(store.resolveAcpModelAndThoughtLevel("gemini-4-carbon-high", undefined)).toMatchObject({
        modelId: "gemini-4-carbon",
        thoughtLevel: "high",
      });

      const healedJson = JSON.parse(readFileSync(diskCacheFile, "utf8")) as {
        models: Array<{ id: string }>;
      };
      expect(healedJson.models.map((m) => m.id)).toEqual([
        "gemini-4-carbon",
        "gpt-oss-120b-medium",
      ]);
    } finally {
      await pool.dispose();
    }
  });

  it("selects gemini-3.8-flash with low thinking on agy 1.5.8 websearch and falls back to gemini-4-argon on 429", async () => {
    const geminiDir = makeTempDir();
    const pool = new AcpClientPool();

    try {
      // 1. Primary agy 1.5.8 selection (`gemini-3.8-flash` + `thought=low`, NOT flagship `gemini-4-carbon`)
      const res1 = await executeAgyWebSearch({
        query: "OpenCode 1.5.8 websearch",
        pool,
        spawnConfig: {
          binaryPath: MOCK_AGY_PATH,
          geminiDir,
          env: { ...process.env, MOCK_AGY_158_CATALOG: "1" },
        },
      });
      expect(res1[0]!.content).toContain("Grounded answer from gemini-3.8-flash (thought=low");

      // 2. When `gemini-3.8-flash` returns 429 on agy 1.5.8, falls back to `gemini-4-argon` (`thought=low`)
      const pool2 = new AcpClientPool();
      try {
        const res2 = await executeAgyWebSearch({
          query: "OpenCode 1.5.8 fallback",
          pool: pool2,
          spawnConfig: {
            binaryPath: MOCK_AGY_PATH,
            geminiDir,
            env: {
              ...process.env,
              MOCK_AGY_158_CATALOG: "1",
              MOCK_AGY_WEBSEARCH_429_FIRST: "1",
            },
          },
        });
        expect(res2[0]!.content).toContain("Grounded answer from gemini-4-argon (thought=low");
      } finally {
        await pool2.dispose();
      }
    } finally {
      await pool.dispose();
    }
  });

  it("supports stateless LLM.generateObject forced function tool calls and cleans up .db files", async () => {
    const geminiDir = makeTempDir();
    const pool = new AcpClientPool();
    const manager = new AgySessionManager({
      pool,
      catalog: new AgyCatalogStore(),
      getSpawnConfig: () => ({ binaryPath: MOCK_AGY_PATH, geminiDir }),
      getToolMode: () => "opencode",
      getWatchdogTimeoutMs: () => 5_000,
    });

    try {
      const model = new AgyAcpLanguageModel("gemini-4-carbon", manager);
      const gen = await model.doGenerate({
        prompt: [
          { role: "user", content: [{ type: "text", text: "[SCENARIO:generate_object]" }] },
        ],
        tools: [
          {
            type: "function",
            name: "generate_object",
            description: "Emit structured JSON output",
            inputSchema: {
              type: "object",
              properties: { title: { type: "string" } },
              required: ["title"],
            },
          },
          {
            type: "function",
            name: "unused_other_tool",
            inputSchema: { type: "object", properties: {} },
          },
        ],
        toolChoice: { type: "tool", toolName: "generate_object" },
        headers: {
          "x-opencode-session-id": "ses_parent_untouched",
          "x-opencode-agy-kind": "generate",
        },
      });

      expect(gen.finishReason.unified).toBe("tool-calls");
      const tc = gen.content.find(
        (c): c is Extract<typeof c, { type: "tool-call" }> => c.type === "tool-call",
      );
      expect(tc).toBeDefined();
      expect(tc!.toolName).toBe("generate_object");
      expect(tc!.providerExecuted).toBe(false);
      expect(JSON.parse(tc!.input)).toEqual({
        title: "ACP Migration Verified",
        hasForcedDirective: true,
        exposedToolCount: 1,
      });

      const convDir = resolveConversationsDir({ geminiDir });
      if (existsSync(convDir)) {
        expect(readdirSync(convDir)).toEqual([]);
      }
    } finally {
      await manager.dispose();
      await pool.dispose();
    }
  });

  it("filters overlapping tools in hybrid mode, updates systemAppend on mid-session systemHash change, skips Turn 1 tool deltas, and enforces toolChoice: none", async () => {
    const geminiDir = makeTempDir();
    const pool = new AcpClientPool();
    const manager = new AgySessionManager({
      pool,
      catalog: new AgyCatalogStore(),
      getSpawnConfig: () => ({ binaryPath: MOCK_AGY_PATH, geminiDir, cwd: geminiDir }),
      getToolMode: () => "hybrid",
      getWatchdogTimeoutMs: () => 5_000,
    });

    const mixedTools = [
      { type: "function" as const, name: "bash", inputSchema: { type: "object" } },
      { type: "function" as const, name: "read", inputSchema: { type: "object" } },
      { type: "function" as const, name: "edit", inputSchema: { type: "object" } },
      { type: "function" as const, name: "glob", inputSchema: { type: "object" } },
      { type: "function" as const, name: "grep", inputSchema: { type: "object" } },
      { type: "function" as const, name: "task", inputSchema: { type: "object" } },
      { type: "function" as const, name: "skill", inputSchema: { type: "object" } },
      { type: "function" as const, name: "todowrite", inputSchema: { type: "object" } },
      { type: "function" as const, name: "mcp_github_pr", inputSchema: { type: "object" } },
    ];

    try {
      const model = new AgyAcpLanguageModel("gemini-4-carbon", manager);

      // Turn 1 (`hybrid` mode, `system` = "Agent: Code")
      const t1 = await model.doGenerate({
        prompt: [
          { role: "system", content: "Agent: Code" },
          { role: "user", content: [{ type: "text", text: "[SCENARIO:echo_mcp_tools]" }] },
        ],
        tools: mixedTools,
        headers: { "x-opencode-session-id": "ses_hybrid_sys" },
      });
      const t1Text = t1.content
        .filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text")
        .map((c) => c.text)
        .join("");
      const t1Info = JSON.parse(t1Text);
      expect(t1Info.disableBuiltInTools).toBe(false);
      expect(t1Info.systemAppend).toBe("Agent: Code");
      expect(t1Info.mcpTools).toEqual(["task", "skill", "todowrite", "mcp_github_pr"]);

      // Turn 2: `system` mutates to `"Agent: Plan"` + Turn 1 history includes `role: "tool"` before `User2`
      const t2 = await model.doGenerate({
        prompt: [
          { role: "system", content: "Agent: Plan" },
          { role: "user", content: [{ type: "text", text: "[SCENARIO:echo_mcp_tools]" }] },
          {
            role: "assistant",
            content: [
              {
                type: "tool-call",
                toolCallId: "native_1",
                toolName: "edit_file",
                input: {},
                providerExecuted: true,
              },
            ],
          },
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: "native_1",
                toolName: "edit_file",
                output: { type: "text", value: "TURN1_TOOL_OUTPUT_DO_NOT_RESEND" },
              },
            ],
          },
          { role: "assistant", content: [{ type: "text", text: t1Text }] },
          { role: "user", content: [{ type: "text", text: "Second user question" }] },
        ],
        tools: mixedTools,
        headers: { "x-opencode-session-id": "ses_hybrid_sys" },
      });
      const t2Text = t2.content
        .filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text")
        .map((c) => c.text)
        .join("");
      expect(t2Text).toContain("resumed=true");
      expect(t2Text).toContain("sys=Agent: Plan");
      expect(t2Text).not.toContain("TURN1_TOOL_OUTPUT_DO_NOT_RESEND");

      // Turn 3: `toolChoice: { type: "none" }` disables BOTH built-in Cortex tools and MCP tools
      const t3 = await model.doGenerate({
        prompt: [
          { role: "system", content: "Agent: Plan" },
          { role: "user", content: [{ type: "text", text: "[SCENARIO:echo_mcp_tools]" }] },
        ],
        tools: mixedTools,
        toolChoice: { type: "none" },
        headers: { "x-opencode-session-id": "ses_hybrid_sys" },
      });
      const t3Info = JSON.parse(
        t3.content
          .filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text")
          .map((c) => c.text)
          .join(""),
      );
      expect(t3Info.disableBuiltInTools).toBe(true);
      expect(t3Info.mcpTools).toEqual([]);
    } finally {
      await manager.dispose();
      await pool.dispose();
    }
  });

  it("handles mid-stream abort during 25ms MCP batch coalescing + straggler tools/call without leaking parkedCalls or batchWaiters, and preserves split multi-byte UTF-8", async () => {
    // 1. Direct unit check on OpenCodeMcpBridge waiter & turn-gate cleanup
    const bridge = new OpenCodeMcpBridge();
    await bridge.start();
    try {
      const waiterAbort = new AbortController();
      void bridge.waitForNextToolBatch(waiterAbort.signal);
      expect(bridge.batchWaiterCount).toBe(1);
      waiterAbort.abort();
      expect(bridge.batchWaiterCount).toBe(0);

      bridge.endTurn("Aborted test.");
      expect(bridge.parkedCount).toBe(0);
    } finally {
      await bridge.close();
    }

    // 2. Full child-process mid-coalesce abort race + Turn 2 clean continuation + split UTF-8 stream
    const geminiDir = makeTempDir();
    const pool = new AcpClientPool();
    const manager = new AgySessionManager({
      pool,
      catalog: new AgyCatalogStore(),
      getSpawnConfig: () => ({ binaryPath: MOCK_AGY_PATH, geminiDir, cwd: geminiDir }),
      getToolMode: () => "opencode",
      getWatchdogTimeoutMs: () => 5_000,
    });

    try {
      const model = new AgyAcpLanguageModel("gemini-4-carbon", manager);
      const ac = new AbortController();
      setTimeout(() => ac.abort(new Error("MidCoalesceAbort")), 10);

      await expect(
        model.doGenerate({
          prompt: [
            {
              role: "user",
              content: [{ type: "text", text: "[SCENARIO:abort_race_parallel_mcp]" }],
            },
          ],
          tools: [
            { type: "function", name: "alpha", inputSchema: { type: "object" } },
            { type: "function", name: "beta", inputSchema: { type: "object" } },
          ],
          headers: { "x-opencode-session-id": "ses_race" },
          abortSignal: ac.signal,
        }),
      ).rejects.toThrow("MidCoalesceAbort");

      // Wait past the 25ms straggler arrival window, then run Turn 2 with split multi-byte UTF-8
      await new Promise((r) => setTimeout(r, 40));

      const turn2 = await model.doGenerate({
        prompt: [
          { role: "user", content: [{ type: "text", text: "[SCENARIO:split_utf8_stream]" }] },
        ],
        tools: [
          { type: "function", name: "alpha", inputSchema: { type: "object" } },
          { type: "function", name: "beta", inputSchema: { type: "object" } },
        ],
        headers: { "x-opencode-session-id": "ses_race" },
      });

      expect(turn2.finishReason.unified).toBe("stop");
      expect(turn2.content.some((c) => c.type === "tool-call")).toBe(false);
      const utf8Text = turn2.content
        .filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text")
        .map((c) => c.text)
        .join("");
      expect(utf8Text).toBe("UTF8_OK: 🚀─日本語─äöü─🎉");
      expect(utf8Text).not.toContain("\uFFFD");
    } finally {
      await manager.dispose();
      await pool.dispose();
    }
  });

  it("subscribes strictly to valid OpenCode v2 credential events and maps headless -32603 auth errors to HTTP 401", async () => {
    let subscribedTypes: readonly string[] = [];
    const cleanup = await setupOpenCodeV2({
      options: { skipInitialProbe: true, webSearch: false },
      integration: { transform: vi.fn(async () => {}) },
      provider: { transform: vi.fn(async () => {}) },
      session: { hook: vi.fn(async () => {}) },
      event: {
        subscribe({ types }) {
          subscribedTypes = types;
          return (async function* () {})();
        },
      },
    });
    await cleanup?.();

    expect(subscribedTypes).toEqual(["credential.updated", "credential.switched"]);

    const headlessErr = new AcpRpcError({
      code: -32603,
      message:
        "Internal error: No browser is available in this environment. Run `agy acp --login` to authenticate.",
    });
    expect(headlessErr.status).toBe(401);
    expect(headlessErr.statusCode).toBe(401);
    expect(headlessErr.isRetryable).toBe(false);

    const rateErr = new AcpRpcError({
      code: -32603,
      status: 429,
      retryAfterMs: 2500,
      message: "Rate limited",
    });
    expect(rateErr.statusCode).toBe(429);
    expect(rateErr.isRetryable).toBe(true);
    expect(rateErr.responseHeaders).toEqual({
      "retry-after": "3",
      "retry-after-ms": "2500",
    });
  });

  it("aborts underlying ACP turns and guards closed ReadableStream controllers when stream.cancel() is called directly", async () => {
    const geminiDir = makeTempDir();
    const pool = new AcpClientPool();
    const manager = new AgySessionManager({
      pool,
      catalog: new AgyCatalogStore(),
      getSpawnConfig: () => ({ binaryPath: MOCK_AGY_PATH, geminiDir, cwd: geminiDir }),
      getToolMode: () => "opencode",
      getWatchdogTimeoutMs: () => 5_000,
    });

    try {
      const model = new AgyAcpLanguageModel("gemini-4-carbon", manager);

      // 1. Mid-stream reader.cancel() WITHOUT passing/aborting callOptions.abortSignal
      const { stream: s1 } = await model.doStream({
        prompt: [
          {
            role: "user",
            content: [{ type: "text", text: "[SCENARIO:slow_streaming_cancel]" }],
          },
        ],
        headers: { "x-opencode-session-id": "ses_stream_cancel" },
      });

      const reader = s1.getReader();
      let sawFirstDelta = false;
      while (!sawFirstDelta) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.type === "text-delta" && value.delta.includes("first_stream_chunk")) {
          sawFirstDelta = true;
        }
      }
      expect(sawFirstDelta).toBe(true);

      // Cancelling the reader directly must send session/cancel, guard against mock's
      // late_chunk_after_cancel, and resolve without throwing Controller is already closed!
      await expect(reader.cancel("Consumer stopped reading")).resolves.toBeUndefined();
      reader.releaseLock();

      // 2. Immediate stream.cancel() right after doStream() (both stateful and stateless)
      const { stream: sImmediate } = await model.doStream({
        prompt: [
          {
            role: "user",
            content: [{ type: "text", text: "[SCENARIO:slow_streaming_cancel]" }],
          },
        ],
        headers: { "x-opencode-session-id": "ses_stream_cancel" },
      });
      await expect(sImmediate.cancel("Immediate cancel")).resolves.toBeUndefined();

      const { stream: sStatelessImmediate } = await model.doStream({
        prompt: [{ role: "user", content: [{ type: "text", text: "Title prompt" }] }],
        headers: {
          "x-opencode-session-id": "ses_stream_cancel",
          "x-opencode-agy-kind": "title",
        },
      });
      await expect(sStatelessImmediate.cancel("Stateless cancel")).resolves.toBeUndefined();

      // 2b. Breaking early out of `for await (const part of stream)` (invokes Web Streams cancel())
      const { stream: sAsyncIter } = await model.doStream({
        prompt: [
          {
            role: "user",
            content: [{ type: "text", text: "[SCENARIO:slow_streaming_cancel]" }],
          },
        ],
        headers: { "x-opencode-session-id": "ses_stream_cancel" },
      });
      let iterChunks = 0;
      for await (const part of sAsyncIter) {
        if (part.type === "text-delta") {
          iterChunks += 1;
          break;
        }
      }
      expect(iterChunks).toBe(1);

      // 3. Subsequent turn on the same session succeeds AND confirms session/cancel reached ACP worker!
      const followUp = await model.doGenerate({
        prompt: [
          { role: "user", content: [{ type: "text", text: "[SCENARIO:echo_mcp_tools]" }] },
        ],
        headers: { "x-opencode-session-id": "ses_stream_cancel" },
      });
      const echoed = JSON.parse(
        followUp.content
          .filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text")
          .map((c) => c.text)
          .join(""),
      ) as { cancelledSessionCount: number };
      expect(echoed.cancelledSessionCount).toBeGreaterThanOrEqual(1);

      // 4. Buffered Pause-and-Yield MCP step: runPromise buffers tool-call + finish and settles
      // BEFORE consumer finishes reading; breaking out of `for await` on `tool-call` must STILL
      // abort the parked ACP turn immediately (without waiting for a subsequent turn to clean up)!
      const { stream: sParked } = await model.doStream({
        prompt: [
          { role: "user", content: [{ type: "text", text: "[SCENARIO:single_mcp_tool]" }] },
        ],
        tools: [
          { type: "function", name: "read_local_note", inputSchema: { type: "object" } },
        ],
        headers: { "x-opencode-session-id": "ses_parked_cancel" },
      });
      // Give runPromise time to enqueue tool-call + finish and close the controller
      await new Promise((r) => setTimeout(r, 40));

      let sawToolCall = false;
      for await (const part of sParked) {
        if (part.type === "tool-call") {
          sawToolCall = true;
          break;
        }
      }
      expect(sawToolCall).toBe(true);

      // Inspect cancelledSessionCount via a DIFFERENT session on the same pooled worker so we verify
      // cancel() itself sent session/cancel rather than a follow-up turn on ses_parked_cancel!
      const observerTurn = await model.doGenerate({
        prompt: [
          { role: "user", content: [{ type: "text", text: "[SCENARIO:echo_mcp_tools]" }] },
        ],
        headers: { "x-opencode-session-id": "ses_observer_check" },
      });
      const observerEcho = JSON.parse(
        observerTurn.content
          .filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text")
          .map((c) => c.text)
          .join(""),
      ) as { cancelledSessionCount: number };
      expect(observerEcho.cancelledSessionCount).toBeGreaterThan(echoed.cancelledSessionCount);

      // 5. Caller abort with auth-like wording in reason must NOT trigger onAuthFailure or rewrite to -32000
      const authFailureSpy = vi.fn();
      const abortMgr = new AgySessionManager({
        pool,
        catalog: new AgyCatalogStore(),
        getSpawnConfig: () => ({ binaryPath: MOCK_AGY_PATH, geminiDir, cwd: geminiDir }),
        getToolMode: () => "opencode",
        getWatchdogTimeoutMs: () => 5_000,
        onAuthFailure: authFailureSpy,
      });
      try {
        const abortLm = new AgyAcpLanguageModel("gemini-4-carbon", abortMgr);
        const callerAbort = new AbortController();
        callerAbort.abort(new Error("Caller aborted: unauthenticated tab closed"));
        await expect(
          abortLm.doGenerate({
            prompt: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
            headers: { "x-opencode-session-id": "ses_abort_reason" },
            abortSignal: callerAbort.signal,
          }),
        ).rejects.toThrow("Caller aborted: unauthenticated tab closed");
        expect(authFailureSpy).not.toHaveBeenCalled();
      } finally {
        await abortMgr.dispose();
      }
    } finally {
      await manager.dispose();
      await pool.dispose();
    }
  });

  it("removes unused agy-cli-version.ts and avoids eager node:sqlite opens on unresumed single-turn calls and websearches", async () => {
    expect(existsSync(resolve(__dirname, "../../src/sdk/agy-cli-version.ts"))).toBe(false);

    const preTurnSpy = vi.spyOn(turnOutcomeModule, "readPreTurnMaxStepIdx");
    const inspectSpy = vi.spyOn(turnOutcomeModule, "inspectTurnOutcomeFromDb");

    const geminiDir = makeTempDir();
    const pool = new AcpClientPool();
    const storageMap = new Map<string, unknown>();
    const manager = new AgySessionManager({
      pool,
      catalog: new AgyCatalogStore(),
      getSpawnConfig: () => ({ binaryPath: MOCK_AGY_PATH, geminiDir, cwd: geminiDir }),
      getToolMode: () => "opencode",
      getWatchdogTimeoutMs: () => 5_000,
      storage: {
        get: async (k) => storageMap.get(k),
        set: async (k, v) => {
          storageMap.set(k, v);
        },
        remove: async (k) => {
          storageMap.delete(k);
        },
      },
    });

    try {
      const model = new AgyAcpLanguageModel("gemini-4-carbon", manager);

      // 1. Healthy brand-new stateful Turn 1 -> zero SQLite opens
      const t1 = await model.doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "Hello turn 1" }] }],
        headers: { "x-opencode-session-id": "ses_lazy_sqlite" },
      });
      const t1Reply = t1.content
        .filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text")
        .map((c) => c.text)
        .join("");
      expect(preTurnSpy).toHaveBeenCalledTimes(0);
      expect(inspectSpy).toHaveBeenCalledTimes(0);

      // 2. Healthy stateless auxiliary call -> zero SQLite opens
      await model.doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "Summarize title" }] }],
        headers: {
          "x-opencode-session-id": "ses_lazy_sqlite",
          "x-opencode-agy-kind": "title",
        },
      });
      expect(preTurnSpy).toHaveBeenCalledTimes(0);
      expect(inspectSpy).toHaveBeenCalledTimes(0);

      // 3. Healthy websearch -> zero SQLite opens
      const wsRes = await executeAgyWebSearch({
        query: "OpenCode lazy sqlite check",
        pool,
        spawnConfig: { binaryPath: MOCK_AGY_PATH, geminiDir },
      });
      expect(wsRes.length).toBeGreaterThan(0);
      expect(preTurnSpy).toHaveBeenCalledTimes(0);
      expect(inspectSpy).toHaveBeenCalledTimes(0);

      // 3b. Caller-aborted websearch -> must NOT open SQLite either!
      const wsAbort = new AbortController();
      setTimeout(() => wsAbort.abort(new Error("WebsearchCancelledByCaller")), 15);
      await expect(
        executeAgyWebSearch({
          query: "[SCENARIO:slow_streaming_cancel]",
          signal: wsAbort.signal,
          pool,
          spawnConfig: { binaryPath: MOCK_AGY_PATH, geminiDir },
        }),
      ).rejects.toThrow("WebsearchCancelledByCaller");
      expect(preTurnSpy).toHaveBeenCalledTimes(0);
      expect(inspectSpy).toHaveBeenCalledTimes(0);

      // 4. Resumed Turn 2 on existing session -> DOES record preTurnMaxIdx so prior turn steps are excluded
      await model.doGenerate({
        prompt: [
          { role: "user", content: [{ type: "text", text: "Hello turn 1" }] },
          { role: "assistant", content: [{ type: "text", text: t1Reply }] },
          { role: "user", content: [{ type: "text", text: "Hello turn 2" }] },
        ],
        headers: { "x-opencode-session-id": "ses_lazy_sqlite" },
      });
      expect(preTurnSpy).toHaveBeenCalledTimes(1);
      expect(inspectSpy).toHaveBeenCalledTimes(0);

      // 5. Fresh Node subprocess smoke check: confirm node:sqlite ExperimentalWarning is NOT emitted
      const distEntry = resolve(__dirname, "../../dist/index.js");
      if (existsSync(distEntry)) {
        const mockNoSqliteScript = join(geminiDir, "mock-no-sqlite.mjs");
        writeFileSync(
          mockNoSqliteScript,
          [
            "#!/usr/bin/env node",
            'process.stdin.setEncoding("utf8");',
            'let buf = "";',
            'process.stdin.on("data", (c) => {',
            "  buf += c;",
            "  let nl;",
            '  while ((nl = buf.indexOf("\\n")) !== -1) {',
            "    const line = buf.slice(0, nl).trim();",
            "    buf = buf.slice(nl + 1);",
            "    if (!line) continue;",
            "    const msg = JSON.parse(line);",
            '    if (msg.method === "initialize") {',
            '      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: 1, agentInfo: { name: "agy", version: "1.5.8" }, agentCapabilities: {} } }) + "\\n");',
            '    } else if (msg.method === "session/new") {',
            '      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { sessionId: "s_clean", configOptions: [] } }) + "\\n");',
            '    } else if (msg.method === "session/prompt") {',
            '      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "s_clean", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "{\\"summary\\":\\"ok\\",\\"sources\\":[{\\"url\\":\\"https://opencode.ai\\",\\"title\\":\\"OC\\"}]}" } } } }) + "\\n");',
            '      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { stopReason: "end_turn", usage: { inputTokens: 5, outputTokens: 5 } } }) + "\\n");',
            "    } else if (msg.id !== undefined) {",
            '      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: {} }) + "\\n");',
            "    }",
            "  }",
            "});",
          ].join("\n"),
          "utf8",
        );
        chmodSync(mockNoSqliteScript, 0o755);

        const subRes = spawnSync(
          process.execPath,
          [
            "--input-type=module",
            "-e",
            `
              import { AcpClientPool, AgyCatalogStore, AgySessionManager, AgyAcpLanguageModel, executeAgyWebSearch } from ${JSON.stringify(distEntry)};
              const pool = new AcpClientPool();
              const mgr = new AgySessionManager({
                pool,
                catalog: new AgyCatalogStore(),
                getSpawnConfig: () => ({ binaryPath: ${JSON.stringify(mockNoSqliteScript)}, geminiDir: ${JSON.stringify(geminiDir)} }),
                getToolMode: () => "opencode",
                getWatchdogTimeoutMs: () => 5000,
              });
              const lm = new AgyAcpLanguageModel("gemini-4-carbon", mgr);
              await lm.doGenerate({
                prompt: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
                headers: { "x-opencode-session-id": "sub_ses_1" },
              });
              await executeAgyWebSearch({
                query: "hello",
                pool,
                spawnConfig: { binaryPath: ${JSON.stringify(mockNoSqliteScript)}, geminiDir: ${JSON.stringify(geminiDir)} },
              });
              await mgr.dispose();
              await pool.dispose();
            `,
          ],
          { encoding: "utf8" },
        );
        expect(subRes.status).toBe(0);
        expect(subRes.stderr).not.toContain("SQLite");
        expect(subRes.stderr).not.toContain("ExperimentalWarning");
      }
    } finally {
      preTurnSpy.mockRestore();
      inspectSpy.mockRestore();
      await manager.dispose();
      await pool.dispose();
    }
  });

  describe.runIf(existsSync(REAL_AGY_PATH))("live agy 1.5.8 binary smoke integration", () => {
    it("spawns real agy acp 1.5.8 with isolated --gemini-dir, negotiates ACP v1, and detects unauthenticated profile without hanging or polluting cold-start hints", async () => {
      const isolatedGeminiDir = makeTempDir();
      const pool = new AcpClientPool();

      expect(
        hasLocalAgyAuthHint({
          binaryPath: REAL_AGY_PATH,
          geminiDir: isolatedGeminiDir,
        }),
      ).toBe(false);

      try {
        const conn = await pool.spawnEphemeral({
          binaryPath: REAL_AGY_PATH,
          geminiDir: isolatedGeminiDir,
          includeDefaultCustomizations: false,
          cwd: isolatedGeminiDir,
        });
        expect(conn.initializeResult?.protocolVersion).toBe(1);
        expect(conn.initializeResult?.agentInfo?.version).toBeDefined();
        await conn.close();

        const probe = await probeAgyAuthAndCatalog(pool, {
          binaryPath: REAL_AGY_PATH,
          geminiDir: isolatedGeminiDir,
        });
        expect(probe.state).toBe("needs_auth");
        expect(probe.message).toContain("agy acp --login");

        // Fresh unauthenticated probe must NOT leave behind jetski_state.pbtxt that flips hasLocalAgyAuthHint to true!
        expect(
          hasLocalAgyAuthHint({
            binaryPath: REAL_AGY_PATH,
            geminiDir: isolatedGeminiDir,
          }),
        ).toBe(false);

        const ctrl = new (await import("../../src/acp/auth")).AgyAuthController({
          binaryPath: REAL_AGY_PATH,
          geminiDir: isolatedGeminiDir,
        });
        expect(ctrl.shouldActivateProvider).toBe(false);
        ctrl.updateFromOutcome(probe);
        expect(ctrl.state).toBe("needs_auth");
        expect(ctrl.shouldActivateProvider).toBe(false);
      } finally {
        await pool.dispose();
      }
    });
  });
});
