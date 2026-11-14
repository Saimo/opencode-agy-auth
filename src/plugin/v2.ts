import {
  AGY_ACP_PACKAGE,
  AGY_AISDK_PACKAGE,
  AGY_HEADER_FORK_SOURCE,
  AGY_HEADER_REQUEST_KIND,
  AGY_HEADER_SESSION_ID,
  AGY_PROVIDER_ID,
  AGY_PROVIDER_NAME,
} from "../constants";
import {
  AgyAuthController,
  probeAgyAuthAndCatalog,
  registerAgyIntegration,
  resolveEffectiveSpawnConfig,
  syncIntegrationConnectionStatus,
} from "../acp/auth";
import { AgyCatalogStore, toOpenCodeModelInfo } from "../acp/catalog";
import { AcpClientPool } from "../acp/client";
import { createAgyAcpSdk } from "../acp/language-model";
import { AgySessionManager } from "../acp/sessions";
import {
  STATIC_MODELS_SIMPLE,
  TIER_MAPPING,
  getStaticModelEfforts,
  resolveModelTier,
} from "./tier";
import {
  defineOpenCodeV2Plugin,
  type OpenCodeV2Cleanup,
  type OpenCodeV2ModelVariant,
  type OpenCodeV2PluginContext,
  type OpenCodeV2PluginDefinition,
  type OpenCodeV2Registration,
  type OpenCodeV2SessionContextEvent,
  type OpenCodeV2SessionInfo,
  type OpenCodeV2SessionRetryEvent,
} from "./types";
import {
  AGY_WEBSEARCH_PROVIDER_ID,
  AGY_WEBSEARCH_PROVIDER_NAME,
  buildWebSearchPrompt,
  executeAgyWebSearch,
  parseAgyWebSearchOutput,
  registerV2WebSearch,
  resolveWebSearchConfig,
} from "./v2-websearch";

const DEFAULT_WATCHDOG_TIMEOUT_MS = 45_000;
const MAX_RETRY_ATTEMPTS = 4;

export function resolveModelVariants(modelId: string): OpenCodeV2ModelVariant[] {
  const efforts = getStaticModelEfforts(modelId);
  return efforts.map((level) => ({
    id: level,
    settings: {
      effort: level,
      thoughtLevel: level,
    },
    headers: {
      "x-agy-tier": level,
    },
  }));
}

function trackRegistration(
  reg: Promise<OpenCodeV2Registration> | OpenCodeV2Registration | void,
  cleanups: Array<() => Promise<void> | void>,
): Promise<void> | void {
  if (!reg) return;
  if (typeof (reg as Promise<OpenCodeV2Registration>).then === "function") {
    return (reg as Promise<OpenCodeV2Registration>).then((resolved) => {
      if (resolved && typeof resolved.dispose === "function") {
        cleanups.push(() => resolved.dispose());
      }
    });
  }
  if (typeof (reg as OpenCodeV2Registration).dispose === "function") {
    cleanups.push(() => (reg as OpenCodeV2Registration).dispose());
  }
}

function extractRetryDelayFromStructuredError(
  event: OpenCodeV2SessionRetryEvent,
): number | undefined {
  if (
    typeof event.error.retryAfterMs === "number" &&
    Number.isFinite(event.error.retryAfterMs) &&
    event.error.retryAfterMs > 0
  ) {
    return Math.min(event.error.retryAfterMs, 120_000);
  }

  const body = event.error.response?.body ?? event.error.message ?? "";
  try {
    const parsed = JSON.parse(body) as {
      error?: { retryAfterMs?: number; quotaResetTimeStamp?: string };
    };
    if (typeof parsed.error?.retryAfterMs === "number" && parsed.error.retryAfterMs > 0) {
      return Math.min(parsed.error.retryAfterMs, 120_000);
    }
    if (typeof parsed.error?.quotaResetTimeStamp === "string") {
      const resetAt = Date.parse(parsed.error.quotaResetTimeStamp);
      if (Number.isFinite(resetAt)) {
        const delta = resetAt - Date.now();
        if (delta > 0 && delta <= 120_000) {
          return Math.round(delta);
        }
      }
    }
  } catch {
    // Ignore non-JSON body
  }

  const secMatch = body.match(/retry(?:\s+in|\s+after|Delay=)\s*([0-9.]+)(ms|s)\b/i);
  if (secMatch?.[1] && secMatch[2]) {
    const num = Number(secMatch[1]);
    if (Number.isFinite(num) && num > 0) {
      const ms = secMatch[2].toLowerCase() === "ms" ? num : num * 1000;
      return Math.min(Math.round(ms), 120_000);
    }
  }

  return undefined;
}

export async function setupOpenCodeV2(
  ctx: OpenCodeV2PluginContext,
): Promise<OpenCodeV2Cleanup> {
  const cleanups: Array<() => Promise<void> | void> = [];

  const pool = new AcpClientPool();
  const catalog = new AgyCatalogStore();
  await catalog.hydrateFromStorage(ctx.storage);

  let currentSpawnConfig = await resolveEffectiveSpawnConfig(ctx);
  const auth = new AgyAuthController(currentSpawnConfig);
  await auth.hydrateFromStorage(ctx.storage, currentSpawnConfig);

  const sessions = new AgySessionManager({
    pool,
    catalog,
    getSpawnConfig: async () => {
      currentSpawnConfig = await resolveEffectiveSpawnConfig(ctx);
      return currentSpawnConfig;
    },
    getToolMode: () => (ctx.options?.toolMode === "hybrid" ? "hybrid" : "opencode"),
    getWatchdogTimeoutMs: () =>
      typeof ctx.options?.watchdogTimeoutMs === "number"
        ? ctx.options.watchdogTimeoutMs
        : DEFAULT_WATCHDOG_TIMEOUT_MS,
    storage: ctx.storage,
    permission: ctx.permission,
    onAuthFailure: (message) => {
      if (auth.updateFromOutcome({ state: "needs_auth", message })) {
        void auth.persistToStorage(ctx.storage, currentSpawnConfig);
        void syncIntegrationConnectionStatus(ctx, auth);
        void ctx.provider?.reload?.()?.catch(() => {});
      }
    },
  });

  const refreshProbeAndReload = async (): Promise<void> => {
    if (auth.isDisposed) return;
    currentSpawnConfig = await resolveEffectiveSpawnConfig(ctx);
    const outcome = await probeAgyAuthAndCatalog(pool, currentSpawnConfig);
    if (auth.isDisposed) return;

    const authChanged = auth.updateFromOutcome(outcome);
    await auth.persistToStorage(ctx.storage, currentSpawnConfig);
    let catalogChanged = false;
    if (outcome.state === "ready" && outcome.catalog) {
      catalogChanged = await catalog.applyDiscoveredCatalog(
        outcome.catalog,
        ctx.storage,
      );
    }

    await syncIntegrationConnectionStatus(ctx, auth);

    if ((authChanged || catalogChanged) && !auth.isDisposed) {
      await ctx.provider?.reload?.()?.catch(() => {});
      await ctx.model?.reload?.()?.catch(() => {});
    }
  };

  await registerAgyIntegration(ctx, {
    auth,
    getSpawnConfig: () => currentSpawnConfig,
    onCredentialsChanged: async () => {
      await pool.evictAll();
      await refreshProbeAndReload();
    },
    cleanups,
  });

  if (ctx.provider?.transform) {
    await trackRegistration(
      ctx.provider.transform((editor) => {
        editor.update(AGY_PROVIDER_ID, (provider) => {
          provider.id = AGY_PROVIDER_ID;
          provider.name = AGY_PROVIDER_NAME;
          provider.integrationID = AGY_PROVIDER_ID;
          provider.package = AGY_AISDK_PACKAGE;
          if (provider.activation !== "disabled") {
            provider.activation = auth.shouldActivateProvider ? "enabled" : "auto";
          }
        });

        for (const entry of catalog.listEntries()) {
          const modelInfo = toOpenCodeModelInfo(entry);
          editor.models.update(AGY_PROVIDER_ID, modelInfo.id, (draft) => {
            Object.assign(draft, modelInfo);
          });
        }
      }),
      cleanups,
    );
  }

  if (ctx.aisdk?.hook) {
    const sdkInstance = createAgyAcpSdk(sessions);
    await trackRegistration(
      ctx.aisdk.hook(
        "sdk",
        (event) => {
          if (
            event.package !== AGY_ACP_PACKAGE &&
            event.package !== AGY_AISDK_PACKAGE
          ) {
            return;
          }
          event.sdk = sdkInstance;
        },
        { providerID: AGY_PROVIDER_ID },
      ),
      cleanups,
    );
  }

  const forkSourceCache = new Map<string, string | null>();
  const resolveForkSource = async (sessionID: string): Promise<string | undefined> => {
    if (!ctx.session.get) return undefined;
    if (forkSourceCache.has(sessionID)) {
      return forkSourceCache.get(sessionID) ?? undefined;
    }
    try {
      const raw = await ctx.session.get({ sessionID });
      const info: OpenCodeV2SessionInfo | undefined =
        raw && typeof raw === "object" && "data" in raw
          ? (raw as { data?: OpenCodeV2SessionInfo }).data
          : (raw as OpenCodeV2SessionInfo | undefined);
      const forkId = info?.fork?.sessionID;
      forkSourceCache.set(sessionID, typeof forkId === "string" ? forkId : null);
      return typeof forkId === "string" ? forkId : undefined;
    } catch {
      forkSourceCache.set(sessionID, null);
      return undefined;
    }
  };

  const attachContextMetadata = (event: OpenCodeV2SessionContextEvent) => {
    if (event.model.providerID !== AGY_PROVIDER_ID) return;
    const existing =
      event.options[AGY_PROVIDER_ID] &&
      typeof event.options[AGY_PROVIDER_ID] === "object"
        ? (event.options[AGY_PROVIDER_ID] as Record<string, unknown>)
        : {};
    event.options[AGY_PROVIDER_ID] = {
      ...existing,
      sessionId: event.sessionID,
      ...(event.agent ? { agent: event.agent } : {}),
      ...(event.model.variant && !existing.thoughtLevel
        ? { thoughtLevel: event.model.variant, effort: event.model.variant }
        : {}),
    };
  };

  await trackRegistration(
    ctx.session.hook(
      "model.request",
      async (event) => {
        if (event.model.providerID !== AGY_PROVIDER_ID) return;
        event.headers[AGY_HEADER_SESSION_ID] = event.sessionID;
        event.headers[AGY_HEADER_REQUEST_KIND] = event.kind;
        if (event.agent) {
          event.headers["x-opencode-agy-agent"] = event.agent;
        }
        if (event.model.variant && !event.headers["x-agy-tier"]) {
          event.headers["x-agy-tier"] = event.model.variant;
        }
        const forkSource = await resolveForkSource(event.sessionID);
        if (forkSource) {
          event.headers[AGY_HEADER_FORK_SOURCE] = forkSource;
        }
      },
      { providerID: AGY_PROVIDER_ID },
    ),
    cleanups,
  );

  await trackRegistration(
    ctx.session.hook("context", attachContextMetadata, {
      providerID: AGY_PROVIDER_ID,
    }),
    cleanups,
  );

  await trackRegistration(
    ctx.session.hook("generate", attachContextMetadata, {
      providerID: AGY_PROVIDER_ID,
    }),
    cleanups,
  );

  await trackRegistration(
    ctx.session.hook("compaction", attachContextMetadata, {
      providerID: AGY_PROVIDER_ID,
    }),
    cleanups,
  );

  await trackRegistration(
    ctx.session.hook(
      "retry",
      (event) => {
        if (event.model.providerID !== AGY_PROVIDER_ID) return;
        const status = event.error.status;

        if (status === 400 || status === 401 || status === 403 || status === 404) {
          event.decision = { retry: false };
          return;
        }

        if (event.attempt > MAX_RETRY_ATTEMPTS) {
          event.decision = { retry: false };
          return;
        }

        if (status === 429 || (typeof status === "number" && status >= 500)) {
          const parsedDelay = extractRetryDelayFromStructuredError(event);
          const backoffMs =
            parsedDelay ?? Math.min(1_000 * Math.pow(2, Math.max(0, event.attempt - 1)), 30_000);
          event.decision = { retry: true, delay: backoffMs };
        }
      },
      { providerID: AGY_PROVIDER_ID },
    ),
    cleanups,
  );

  await registerV2WebSearch(ctx, {
    pool,
    getSpawnConfig: () => resolveEffectiveSpawnConfig(ctx),
    cleanups,
  });

  const shouldRunInitialProbe =
    ctx.options?.skipInitialProbe === false ||
    (ctx.options?.skipInitialProbe !== true &&
      (!process.env.VITEST ||
        Boolean(ctx.options?.binaryPath || process.env.OPENCODE_AGY_PATH)));

  let initialProbePromise: Promise<void> | undefined;
  if (shouldRunInitialProbe) {
    initialProbePromise = refreshProbeAndReload().catch(() => {});
  }

  return async () => {
    auth.markDisposed();
    if (initialProbePromise) {
      await initialProbePromise.catch(() => {});
    }
    for (const cleanup of cleanups.reverse()) {
      await Promise.resolve(cleanup()).catch(() => {});
    }
    await sessions.dispose();
    await pool.dispose();
  };
}

export const v2PluginDefinition: OpenCodeV2PluginDefinition = defineOpenCodeV2Plugin({
  id: AGY_PROVIDER_ID,
  setup: setupOpenCodeV2,
});

export function createV2PluginDefinition(): OpenCodeV2PluginDefinition {
  return v2PluginDefinition;
}

export {
  AGY_ACP_PACKAGE,
  AGY_AISDK_PACKAGE,
  AGY_PROVIDER_ID,
  AGY_PROVIDER_NAME,
  AGY_WEBSEARCH_PROVIDER_ID,
  AGY_WEBSEARCH_PROVIDER_NAME,
  STATIC_MODELS_SIMPLE,
  TIER_MAPPING,
  buildWebSearchPrompt,
  executeAgyWebSearch,
  parseAgyWebSearchOutput,
  registerV2WebSearch,
  resolveModelTier,
  resolveWebSearchConfig,
};

export default v2PluginDefinition;
