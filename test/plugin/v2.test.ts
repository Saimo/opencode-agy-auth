import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AGY_ACP_PACKAGE,
  AGY_AISDK_PACKAGE,
  AGY_EXTERNAL_METHOD_ID,
  AGY_LOGIN_METHOD_ID,
  AGY_PROVIDER_ID,
} from "../../src/constants";
import { resetDynamicTierMappingsForTesting } from "../../src/plugin/tier";
import {
  STATIC_MODELS_SIMPLE,
  createV2PluginDefinition,
  resolveModelVariants,
  setupOpenCodeV2,
  v2PluginDefinition,
} from "../../src/plugin/v2";
import type {
  OpenCodeV2AISDKSdkHookEvent,
  OpenCodeV2IntegrationEditor,
  OpenCodeV2IntegrationMethodRegistration,
  OpenCodeV2ModelInfo,
  OpenCodeV2PluginContext,
  OpenCodeV2ProviderEditor,
  OpenCodeV2ProviderInfo,
  OpenCodeV2SessionModelRequestEvent,
  OpenCodeV2SessionRetryEvent,
} from "../../src/plugin/types";

const MOCK_AGY_PATH = resolve(__dirname, "../fixtures/mock-agy-acp.mjs");

describe("OpenCode v2 Antigravity ACP Plugin Setup", () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "agy-v2-plugin-test-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    resetDynamicTierMappingsForTesting();
    vi.restoreAllMocks();
    for (const d of tempDirs.splice(0, tempDirs.length)) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("defines pure OpenCode v2 plugin definition", () => {
    expect(v2PluginDefinition.id).toBe(AGY_PROVIDER_ID);
    expect(v2PluginDefinition.setup).toBe(setupOpenCodeV2);
    expect(createV2PluginDefinition()).toBe(v2PluginDefinition);
  });

  it("registers google-agy with aisdk:@opencode-agy/acp, live-discovers new agy models, and wires LanguageModelV3 via ctx.aisdk.hook", async () => {
    const geminiDir = makeTempDir();
    // Seed auth.json hint so cold-start activation is immediately "enabled"
    mkdirSync(join(geminiDir, "antigravity-acp"), { recursive: true });
    writeFileSync(join(geminiDir, "antigravity-acp", "auth.json"), '{"signedIn":true}', "utf8");

    let providerTransformFn: ((editor: OpenCodeV2ProviderEditor) => void) | undefined;
    let sdkHookFn: ((event: OpenCodeV2AISDKSdkHookEvent) => Promise<void> | void) | undefined;
    const sessionHooks = new Map<string, (evt: unknown) => Promise<void> | void>();
    let providerReloadResolve!: () => void;
    const reloadPromise = new Promise<void>((resolveReload) => {
      providerReloadResolve = resolveReload;
    });

    const storageMap = new Map<string, unknown>();

    const ctx: OpenCodeV2PluginContext = {
      options: {
        binaryPath: MOCK_AGY_PATH,
        geminiDir,
      },
      storage: {
        get: async (k) => storageMap.get(k),
        set: async (k, v) => {
          storageMap.set(k, v);
        },
        remove: async (k) => {
          storageMap.delete(k);
        },
      },
      integration: { transform: vi.fn(async () => {}) },
      provider: {
        transform: vi.fn(async (fn) => {
          providerTransformFn = fn;
        }),
        reload: vi.fn(async () => {
          providerReloadResolve();
        }),
      },
      aisdk: {
        hook: vi.fn(async (name, handler) => {
          if (name === "sdk") {
            sdkHookFn = handler as (event: OpenCodeV2AISDKSdkHookEvent) => Promise<void> | void;
          }
        }),
      },
      session: {
        get: vi.fn(async ({ sessionID }) =>
          sessionID === "forked_ses" ? { id: sessionID, fork: { sessionID: "parent_ses" } } : undefined,
        ),
        hook: vi.fn(async (name, handler) => {
          sessionHooks.set(name, handler as (evt: unknown) => Promise<void> | void);
        }),
      },
      location: { directory: geminiDir },
    };

    const cleanup = await setupOpenCodeV2(ctx);

    try {
      const providers: Record<string, OpenCodeV2ProviderInfo> = {};
      const models: Record<string, OpenCodeV2ModelInfo> = {};
      const runTransform = () => {
        for (const k of Object.keys(models)) delete models[k];
        providerTransformFn!({
          update(id, fn) {
            const draft: OpenCodeV2ProviderInfo =
              providers[id] ??
              ({
                id,
                name: "",
                activation: "auto",
                package: "",
              } satisfies OpenCodeV2ProviderInfo);
            fn(draft);
            providers[id] = draft;
          },
          models: {
            update(providerID, modelID, fn) {
              const key = `${providerID}/${modelID}`;
              const draft = (models[key] ?? {}) as OpenCodeV2ModelInfo;
              fn(draft);
              models[key] = draft;
            },
          },
        });
      };

      // 1. Cold-start before background probe finishes -> serves STATIC_MODELS_SIMPLE + activation: "enabled"
      runTransform();
      expect(providers[AGY_PROVIDER_ID]?.package).toBe(AGY_AISDK_PACKAGE);
      expect(providers[AGY_PROVIDER_ID]?.activation).toBe("enabled");
      for (const staticId of Object.keys(STATIC_MODELS_SIMPLE)) {
        expect(models[`${AGY_PROVIDER_ID}/${staticId}`]?.package).toBe(AGY_AISDK_PACKAGE);
        expect(models[`${AGY_PROVIDER_ID}/${staticId}`]?.variants).toEqual(
          resolveModelVariants(staticId),
        );
      }

      // 2. Wait for background `probeAgyAuthAndCatalog` -> `provider.reload()`
      await reloadPromise;
      runTransform();

      // Newly discovered `gemini-4-neon` from `mock-agy-acp.mjs` is now registered with live `minimal`/`medium`/`max` variants!
      const neon = models[`${AGY_PROVIDER_ID}/gemini-4-neon`];
      expect(neon).toBeDefined();
      expect(neon.variants.map((v) => v.id)).toEqual(["minimal", "medium", "max"]);

      // 3. Verify `ctx.aisdk.hook("sdk")` resolves `LanguageModelV3` for `@opencode-agy/acp`
      const sdkEvt: OpenCodeV2AISDKSdkHookEvent = {
        model: neon,
        package: AGY_ACP_PACKAGE,
        options: {},
      };
      await sdkHookFn!(sdkEvt);
      expect(sdkEvt.sdk).toBeDefined();

      const lm = sdkEvt.sdk!.languageModel("gemini-4-neon");
      expect(lm.specificationVersion).toBe("v3");

      const gen = await lm.doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "Ping neon" }] }],
        headers: { "x-opencode-session-id": "ses_live_1", "x-agy-tier": "max" },
      });
      expect(gen.content[1]).toMatchObject({
        type: "text",
      });
      expect(
        gen.content.some(
          (c) => c.type === "text" && c.text.includes("model=gemini-4-neon,thought=max"),
        ),
      ).toBe(true);

      // 4. Verify `session.hook("model.request")` tags forked sessions and request kinds
      const modelReqHandler = sessionHooks.get("model.request")!;
      const reqEvt: OpenCodeV2SessionModelRequestEvent = {
        sessionID: "forked_ses",
        agent: "plan",
        model: { id: "gemini-4-carbon", providerID: AGY_PROVIDER_ID, variant: "high" },
        kind: "primary",
        headers: {},
      };
      await modelReqHandler(reqEvt);
      expect(reqEvt.headers["x-opencode-session-id"]).toBe("forked_ses");
      expect(reqEvt.headers["x-opencode-agy-kind"]).toBe("primary");
      expect(reqEvt.headers["x-opencode-agy-fork-source"]).toBe("parent_ses");
      expect(reqEvt.headers["x-agy-tier"]).toBe("high");

      // 5. Verify `session.hook("retry")` honors quota retry delays on 429 and blocks 401/400
      const retryHandler = sessionHooks.get("retry")!;
      const retry429: OpenCodeV2SessionRetryEvent = {
        sessionID: "ses_1",
        agent: "code",
        model: { id: "gemini-4-carbon", providerID: AGY_PROVIDER_ID },
        error: {
          type: "api_error",
          message: "Quota exhausted",
          status: 429,
          retryAfterMs: 3500,
        },
        attempt: 1,
        decision: { retry: false },
      };
      await retryHandler(retry429);
      expect(retry429.decision).toEqual({ retry: true, delay: 3500 });

      const retry401: OpenCodeV2SessionRetryEvent = {
        ...retry429,
        error: { type: "auth_error", message: "Needs auth", status: 401 },
        decision: { retry: true, delay: 1000 },
      };
      await retryHandler(retry401);
      expect(retry401.decision).toEqual({ retry: false });
    } finally {
      await cleanup();
    }
  });

  it("registers command (agy acp --login) and external (~/.gemini) integration methods and reports needs_auth when unauthenticated", async () => {
    const geminiDir = makeTempDir();
    let integrationTransformFn: ((editor: OpenCodeV2IntegrationEditor) => void) | undefined;
    const statusSpy = vi.fn(async () => {});

    const ctx: OpenCodeV2PluginContext = {
      options: {
        binaryPath: MOCK_AGY_PATH,
        geminiDir,
        skipInitialProbe: true,
      },
      integration: {
        transform: vi.fn(async (fn) => {
          integrationTransformFn = fn;
        }),
        connection: {
          active: vi.fn(async () => ({ id: "conn_1" })),
          status: statusSpy,
        },
      },
      provider: { transform: vi.fn(async () => {}) },
      session: { hook: vi.fn(async () => {}) },
    };

    const cleanup = await setupOpenCodeV2(ctx);

    try {
      const methods: OpenCodeV2IntegrationMethodRegistration[] = [];
      integrationTransformFn!({
        update: vi.fn(),
        method: {
          update(reg) {
            methods.push(reg);
          },
        },
      });

      expect(methods).toHaveLength(2);
      const cmdMethod = methods.find((m) => "id" in m.method && m.method.id === AGY_LOGIN_METHOD_ID);
      const extMethod = methods.find(
        (m) => "id" in m.method && m.method.id === AGY_EXTERNAL_METHOD_ID,
      );

      expect(cmdMethod?.method).toMatchObject({
        id: AGY_LOGIN_METHOD_ID,
        type: "command",
        command: [
          MOCK_AGY_PATH,
          "acp",
          "--login",
          "--gemini-dir",
          geminiDir,
          "--app-data-dir",
          "antigravity-acp",
        ],
      });
      expect(extMethod?.method).toMatchObject({
        id: AGY_EXTERNAL_METHOD_ID,
        type: "external",
      });
    } finally {
      await cleanup();
    }
  });
});
