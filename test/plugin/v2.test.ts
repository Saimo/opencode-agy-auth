import { afterEach, describe, expect, it, vi } from "vitest";
import { AGY_PROVIDER_ID } from "../../src/constants";
import * as fetchModule from "../../src/fetch";
import {
  STATIC_MODELS_SIMPLE,
  createV2PluginDefinition,
  getDiskSignatureCache,
  ingestAvailableModelsResponse,
  resetDiskSignatureCacheForTesting,
  resetDynamicModelsForTesting,
  resolveModelTier,
  resolveModelVariants,
  setStoredAuthOverrideForTesting,
  setupOpenCodeV2,
  v2PluginDefinition,
} from "../../src/plugin/v2";
import { getModelEnum } from "../../src/sdk/request/prepare";
import type {
  OpenCodeV2IntegrationEditor,
  OpenCodeV2IntegrationMethodRegistration,
  OpenCodeV2ModelInfo,
  OpenCodeV2PluginContext,
  OpenCodeV2ProviderEditor,
  OpenCodeV2ProviderInfo,
} from "../../src/plugin/types";

describe("OpenCode v2 Plugin Setup", () => {
  afterEach(() => {
    setStoredAuthOverrideForTesting(undefined);
    resetDynamicModelsForTesting();
    vi.restoreAllMocks();
  });

  it("defines pure OpenCode v2 plugin definition", () => {
    expect(v2PluginDefinition.id).toBe(AGY_PROVIDER_ID);
    expect(v2PluginDefinition.setup).toBe(setupOpenCodeV2);
    expect(createV2PluginDefinition()).toBe(v2PluginDefinition);
  });

  it("initializes and shuts down caches cleanly via returned cleanup callback", async () => {
    resetDiskSignatureCacheForTesting();
    expect(getDiskSignatureCache()).toBeNull();

    const mockCtx: OpenCodeV2PluginContext = {
      integration: { transform: vi.fn(async () => {}) },
      provider: { transform: vi.fn(async () => {}) },
      session: { hook: vi.fn(async () => {}) },
      location: {},
    };

    const cleanup = await setupOpenCodeV2(mockCtx);
    expect(getDiskSignatureCache()).not.toBeNull();
    expect(typeof cleanup).toBe("function");
    await cleanup();
  });

  it("registers google-agy provider and all models with native @opencode/ai/providers/google contract", async () => {
    let providerTransformFn: ((editor: OpenCodeV2ProviderEditor) => void) | undefined;

    const mockCtx: OpenCodeV2PluginContext = {
      integration: { transform: vi.fn(async () => {}) },
      provider: {
        transform: vi.fn(async (fn) => {
          providerTransformFn = fn;
        }),
      },
      session: { hook: vi.fn(async () => {}) },
      location: {},
    };

    const cleanup = await setupOpenCodeV2(mockCtx);

    const providers: Record<string, OpenCodeV2ProviderInfo> = {};
    const models: Record<string, OpenCodeV2ModelInfo> = {};

    providerTransformFn!({
      update(id, fn) {
        const draft: OpenCodeV2ProviderInfo = providers[id] ?? { id };
        fn(draft);
        providers[id] = draft;
      },
      models: {
        update(providerID, modelID, fn) {
          const key = `${providerID}/${modelID}`;
          const draft: OpenCodeV2ModelInfo = models[key] ?? {};
          fn(draft);
          models[key] = draft;
        },
      },
    });

    const agyProvider = providers[AGY_PROVIDER_ID];
    expect(agyProvider).toBeDefined();
    expect(agyProvider.name).toBe("Antigravity CLI");
    expect(agyProvider.activation).toBe("auto");
    expect(agyProvider.package).toBe("@opencode/ai/providers/google");
    expect(agyProvider.integrationID).toBe(AGY_PROVIDER_ID);

    for (const modelId of Object.keys(STATIC_MODELS_SIMPLE)) {
      const m = models[`${AGY_PROVIDER_ID}/${modelId}`];
      expect(m).toBeDefined();
      expect(m.id).toBe(modelId);
      expect(m.modelID).toBe(modelId);
      expect(m.providerID).toBe(AGY_PROVIDER_ID);
      expect(m.package).toBe("@opencode/ai/providers/google");
      expect(m.cost).toEqual([]);
      expect(m.status).toBe("active");
      expect(m.enabled).toBe(true);
      expect(m.capabilities?.tools).toBe(true);
      expect(m.variants).toEqual(resolveModelVariants(modelId));
    }

    expect(models[`${AGY_PROVIDER_ID}/gemini-4-carbon`].variants).toEqual([
      { id: "low", headers: { "x-agy-tier": "low" } },
      { id: "medium", headers: { "x-agy-tier": "medium" } },
      { id: "high", headers: { "x-agy-tier": "high" } },
    ]);
    expect(models[`${AGY_PROVIDER_ID}/gemini-pro-orchestrator`].name).toBe("Orchestrator (Carbon)");
    expect(models[`${AGY_PROVIDER_ID}/gemini-pro-orchestrator-argon`].name).toBe("Orchestrator (Argon)");
    expect(models[`${AGY_PROVIDER_ID}/gemini-4-hydrogen`].variants).toEqual([
      { id: "low", headers: { "x-agy-tier": "low" } },
      { id: "medium", headers: { "x-agy-tier": "medium" } },
      { id: "high", headers: { "x-agy-tier": "high" } },
      { id: "xhigh", headers: { "x-agy-tier": "xhigh" } },
    ]);
    expect(models[`${AGY_PROVIDER_ID}/claude-sonnet-5-5`].family).toBe("claude");
    expect(models[`${AGY_PROVIDER_ID}/gpt-oss-120b-medium`].family).toBe("gpt");

    // Verify dynamic model discovery from :fetchAvailableModels
    const changed = ingestAvailableModelsResponse({
      agentModelSorts: [
        {
          groups: [
            {
              modelIds: [
                "gemini-4-oxygen-low",
                "gemini-4-oxygen-high",
                "gemini-pro-specialist",
              ],
            },
          ],
        },
      ],
      models: {
        "gemini-4-oxygen-low": {
          displayName: "Gemini 4 Oxygen (Low)",
          maxTokens: 1048576,
          maxOutputTokens: 262144,
          model: "MODEL_PLACEHOLDER_M901",
          supportsImages: true,
          supportsThinking: true,
        },
        "gemini-4-oxygen-high": {
          displayName: "Gemini 4 Oxygen (High)",
          maxTokens: 1048576,
          maxOutputTokens: 262144,
          model: "MODEL_PLACEHOLDER_M902",
          supportsImages: true,
          supportsThinking: true,
        },
        "gemini-pro-specialist": {
          displayName: "Gemini Pro Specialist",
          maxTokens: 1048576,
          maxOutputTokens: 131072,
          model: "MODEL_PLACEHOLDER_M903",
          supportsImages: true,
          supportsThinking: true,
        },
      },
    });
    expect(changed).toBe(true);
    expect(resolveModelTier("gemini-4-oxygen", { headers: { "x-agy-tier": "high" } })).toBe(
      "gemini-4-oxygen-high",
    );
    expect(getModelEnum("gemini-4-oxygen-high")).toBe("MODEL_PLACEHOLDER_M902");
    expect(getModelEnum("gemini-pro-specialist")).toBe("MODEL_PLACEHOLDER_M903");

    await cleanup();
  });

  it("registers OAuth integration with authorize, callback (throwing Error on failure), refresh, and label", async () => {
    let integrationTransformFn: ((editor: OpenCodeV2IntegrationEditor) => void) | undefined;

    const mockCtx: OpenCodeV2PluginContext = {
      integration: {
        transform: vi.fn(async (fn) => {
          integrationTransformFn = fn;
        }),
      },
      provider: { transform: vi.fn(async () => {}) },
      session: { hook: vi.fn(async () => {}) },
      location: {},
    };

    const cleanup = await setupOpenCodeV2(mockCtx);

    const integrations: Record<string, { id?: string; name?: string }> = {};
    let methodReg: OpenCodeV2IntegrationMethodRegistration | undefined;

    integrationTransformFn!({
      update(id, fn) {
        const draft = integrations[id] ?? { id };
        fn(draft);
        integrations[id] = draft;
      },
      method: {
        update(reg) {
          methodReg = reg;
        },
      },
    });

    expect(integrations[AGY_PROVIDER_ID]?.name).toBe("Antigravity CLI");
    expect(methodReg).toBeDefined();
    expect(methodReg!.integrationID).toBe(AGY_PROVIDER_ID);
    expect(methodReg!.method).toEqual({
      id: "oauth",
      type: "oauth",
      label: "Sign in with Google (Antigravity CLI)",
    });

    expect(
      methodReg!.label?.({
        type: "oauth",
        methodID: "oauth",
        access: "a",
        refresh: "r",
        expires: 1000,
        metadata: { email: "dev@example.com" },
      }),
    ).toBe("dev@example.com");

    const authFlow = await methodReg!.authorize!();
    expect(authFlow.mode).toBe("code");
    expect(authFlow.url).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(authFlow.url).toContain("code_challenge_method=S256");

    await expect(authFlow.callback("")).rejects.toThrow("Missing authorization code");
    await expect(
      authFlow.callback("https://antigravity.google/oauth-callback?code=abc&state=wrong-state"),
    ).rejects.toThrow("OAuth state mismatch");

    vi.spyOn(fetchModule, "agyFetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({
            access_token: "fresh-access-token",
            refresh_token: "fresh-refresh-token",
            expires_in: 3600,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("googleapis.com/oauth2/v1/userinfo")) {
        return new Response(JSON.stringify({ email: "user@example.com" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes(":loadCodeAssist")) {
        return new Response(
          JSON.stringify({ cloudaicompanionProject: "bound-project-id" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const stateParam = new URL(authFlow.url).searchParams.get("state")!;
    const cred = await authFlow.callback(
      `https://antigravity.google/oauth-callback?code=valid-auth-code&state=${stateParam}`,
    );

    expect(cred.type).toBe("oauth");
    expect(cred.methodID).toBe("oauth");
    expect(cred.access).toBe("fresh-access-token");
    expect(cred.refresh).toContain("fresh-refresh-token");
    expect(cred.refresh).toContain("bound-project-id");
    expect(Number.isInteger(cred.expires)).toBe(true);
    expect(cred.metadata?.email).toBe("user@example.com");

    // Exercise native refresh(credential)
    const refreshed = await methodReg!.refresh!(cred);
    expect(refreshed.type).toBe("oauth");
    expect(refreshed.access).toBe("fresh-access-token");
    expect(Number.isInteger(refreshed.expires)).toBe(true);
    expect(refreshed.metadata?.email).toBe("user@example.com");

    // Refresh throws Error on failure
    vi.spyOn(fetchModule, "agyFetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
    );
    await expect(methodReg!.refresh!(cred)).rejects.toThrow("Failed to refresh Google Antigravity OAuth token");

    await cleanup();
  });
});
