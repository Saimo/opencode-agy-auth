import { afterEach, describe, expect, it, vi } from "vitest";
import { AGY_PROVIDER_ID } from "../../src/constants";
import * as fetchModule from "../../src/fetch";
import {
  executeAgyWebSearch,
  parseAgyWebSearchPayload,
  resolveWebSearchConfig,
  setupOpenCodeV2,
} from "../../src/plugin/v2";
import type {
  OpenCodeV2OAuthCredential,
  OpenCodeV2PluginContext,
  OpenCodeV2WebSearchDefinition,
} from "../../src/plugin/types";
import { injectInlineCitations } from "../../src/sdk/websearch";

describe("OpenCode v2 Antigravity Grounded Web Search", () => {
  const originalEnv = process.env.OPENCODE_AGY_WEBSEARCH;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.OPENCODE_AGY_WEBSEARCH;
    } else {
      process.env.OPENCODE_AGY_WEBSEARCH = originalEnv;
    }
    vi.restoreAllMocks();
  });

  it("enables webSearch by default and supports opt-out via options or env var", () => {
    expect(resolveWebSearchConfig()).toEqual({ enabled: true, setDefault: true });
    expect(resolveWebSearchConfig({})).toEqual({ enabled: true, setDefault: true });
    expect(resolveWebSearchConfig({ webSearch: true })).toEqual({ enabled: true, setDefault: true });
    expect(resolveWebSearchConfig({ webSearch: false })).toEqual({
      enabled: false,
      setDefault: false,
    });
    expect(resolveWebSearchConfig({ webSearch: { enabled: false } })).toEqual({
      enabled: false,
      setDefault: false,
    });
    expect(
      resolveWebSearchConfig({ webSearch: { default: false, model: "gemini-3.1-flash-lite" } }),
    ).toEqual({
      enabled: true,
      setDefault: false,
      model: "gemini-3.1-flash-lite",
    });

    process.env.OPENCODE_AGY_WEBSEARCH = "false";
    expect(resolveWebSearchConfig({ webSearch: true })).toEqual({
      enabled: false,
      setDefault: false,
    });
  });

  it("skips leading thought parts, deduplicates grounding chunks, and injects UTF-8 safe inline citations", () => {
    const payload = {
      response: {
        candidates: [
          {
            content: {
              role: "model",
              parts: [
                { thought: true, text: "Internal chain of thought that must be ignored." },
                {
                  thoughtSignature: "sig_abc",
                  text: "OpenCode v2 ships native plugins — fast & modular.",
                },
              ],
            },
            groundingMetadata: {
              webSearchQueries: ["OpenCode v2 plugins"],
              groundingChunks: [
                { web: { uri: "https://opencode.ai/docs/plugins", title: "OpenCode Docs" } },
                { web: { uri: "https://opencode.ai/docs/plugins", title: "OpenCode Docs" } },
                {
                  web: {
                    uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/xyz",
                    title: "github.com",
                  },
                },
              ],
              groundingSupports: [
                {
                  segment: {
                    startIndex: 0,
                    // UTF-8 byte length of "OpenCode v2 ships native plugins" is 32
                    endIndex: 32,
                    text: "OpenCode v2 ships native plugins",
                  },
                  groundingChunkIndices: [0, 1],
                },
                {
                  segment: {
                    startIndex: 35,
                    // UTF-8 byte length of full string with em-dash (3 bytes) is 52
                    endIndex: 52,
                    text: "fast & modular.",
                  },
                  groundingChunkIndices: [2],
                },
              ],
            },
          },
        ],
      },
    };

    const results = parseAgyWebSearchPayload(payload, "OpenCode v2");
    expect(results).toHaveLength(3);

    // 1. Primary synthesized summary result
    expect(results[0]!.url).toBe("https://opencode.ai/docs/plugins");
    expect(results[0]!.title).toBe("Antigravity Web Search: OpenCode v2");
    expect(results[0]!.time).toEqual({});
    expect(results[0]!.content).not.toContain("Internal chain of thought");
    expect(results[0]!.content).toContain(
      "OpenCode v2 ships native plugins[1] — fast & modular.[2]",
    );
    expect(results[0]!.content).toContain("[1] [OpenCode Docs](https://opencode.ai/docs/plugins)");
    expect(results[0]!.content).toContain(
      "[2] [github.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/xyz)",
    );
    expect(results[0]!.content).toContain("Source URLs are HTTP redirects");

    // 2. Deduplicated grounded source entries
    expect(results[1]).toEqual({
      url: "https://opencode.ai/docs/plugins",
      title: "[1] OpenCode Docs",
      content: "OpenCode v2 ships native plugins",
      time: {},
    });
    expect(results[2]).toEqual({
      url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/xyz",
      title: "[2] github.com",
      content: "fast & modular.",
      time: {},
    });
  });

  it("clamps mid-rune UTF-8 byte offsets without corrupting multi-byte characters", () => {
    const text = "Café ☕ rocks";
    // "Café " is 6 bytes (`é` is bytes 3..4), `☕` is 3 bytes (bytes 6..8).
    // Passing offset 7 (middle of `☕`) clamps cleanly to byte 6 (start of `☕`).
    const cited = injectInlineCitations(
      text,
      [{ segment: { endIndex: 7 }, groundingChunkIndices: [0] }],
      new Map([[0, 1]]),
    );
    expect(cited).toBe("Café [1]☕ rocks");
  });

  it("registers google-agy in ctx.websearch by default, sets default provider, falls back on 429, and retries on 401", async () => {
    const cred: OpenCodeV2OAuthCredential = {
      type: "oauth",
      methodID: "oauth",
      access: "stale-token",
      refresh: "refresh-tok|proj-1|managed-1",
      expires: Date.now() + 3600_000,
    };

    const definitions: OpenCodeV2WebSearchDefinition[] = [];
    let currentDefault: string | false | undefined;
    const disposeSpy = vi.fn(async () => {});

    const ctx: OpenCodeV2PluginContext = {
      integration: {
        transform: vi.fn(async () => {}),
        connection: {
          active: vi.fn(async () => ({ id: "conn_1" })),
          resolve: vi.fn(async () => cred),
        },
      },
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

    let generateCalls = 0;
    vi.spyOn(fetchModule, "agyFetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({
            access_token: "fresh-token",
            expires_in: 3600,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.includes(":generateContent")) {
        generateCalls++;
        const authHeader = new Headers(init?.headers).get("Authorization");
        const parsedBody = JSON.parse(String(init?.body));

        expect(parsedBody.requestType).toBe("web_search");
        expect(parsedBody.request.tools).toEqual([{ googleSearch: {} }]);

        // 1st attempt fails with 401 on stale token -> triggers automatic refresh + retry
        if (authHeader === "Bearer stale-token") {
          return new Response("Unauthorized", { status: 401 });
        }

        // 2nd attempt hits 429 on gemini-3.5-flash-lite -> triggers automatic fallback to gemini-3.1-flash-lite
        if (parsedBody.model === "gemini-3.5-flash-lite") {
          return new Response("Quota exhausted", { status: 429 });
        }

        expect(parsedBody.model).toBe("gemini-3.1-flash-lite");
        return new Response(
          JSON.stringify({
            response: {
              candidates: [
                {
                  content: { parts: [{ text: "Fallback grounded result." }] },
                  groundingMetadata: {
                    groundingChunks: [{ web: { uri: "https://example.com/res", title: "Example" } }],
                  },
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      return new Response("Not Found", { status: 404 });
    });

    const cleanup = await setupOpenCodeV2(ctx);
    expect(definitions).toHaveLength(1);
    expect(definitions[0]!.id).toBe(AGY_PROVIDER_ID);
    expect(definitions[0]!.name).toBe("Antigravity CLI");
    expect(currentDefault).toBe(AGY_PROVIDER_ID);

    const results = await definitions[0]!.execute(
      { query: "test query" },
      { signal: new AbortController().signal },
    );

    expect(generateCalls).toBe(3);
    expect(results).toHaveLength(2);
    expect(results[0]!.content).toContain("Fallback grounded result.");
    expect(results[1]!.url).toBe("https://example.com/res");

    await cleanup?.();
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it("does not register websearch when opted out via options.webSearch = false", async () => {
    const transformSpy = vi.fn(async () => {});
    const ctx: OpenCodeV2PluginContext = {
      options: { webSearch: false },
      integration: { transform: vi.fn(async () => {}) },
      provider: { transform: vi.fn(async () => {}) },
      session: { hook: vi.fn(async () => {}) },
      websearch: { transform: transformSpy },
    };

    const cleanup = await setupOpenCodeV2(ctx);
    expect(transformSpy).not.toHaveBeenCalled();
    await cleanup?.();
  });

  it("supports domain prioritization in executeAgyWebSearch", async () => {
    let capturedPrompt = "";
    vi.spyOn(fetchModule, "agyFetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      capturedPrompt = body.request.contents[0].parts[0].text;
      return new Response(
        JSON.stringify({
          response: {
            candidates: [{ content: { parts: [{ text: "Scoped answer" }] } }],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const res = await executeAgyWebSearch({
      query: "app router",
      domain: "nextjs.org",
      accessToken: "tok",
      projectId: "proj",
    });

    expect(capturedPrompt).toContain("Prioritize authoritative results from domain: nextjs.org");
    expect(res).toHaveLength(1);
    expect(res[0]!.content).toBe("Scoped answer");
  });
});
