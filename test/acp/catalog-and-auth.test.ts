import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAgyLoginCommand,
  classifyAcpAuthError,
  hasLocalAgyAuthHint,
  probeAgyAuthAndCatalog,
  registerAgyIntegration,
  resolveEffectiveSpawnConfig,
  AgyAuthController,
} from "../../src/acp/auth";
import {
  AgyCatalogStore,
  mergeSessionConfigOptions,
} from "../../src/acp/catalog";
import { AcpClientPool, resolveConversationsDir } from "../../src/acp/client";
import { AcpRpcError, type AcpSessionConfigOption } from "../../src/acp/types";
import { resetDynamicTierMappingsForTesting } from "../../src/plugin/tier";
import { setupOpenCodeV2 } from "../../src/plugin/v2";
import type {
  OpenCodeV2AISDKSdkHookEvent,
  OpenCodeV2ModelInfo,
  OpenCodeV2PluginContext,
} from "../../src/plugin/types";

const MOCK_AGY_PATH = resolve(__dirname, "../fixtures/mock-agy-acp.mjs");

describe("acp/catalog and acp/auth", () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const d = mkdtempSync(join(tmpdir(), "agy-cat-auth-test-"));
    tempDirs.push(d);
    return d;
  }

  afterEach(() => {
    resetDynamicTierMappingsForTesting();
    for (const d of tempDirs.splice(0, tempDirs.length)) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("discovers all live agy models + per-model thought_level variants and cleans up probe .db", async () => {
    const geminiDir = makeTempDir();
    const cacheDir = makeTempDir();
    const pool = new AcpClientPool();

    try {
      const outcome = await probeAgyAuthAndCatalog(pool, {
        binaryPath: MOCK_AGY_PATH,
        geminiDir,
      });

      expect(outcome.state).toBe("ready");
      expect(outcome.agentVersion).toBe("1.5.8");
      expect(outcome.catalog).toBeDefined();

      const convDir = resolveConversationsDir({ geminiDir });
      if (existsSync(convDir)) {
        expect(readdirSync(convDir)).toEqual([]);
      }

      const store = new AgyCatalogStore({ cacheDir });
      const memoryStorage = new Map<string, unknown>();
      await store.applyDiscoveredCatalog(outcome.catalog!, {
        get: async (k) => memoryStorage.get(k),
        set: async (k, v) => {
          memoryStorage.set(k, v);
        },
        remove: async (k) => {
          memoryStorage.delete(k);
        },
      });

      expect(store.hasLiveCatalog).toBe(true);

      // Includes brand-new live model `gemini-4-neon` not in STATIC_MODELS_SIMPLE!
      const neon = store.getEntry("gemini-4-neon");
      expect(neon).toBeDefined();
      expect(neon!.thoughtLevels).toEqual(["minimal", "medium", "max"]);

      const hydrogen = store.getEntry("gemini-4-hydrogen");
      expect(hydrogen!.thoughtLevels).toEqual(["low", "medium", "high", "xhigh"]);

      const flash = store.getEntry("gemini-3-flash");
      expect(flash!.thoughtLevels).toEqual([]);

      // Reload from disk cache in a fresh store instance
      const reloadedStore = new AgyCatalogStore({ cacheDir });
      expect(reloadedStore.getEntry("gemini-4-neon")?.thoughtLevels).toEqual([
        "minimal",
        "medium",
        "max",
      ]);

      // Partial config_option_update (#28433) must NEVER drop previously discovered models
      const partialUpdate: AcpSessionConfigOption[] = [
        {
          id: "thought_level",
          name: "Thinking Effort",
          category: "thought_level",
          type: "select",
          currentValue: "high",
          options: [
            { value: "low", name: "LOW" },
            { value: "high", name: "HIGH" },
          ],
        },
      ];
      reloadedStore.applyIncrementalConfigOptions(partialUpdate);
      expect(reloadedStore.getEntry("gemini-4-neon")).toBeDefined();
      expect(reloadedStore.getEntry("claude-sonnet-5-5")).toBeDefined();

      const mergedOpts = mergeSessionConfigOptions(
        [
          {
            id: "model",
            name: "Model",
            category: "model",
            type: "select",
            currentValue: "gemini-4-carbon",
            options: [{ value: "gemini-4-carbon", name: "Gemini 4 Carbon" }],
          },
        ],
        partialUpdate,
      );
      expect(mergedOpts).toHaveLength(2);
      expect(mergedOpts.find((o) => o.id === "model")).toBeDefined();
      expect(mergedOpts.find((o) => o.id === "thought_level")).toBeDefined();
    } finally {
      await pool.dispose();
    }
  });

  it("classifies -32000, headless -32603 (#36037), and ENOENT auth errors accurately", async () => {
    expect(
      classifyAcpAuthError(new AcpRpcError({ code: -32000, message: "Authentication required" })),
    ).toEqual({
      state: "needs_auth",
      message: "Antigravity CLI authentication is required. Run `agy acp --login` to sign in.",
    });

    expect(
      classifyAcpAuthError(
        new AcpRpcError({
          code: -32603,
          message:
            "Internal error: No browser is available in this environment. Run `agy acp --login`.",
        }),
      ),
    ).toEqual({
      state: "needs_auth",
      message:
        "Antigravity CLI is not signed in (headless environment detected). Run `agy acp --login` to authenticate via URL paste.",
    });

    const enoent = Object.assign(new Error("spawn agy ENOENT"), { code: "ENOENT" });
    expect(classifyAcpAuthError(enoent).state).toBe("missing");

    // Live probe against mock-agy-acp with headless_32603 mode
    const geminiDir = makeTempDir();
    const pool = new AcpClientPool();
    try {
      const headlessOutcome = await probeAgyAuthAndCatalog(pool, {
        binaryPath: MOCK_AGY_PATH,
        geminiDir,
        env: { ...process.env, MOCK_AGY_AUTH_MODE: "headless_32603" },
      });
      expect(headlessOutcome.state).toBe("needs_auth");
      expect(headlessOutcome.message).toContain("agy acp --login");
    } finally {
      await pool.dispose();
    }
  });

  it("registers agy acp --login command + ~/.gemini external methods and reacts to credential events", async () => {
    const geminiDir = makeTempDir();
    const registeredMethods: unknown[] = [];
    let emitEvent: ((evt: { type: string; data?: Record<string, unknown> }) => void) | undefined;

    const ctx: OpenCodeV2PluginContext = {
      integration: {
        transform: vi.fn(async (cb) => {
          cb({
            update: vi.fn(),
            method: {
              update(reg) {
                registeredMethods.push(reg);
              },
            },
          });
        }),
      },
      session: { hook: vi.fn() },
      event: {
        subscribe: () => ({
          async *[Symbol.asyncIterator]() {
            const event = await new Promise<{ type: string; data?: Record<string, unknown> }>(
              (res) => {
                emitEvent = res;
              },
            );
            yield event;
          },
        }),
      },
    };

    const cleanups: Array<() => Promise<void> | void> = [];
    const auth = new AgyAuthController({ binaryPath: MOCK_AGY_PATH, geminiDir });
    const onCredentialsChanged = vi.fn(async () => {});

    await registerAgyIntegration(ctx, {
      auth,
      getSpawnConfig: () => ({ binaryPath: MOCK_AGY_PATH, geminiDir }),
      onCredentialsChanged,
      cleanups,
    });

    expect(registeredMethods).toHaveLength(2);
    expect(buildAgyLoginCommand({ binaryPath: MOCK_AGY_PATH, geminiDir })).toEqual([
      MOCK_AGY_PATH,
      "acp",
      "--login",
      "--gemini-dir",
      geminiDir,
      "--app-data-dir",
      "antigravity-acp",
    ]);

    emitEvent?.({ type: "credential.updated", data: { integrationID: "google-agy" } });
    await new Promise((r) => setTimeout(r, 20));
    expect(onCredentialsChanged).toHaveBeenCalledTimes(1);

    auth.markDisposed();
    for (const fn of cleanups) await fn();
  });

  it("detects cold-start auth hints for keyring-backed jetski_state.pbtxt, standalone oauth tokens, and auth.json while rejecting empty/unauthenticated profiles", () => {
    // 1. Fresh/empty isolated --gemini-dir -> false
    const emptyIsoDir = makeTempDir();
    expect(
      hasLocalAgyAuthHint({
        binaryPath: MOCK_AGY_PATH,
        geminiDir: emptyIsoDir,
      }),
    ).toBe(false);
    expect(
      new AgyAuthController({
        binaryPath: MOCK_AGY_PATH,
        geminiDir: emptyIsoDir,
      }).shouldActivateProvider,
    ).toBe(false);

    // Empty subdirectory, empty/whitespace files, `{}` or `{"signedIn":false}` -> still false
    mkdirSync(join(emptyIsoDir, "antigravity-acp"), { recursive: true });
    writeFileSync(join(emptyIsoDir, "antigravity-acp", "auth.json"), "{}", "utf8");
    writeFileSync(join(emptyIsoDir, "antigravity-acp", "jetski_state.pbtxt"), "   \n", "utf8");
    expect(
      hasLocalAgyAuthHint({
        binaryPath: MOCK_AGY_PATH,
        geminiDir: emptyIsoDir,
      }),
    ).toBe(false);

    writeFileSync(
      join(emptyIsoDir, "antigravity-acp", "auth.json"),
      '{"signedIn":false}',
      "utf8",
    );
    expect(
      hasLocalAgyAuthHint({
        binaryPath: MOCK_AGY_PATH,
        geminiDir: emptyIsoDir,
      }),
    ).toBe(false);

    // 2. OS-keyring-backed agy 1.5.8 installation with jetski_state.pbtxt (no auth.json) -> true
    const keyringDir = makeTempDir();
    mkdirSync(join(keyringDir, "antigravity-acp"), { recursive: true });
    writeFileSync(
      join(keyringDir, "antigravity-acp", "jetski_state.pbtxt"),
      [
        "post_onboarding: {",
        "  completed_steps: POST_ONBOARDING_STEP_TYPE_MANAGER_WELCOME",
        "}",
        'installation_uuid: "5ec18f6e-0591-4782-ac21-ded8fec931db"',
        "migrations: {",
        "  key: 5",
        "  value: MIGRATION_STATUS_COMPLETED",
        "}",
      ].join("\n"),
      "utf8",
    );
    expect(
      hasLocalAgyAuthHint({
        binaryPath: MOCK_AGY_PATH,
        geminiDir: keyringDir,
      }),
    ).toBe(true);
    expect(
      new AgyAuthController({
        binaryPath: MOCK_AGY_PATH,
        geminiDir: keyringDir,
      }).shouldActivateProvider,
    ).toBe(true);

    // Missing binary -> false even when state file exists
    expect(
      hasLocalAgyAuthHint({
        binaryPath: join(keyringDir, "missing-agy-binary"),
        geminiDir: keyringDir,
        env: { PATH: "" },
      }),
    ).toBe(false);

    // 3. Standalone OAuth token file (<geminiDir>/jetski-standalone-oauth-token) -> true
    const standaloneDir = makeTempDir();
    writeFileSync(
      join(standaloneDir, "jetski-standalone-oauth-token"),
      '{"access_token":"ya29.mock"}',
      "utf8",
    );
    expect(
      hasLocalAgyAuthHint({
        binaryPath: MOCK_AGY_PATH,
        geminiDir: standaloneDir,
      }),
    ).toBe(true);

    // 4. Invalid relative appDataDir fails closed without throwing
    expect(
      hasLocalAgyAuthHint({
        binaryPath: MOCK_AGY_PATH,
        geminiDir: keyringDir,
        appDataDir: "../invalid",
      }),
    ).toBe(false);
  });

  it("leaves includeDefaultCustomizations undefined unless explicitly set so opencode mode passes --include-default-customizations=false and hybrid mode uses agy defaults", async () => {
    const baseCtx: Pick<OpenCodeV2PluginContext, "options" | "integration" | "location"> = {
      integration: { transform: vi.fn(async () => {}) },
      location: { directory: "/tmp" },
    };

    const defaultCfg = await resolveEffectiveSpawnConfig(baseCtx);
    expect(defaultCfg.includeDefaultCustomizations).toBeUndefined();
    expect("includeDefaultCustomizations" in defaultCfg).toBe(false);

    const explicitTrueCfg = await resolveEffectiveSpawnConfig({
      ...baseCtx,
      options: { includeDefaultCustomizations: true },
    });
    expect(explicitTrueCfg.includeDefaultCustomizations).toBe(true);

    const explicitFalseCfg = await resolveEffectiveSpawnConfig({
      ...baseCtx,
      options: { includeDefaultCustomizations: false },
    });
    expect(explicitFalseCfg.includeDefaultCustomizations).toBe(false);

    // Verify end-to-end spawned worker argv across setupOpenCodeV2(ctx) configurations
    async function runEchoArgvWithOptions(
      options: OpenCodeV2PluginContext["options"],
    ): Promise<string[]> {
      const geminiDir = makeTempDir();
      let sdkHookFn: ((event: OpenCodeV2AISDKSdkHookEvent) => Promise<void> | void) | undefined;
      const cleanup = await setupOpenCodeV2({
        options: {
          binaryPath: MOCK_AGY_PATH,
          geminiDir,
          skipInitialProbe: true,
          webSearch: false,
          ...options,
        },
        integration: { transform: vi.fn(async () => {}) },
        provider: { transform: vi.fn(async () => {}) },
        aisdk: {
          hook: vi.fn(async (name, handler) => {
            if (name === "sdk") {
              sdkHookFn = handler as (event: OpenCodeV2AISDKSdkHookEvent) => Promise<void> | void;
            }
          }),
        },
        session: { hook: vi.fn(async () => {}) },
        location: { directory: geminiDir },
      });

      try {
        const evt: OpenCodeV2AISDKSdkHookEvent = {
          model: { id: "gemini-4-carbon" } as OpenCodeV2ModelInfo,
          package: "@opencode-agy/acp",
          options: {},
        };
        await sdkHookFn!(evt);
        const lm = evt.sdk!.languageModel("gemini-4-carbon");
        const res = await lm.doGenerate({
          prompt: [{ role: "user", content: [{ type: "text", text: "[SCENARIO:echo_mcp_tools]" }] }],
          headers: { "x-opencode-session-id": "ses_argv_check" },
        });
        const txt = res.content
          .filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text")
          .map((c) => c.text)
          .join("");
        return (JSON.parse(txt) as { argv: string[] }).argv;
      } finally {
        await cleanup?.();
      }
    }

    // 1. Default ("opencode" toolMode, unset includeDefaultCustomizations) -> passes --include-default-customizations=false
    const opencodeDefaultArgv = await runEchoArgvWithOptions({});
    expect(opencodeDefaultArgv).toContain("--include-default-customizations=false");

    // 2. "hybrid" toolMode, unset includeDefaultCustomizations -> omits flag (uses agy default)
    const hybridDefaultArgv = await runEchoArgvWithOptions({ toolMode: "hybrid" });
    expect(hybridDefaultArgv).not.toContain("--include-default-customizations=false");

    // 3. "opencode" toolMode with explicit includeDefaultCustomizations: true -> omits flag
    const opencodeExplicitTrueArgv = await runEchoArgvWithOptions({
      toolMode: "opencode",
      includeDefaultCustomizations: true,
    });
    expect(opencodeExplicitTrueArgv).not.toContain("--include-default-customizations=false");

    // 4. "hybrid" toolMode with explicit includeDefaultCustomizations: false -> passes flag
    const hybridExplicitFalseArgv = await runEchoArgvWithOptions({
      toolMode: "hybrid",
      includeDefaultCustomizations: false,
    });
    expect(hybridExplicitFalseArgv).toContain("--include-default-customizations=false");
  });

  it("honors OPENCODE_AGY_GEMINI_DIR across auth hints and login commands and persists needs_auth across OpenCode restarts", async () => {
    const freshEnvDir = makeTempDir();
    expect(
      hasLocalAgyAuthHint({
        binaryPath: MOCK_AGY_PATH,
        env: { ...process.env, OPENCODE_AGY_GEMINI_DIR: freshEnvDir },
      }),
    ).toBe(false);

    const loginCmd = buildAgyLoginCommand({
      binaryPath: MOCK_AGY_PATH,
      env: { ...process.env, OPENCODE_AGY_GEMINI_DIR: freshEnvDir },
    });
    expect(loginCmd).toEqual([
      MOCK_AGY_PATH,
      "acp",
      "--login",
      "--gemini-dir",
      freshEnvDir,
      "--app-data-dir",
      "antigravity-acp",
    ]);

    const resolvedFromOverrideEnv = await resolveEffectiveSpawnConfig(
      {
        integration: { transform: vi.fn(async () => {}) },
        location: { directory: freshEnvDir },
      },
      {
        binaryPath: MOCK_AGY_PATH,
        env: { ...process.env, OPENCODE_AGY_GEMINI_DIR: freshEnvDir },
      },
    );
    expect(resolvedFromOverrideEnv.geminiDir).toBe(freshEnvDir);

    // Simulate OS-keyring profile where jetski_state.pbtxt exists on disk,
    // Boot 1 fails auth probe (logged-out keyring), and Boot 2 restarts OpenCode.
    const keyringProfileDir = makeTempDir();
    mkdirSync(join(keyringProfileDir, "antigravity-acp"), { recursive: true });
    writeFileSync(
      join(keyringProfileDir, "antigravity-acp", "jetski_state.pbtxt"),
      'installation_uuid: "logged-out-keyring-uuid"\n',
      "utf8",
    );

    const sharedStorageMap = new Map<string, unknown>();
    const sharedStorage = {
      get: async (k: string) => sharedStorageMap.get(k),
      set: async (k: string, v: unknown) => {
        sharedStorageMap.set(k, v);
      },
      remove: async (k: string) => {
        sharedStorageMap.delete(k);
      },
    };

    async function bootWithAuthEnv(
      authEnvMode: string | undefined,
      skipInitialProbe: boolean,
    ): Promise<{
      initialActivation: string | undefined;
      latestActivation: () => string | undefined;
      cleanup: () => Promise<void>;
    }> {
      const prevMode = process.env.MOCK_AGY_AUTH_MODE;
      if (authEnvMode) {
        process.env.MOCK_AGY_AUTH_MODE = authEnvMode;
      } else {
        delete process.env.MOCK_AGY_AUTH_MODE;
      }

      let transformCallback:
        | ((editor: {
            update: (id: string, fn: (p: Record<string, unknown>) => void) => void;
            models: { update: () => void };
          }) => void)
        | undefined;
      let currentActivation: string | undefined;

      const runEditor = () => {
        const providerDraft: Record<string, unknown> = { activation: "auto" };
        transformCallback?.({
          update: (_id, fn) => fn(providerDraft),
          models: { update: () => {} },
        });
        currentActivation = providerDraft.activation as string | undefined;
      };

      try {
        const cleanupFn = await setupOpenCodeV2({
          options: {
            binaryPath: MOCK_AGY_PATH,
            geminiDir: keyringProfileDir,
            skipInitialProbe,
            webSearch: false,
          },
          storage: sharedStorage,
          integration: { transform: vi.fn(async () => {}) },
          provider: {
            transform: vi.fn(async (cb) => {
              transformCallback = cb as typeof transformCallback;
              runEditor();
            }),
            reload: vi.fn(async () => {
              runEditor();
            }),
          },
          session: { hook: vi.fn(async () => {}) },
          location: { directory: keyringProfileDir },
        });

        const initialActivation = currentActivation;
        if (!skipInitialProbe) {
          // Wait for initial async probe + reload to settle
          const deadline = Date.now() + 3_000;
          while (Date.now() < deadline) {
            if (authEnvMode && currentActivation === "auto") break;
            if (!authEnvMode && currentActivation === "enabled" && initialActivation === "auto") {
              break;
            }
            await new Promise((r) => setTimeout(r, 20));
          }
        }

        return {
          initialActivation,
          latestActivation: () => currentActivation,
          cleanup: async () => {
            await cleanupFn?.();
          },
        };
      } finally {
        if (prevMode === undefined) {
          delete process.env.MOCK_AGY_AUTH_MODE;
        } else {
          process.env.MOCK_AGY_AUTH_MODE = prevMode;
        }
      }
    }

    // Boot 1: cold-start sees jetski_state.pbtxt -> "enabled", then probe returns -32000 -> demotes to "auto" & persists needs_auth
    const boot1 = await bootWithAuthEnv("rpc_32000", false);
    expect(boot1.initialActivation).toBe("enabled");
    expect(boot1.latestActivation()).toBe("auto");
    await boot1.cleanup();

    // Boot 2: persisted needs_auth prevents bare jetski_state.pbtxt from falsely activating at t = 0ms!
    const boot2 = await bootWithAuthEnv("rpc_32000", true);
    expect(boot2.initialActivation).toBe("auto");
    await boot2.cleanup();

    // Boot 3: user signed into OS keyring externally -> starts "auto" at t = 0ms, probe succeeds -> promotes to "enabled" & persists ready!
    const boot3 = await bootWithAuthEnv(undefined, false);
    expect(boot3.initialActivation).toBe("auto");
    expect(boot3.latestActivation()).toBe("enabled");
    await boot3.cleanup();

    // Boot 4: persisted ready + jetski_state.pbtxt -> immediate t = 0ms "enabled" again!
    const boot4 = await bootWithAuthEnv(undefined, true);
    expect(boot4.initialActivation).toBe("enabled");
    await boot4.cleanup();
  });
});
