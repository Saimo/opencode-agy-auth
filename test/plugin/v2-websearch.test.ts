import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AcpClientPool, resolveConversationsDir } from "../../src/acp/client";
import { AGY_PROVIDER_ID } from "../../src/constants";
import {
  executeAgyWebSearch,
  parseAgyWebSearchOutput,
  resolveWebSearchConfig,
  setupOpenCodeV2,
} from "../../src/plugin/v2";
import type {
  OpenCodeV2PluginContext,
  OpenCodeV2WebSearchDefinition,
} from "../../src/plugin/types";

const MOCK_AGY_PATH = resolve(__dirname, "../fixtures/mock-agy-acp.mjs");

describe("OpenCode v2 Antigravity ACP Grounded Web Search", () => {
  const originalEnv = process.env.OPENCODE_AGY_WEBSEARCH;
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "agy-websearch-test-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.OPENCODE_AGY_WEBSEARCH;
    } else {
      process.env.OPENCODE_AGY_WEBSEARCH = originalEnv;
    }
    vi.restoreAllMocks();
    for (const d of tempDirs.splice(0, tempDirs.length)) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("enables webSearch by default and supports opt-out via options or env var", () => {
    expect(resolveWebSearchConfig()).toEqual({ enabled: true, setDefault: true });
    expect(resolveWebSearchConfig({})).toEqual({ enabled: true, setDefault: true });
    expect(resolveWebSearchConfig({ webSearch: true })).toEqual({
      enabled: true,
      setDefault: true,
    });
    expect(resolveWebSearchConfig({ webSearch: false })).toEqual({
      enabled: false,
      setDefault: false,
    });
    expect(resolveWebSearchConfig({ webSearch: { enabled: false } })).toEqual({
      enabled: false,
      setDefault: false,
    });
    expect(
      resolveWebSearchConfig({
        webSearch: { default: false, model: "gemini-3.5-flash-lite" },
      }),
    ).toEqual({
      enabled: true,
      setDefault: false,
      model: "gemini-3.5-flash-lite",
    });

    process.env.OPENCODE_AGY_WEBSEARCH = "false";
    expect(resolveWebSearchConfig({ webSearch: true })).toEqual({
      enabled: false,
      setDefault: false,
    });
  });

  it("parses structured JSON and markdown web search outputs and deduplicates sources", () => {
    const rawJson = JSON.stringify({
      summary: "OpenCode v2 integrates Antigravity ACP cleanly.",
      sources: [
        {
          url: "https://opencode.ai/docs/plugins",
          title: "OpenCode Docs",
          snippet: "Plugin guide.",
        },
        {
          url: "https://opencode.ai/docs/plugins",
          title: "OpenCode Docs",
          snippet: "Duplicate URL must be deduplicated.",
        },
        {
          url: "https://antigravity.google/acp",
          title: "Antigravity ACP",
          snippet: "Protocol reference.",
        },
      ],
    });

    const results = parseAgyWebSearchOutput(rawJson, "OpenCode v2 ACP");
    expect(results).toHaveLength(3);
    expect(results[0]!.title).toBe("Antigravity Web Search: OpenCode v2 ACP");
    expect(results[0]!.url).toBe("https://opencode.ai/docs/plugins");
    expect(results[0]!.content).toContain("OpenCode v2 integrates Antigravity ACP cleanly.");
    expect(results[0]!.content).toContain("[1] [OpenCode Docs](https://opencode.ai/docs/plugins)");
    expect(results[1]!.url).toBe("https://opencode.ai/docs/plugins");
    expect(results[2]!.url).toBe("https://antigravity.google/acp");
  });

  it("executes ACP websearch permitting ONLY search_web, falls back on 429, supports domain prioritization, and deletes .db files", async () => {
    const geminiDir = makeTempDir();
    const pool = new AcpClientPool();

    try {
      const results = await executeAgyWebSearch({
        query: "OpenCode ACP",
        domain: "opencode.ai",
        pool,
        spawnConfig: {
          binaryPath: MOCK_AGY_PATH,
          geminiDir,
          env: {
            ...process.env,
            // Force `gemini-3-flash` to hit 429 so `executeAgyWebSearch` falls back to `gemini-3.5-flash-lite`
            MOCK_AGY_WEBSEARCH_429_FIRST: "1",
          },
        },
      });

      expect(results.length).toBeGreaterThanOrEqual(2);
      // Must NOT contain SECURITY_VIOLATION_SHELL_ALLOWED (verifying `run_command` was rejected!)
      expect(results[0]!.content).not.toContain("SECURITY_VIOLATION_SHELL_ALLOWED");
      expect(results[0]!.content).toContain("Grounded answer from gemini-3.5-flash-lite");
      expect(results[0]!.content).toContain("promptHasDomain=true");
      expect(results[1]!.url).toBe("https://opencode.ai/docs/acp");

      // Verify stateless `.db` conversation files were cleaned up
      const convDir = resolveConversationsDir({ geminiDir });
      if (existsSync(convDir)) {
        expect(readdirSync(convDir)).toEqual([]);
      }
    } finally {
      await pool.dispose();
    }
  });

  it("registers google-agy in ctx.websearch by default and respects opt-out", async () => {
    const geminiDir = makeTempDir();
    const definitions: OpenCodeV2WebSearchDefinition[] = [];
    let currentDefault: string | false | undefined;
    const disposeSpy = vi.fn(async () => {});

    const ctx: OpenCodeV2PluginContext = {
      options: {
        binaryPath: MOCK_AGY_PATH,
        geminiDir,
        skipInitialProbe: true,
      },
      integration: { transform: vi.fn(async () => {}) },
      provider: { transform: vi.fn(async () => {}) },
      session: { hook: vi.fn(async () => {}) },
      websearch: {
        transform: vi.fn(async (cb) => {
          cb({
            add(def) {
              definitions.push(def);
            },
            default: {
              get: () => currentDefault,
              set: (val) => {
                currentDefault = val;
              },
            },
          });
          return { dispose: disposeSpy };
        }),
      },
    };

    const cleanup = await setupOpenCodeV2(ctx);
    expect(definitions).toHaveLength(1);
    expect(definitions[0]!.id).toBe(AGY_PROVIDER_ID);
    expect(currentDefault).toBe(AGY_PROVIDER_ID);

    const res = await definitions[0]!.execute(
      { query: "OpenCode ACP integration" },
      { signal: new AbortController().signal },
    );
    expect(res.length).toBeGreaterThanOrEqual(2);
    expect(res[0]!.content).toContain("Grounded answer from gemini-3-flash");

    await cleanup?.();
    expect(disposeSpy).toHaveBeenCalledTimes(1);

    // Opt-out check
    const optOutTransform = vi.fn(async () => {});
    const optOutCleanup = await setupOpenCodeV2({
      options: { webSearch: false, skipInitialProbe: true },
      integration: { transform: vi.fn(async () => {}) },
      provider: { transform: vi.fn(async () => {}) },
      session: { hook: vi.fn(async () => {}) },
      websearch: { transform: optOutTransform },
    });
    expect(optOutTransform).not.toHaveBeenCalled();
    await optOutCleanup?.();
  });
});
