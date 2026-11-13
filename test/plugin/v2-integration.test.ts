import { afterEach, describe, expect, it, vi } from "vitest";
import { AGY_PROVIDER_ID } from "../../src/constants";
import { setupOpenCodeV2 } from "../../src/plugin/v2";
import type {
  OpenCodeV2OAuthCredential,
  OpenCodeV2PluginContext,
  OpenCodeV2ProviderInfo,
  OpenCodeV2SessionHookMap,
} from "../../src/plugin/types";

describe("OpenCode v2 end-to-end provider integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createHarness = (activeCred?: OpenCodeV2OAuthCredential, options?: Record<string, unknown>) => {
    const hooks: Partial<OpenCodeV2SessionHookMap> = {};
    const providers: Record<string, OpenCodeV2ProviderInfo> = {};

    const ctx: OpenCodeV2PluginContext = {
      options,
      integration: {
        transform: vi.fn(async () => {}),
        connection: activeCred
          ? {
              active: vi.fn(async () => ({ id: "conn_1" })),
              resolve: vi.fn(async () => ({ type: "credential" as const, credential: activeCred })),
            }
          : undefined,
      },
      provider: {
        transform: vi.fn(async (fn) => {
          fn({
            update(id, cb) {
              const draft = providers[id] ?? { id };
              cb(draft);
              providers[id] = draft;
            },
            models: {
              update() {},
            },
          });
        }),
      },
      session: {
        hook: vi.fn(async (event, handler) => {
          (hooks as Record<string, unknown>)[event] = handler;
        }),
      },
      location: {
        root: "/workspace",
        workspace: "/workspace/app",
      },
    };

    return { ctx, hooks, providers };
  };

  it("does not touch any tool or command domains (strictly provider-only)", async () => {
    const harness = createHarness();
    const cleanup = await setupOpenCodeV2(harness.ctx);

    expect(harness.ctx.provider.transform).toHaveBeenCalledTimes(1);
    expect(harness.ctx.integration.transform).toHaveBeenCalledTimes(1);
    expect(harness.ctx.session.hook).toHaveBeenCalledTimes(3);
    expect((harness.ctx as Record<string, unknown>).tool).toBeUndefined();
    expect((harness.ctx as Record<string, unknown>).command).toBeUndefined();

    await cleanup();
  });

  it("preserves user-customized provider name while enforcing google-agy runtime fields", async () => {
    const harness = createHarness();
    harness.providers[AGY_PROVIDER_ID] = {
      id: AGY_PROVIDER_ID,
      name: "My Custom Agy",
    };

    const cleanup = await setupOpenCodeV2(harness.ctx);
    expect(harness.providers[AGY_PROVIDER_ID].name).toBe("My Custom Agy");
    expect(harness.providers[AGY_PROVIDER_ID].package).toBe("@opencode/ai/providers/google");
    expect(harness.providers[AGY_PROVIDER_ID].activation).toBe("auto");
    expect(harness.providers[AGY_PROVIDER_ID].integrationID).toBe(AGY_PROVIDER_ID);
    await cleanup();
  });

  it("runs full request -> response roundtrip for Code Assist JSON and sanitizes/restores tool names", async () => {
    const harness = createHarness({
      type: "oauth",
      methodID: "oauth",
      access: "e2e-token",
      refresh: "e2e-refresh|proj-e2e|managed-e2e",
      expires: Date.now() + 3600_000,
    });

    const cleanup = await setupOpenCodeV2(harness.ctx);

    const reqEvent = {
      sessionID: "ses_e2e_1",
      providerID: AGY_PROVIDER_ID,
      model: { id: "claude-sonnet-5-5", providerID: AGY_PROVIDER_ID, variant: "high" },
      attempt: 1,
      request: new Request(
        "https://generativelanguage.googleapis.com/v1beta/models/claude-sonnet-5-5:generateContent",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": "placeholder",
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "Call mcp$tool" }] }],
            tools: [
              {
                functionDeclarations: [
                  {
                    name: "mcp$tool",
                    description: "MCP tool with special char",
                    parametersJsonSchema: { type: "object", properties: {} },
                  },
                ],
              },
            ],
          }),
        },
      ),
    };

    await harness.hooks["http.request"]!(reqEvent);
    expect(reqEvent.request.url).toBe(
      "https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent",
    );

    const outboundBody = JSON.parse(await reqEvent.request.clone().text());
    expect(outboundBody.model).toBe("claude-sonnet-5-5-high");
    const sanitizedName = outboundBody.request.tools[0].functionDeclarations[0].name;
    expect(sanitizedName).not.toContain("$");

    const codeAssistEnvelope = {
      response: {
        candidates: [
          {
            content: {
              role: "model",
              parts: [{ functionCall: { name: sanitizedName, args: {} } }],
            },
            finishReason: "STOP",
          },
        ],
      },
    };

    const resEvent = {
      sessionID: "ses_e2e_1",
      providerID: AGY_PROVIDER_ID,
      model: { id: "claude-sonnet-5-5", providerID: AGY_PROVIDER_ID, variant: "high" },
      attempt: 1,
      request: reqEvent.request,
      response: new Response(JSON.stringify(codeAssistEnvelope), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      duration: 85,
    };

    await harness.hooks["http.response"]!(resEvent);
    const unwrapped = await resEvent.response.json();
    expect(unwrapped.candidates[0].content.parts[0].functionCall.name).toBe("mcp$tool");

    await cleanup();
  });
});
