import { AGY_CODE_ASSIST_ENDPOINT, AGY_PROVIDER_ID } from "../constants";
import { agyFetch } from "../fetch";
import {
  STATIC_MODELS_SIMPLE,
  TIER_MAPPING,
  getEffectiveTierMapping,
  registerDynamicTierVariant,
  resetDynamicTierMappingsForTesting,
  resolveModelTier,
  type SimpleStaticModel,
} from "./tier";
import {
  defineOpenCodeV2Plugin,
  type OAuthAuthDetails,
  type OpenCodeV2Cleanup,
  type OpenCodeV2ModelInfo,
  type OpenCodeV2ModelVariant,
  type OpenCodeV2OAuthCredential,
  type OpenCodeV2PluginContext,
  type OpenCodeV2PluginDefinition,
  type OpenCodeV2ProviderInfo,
  type PluginClient,
} from "./types";
import { authorizeAgy, exchangeAgyWithVerifier } from "../sdk/oauth";
import { parseOAuthCallbackInput } from "./oauth-authorize";
import { accessTokenExpired, formatRefreshParts, parseRefreshParts } from "./auth";
import { ensureProjectContext } from "./project";
import { resolveConfiguredProjectId } from "./provider";
import { refreshAccessToken } from "./token";
import {
  loadStoredAuthFromJson,
  saveStoredAuthToJson,
  setStoredAuthOverrideForTesting,
} from "./v2-storage";
import { registerV2SessionHooks, resolveActiveOAuthCredential } from "./v2-session";
import { initDiskSignatureCache, getDiskSignatureCache, resetDiskSignatureCacheForTesting } from "./cache";
import { initTurnStateTracker, shutdownTurnStateTracker } from "../sdk/request";
import { registerDynamicModelEnum, resetDynamicModelEnumsForTesting } from "../sdk/request/prepare";
import { buildAgyCliUserAgent } from "../sdk/user-agent";
import { initCooldownPersistence, shutdownRetryCooldowns } from "../sdk/retry";

export { getSafeHeader, setSafeHeaders, toUrlString } from "./headers";
export { STATIC_MODELS_SIMPLE, TIER_MAPPING, resolveModelTier, type SimpleStaticModel } from "./tier";
export { getDiskSignatureCache, resetDiskSignatureCacheForTesting } from "./cache";
export {
  loadStoredAuthFromJson,
  saveStoredAuthToJson,
  setStoredAuthOverrideForTesting,
} from "./v2-storage";

const GOOGLE_PROVIDER_PACKAGE = "@opencode/ai/providers/google";
const OAUTH_METHOD_ID = "oauth";

const persistAuthClient: PluginClient = {
  auth: {
    async set({ body }) {
      try {
        saveStoredAuthToJson(body);
      } catch {
        // Best-effort sync to auth.json for helper scripts
      }
    },
  },
};

const ORDERED_TIERS = ["minimal", "low", "medium", "high", "xhigh"] as const;
const TIER_SUFFIX_REGEX = /^(.+)-(minimal|low|medium|high|xhigh)$/;

const dynamicModels = new Map<string, SimpleStaticModel>();

export function resetDynamicModelsForTesting(): void {
  dynamicModels.clear();
  resetDynamicTierMappingsForTesting();
  resetDynamicModelEnumsForTesting();
}

export function resolveModelVariants(modelId: string): OpenCodeV2ModelVariant[] {
  const mapping = getEffectiveTierMapping(modelId);
  if (!mapping) return [];

  const variants: OpenCodeV2ModelVariant[] = [];

  for (const tier of ORDERED_TIERS) {
    if (mapping[tier] !== undefined) {
      variants.push({
        id: tier,
        headers: { "x-agy-tier": tier },
      });
    }
  }

  return variants;
}

interface RawAvailableModelEntry {
  displayName?: string;
  maxTokens?: number;
  maxOutputTokens?: number;
  model?: string;
  disabled?: boolean;
  supportsImages?: boolean;
  supportsThinking?: boolean;
}

function shouldSkipInternalModel(modelId: string, entry?: RawAvailableModelEntry): boolean {
  if (!modelId || entry?.disabled === true) return true;
  if (
    modelId.startsWith("chat_") ||
    modelId.startsWith("tab_") ||
    modelId.endsWith("-tiered") ||
    modelId.endsWith("-disabled") ||
    modelId.includes("-image") ||
    modelId === "gemini-2.5-flash-thinking"
  ) {
    return true;
  }
  return false;
}

/**
 * Ingests a Code Assist `:fetchAvailableModels` payload, updating live `MODEL_PLACEHOLDER_M*`
 * enums and registering any newly available `agy` models or tier variants.
 * Returns `true` if any new models or tier variants were added.
 */
export function ingestAvailableModelsResponse(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as {
    models?: Record<string, RawAvailableModelEntry>;
    agentModelSorts?: Array<{ groups?: Array<{ modelIds?: string[] }> }>;
  };

  const modelsMap = record.models && typeof record.models === "object" ? record.models : {};
  for (const [modelId, entry] of Object.entries(modelsMap)) {
    if (entry && typeof entry.model === "string") {
      registerDynamicModelEnum(modelId, entry.model);
    }
  }

  const candidateIds = new Set<string>();
  if (Array.isArray(record.agentModelSorts)) {
    for (const sort of record.agentModelSorts) {
      for (const group of sort?.groups ?? []) {
        for (const id of group?.modelIds ?? []) {
          if (typeof id === "string") candidateIds.add(id);
        }
      }
    }
  }
  for (const id of Object.keys(modelsMap)) {
    candidateIds.add(id);
  }

  // Count tier siblings so standalone models like `gpt-oss-120b-medium` stay standalone
  const tierSiblingCounts = new Map<string, number>();
  for (const id of candidateIds) {
    const entry = modelsMap[id];
    if (shouldSkipInternalModel(id, entry)) continue;
    const match = id.match(TIER_SUFFIX_REGEX);
    if (match?.[1] && !STATIC_MODELS_SIMPLE[id]) {
      tierSiblingCounts.set(match[1], (tierSiblingCounts.get(match[1]) ?? 0) + 1);
    }
  }

  let changed = false;

  for (const id of candidateIds) {
    const entry = modelsMap[id];
    if (shouldSkipInternalModel(id, entry)) continue;

    // If explicitly registered as a standalone static model, keep it standalone
    if (STATIC_MODELS_SIMPLE[id]) {
      continue;
    }

    const match = id.match(TIER_SUFFIX_REGEX);
    const baseId = match?.[1];
    const tier = match?.[2];
    const isGroupedTieredModel =
      Boolean(baseId && tier) &&
      (Boolean(baseId && (STATIC_MODELS_SIMPLE[baseId] || TIER_MAPPING[baseId])) ||
        (baseId ? (tierSiblingCounts.get(baseId) ?? 0) >= 2 : false));

    if (isGroupedTieredModel && baseId && tier) {
      if (registerDynamicTierVariant(baseId, tier, id)) {
        changed = true;
      }
      if (!STATIC_MODELS_SIMPLE[baseId] && !dynamicModels.has(baseId)) {
        const cleanName = (entry?.displayName || baseId)
          .replace(/\s*\((Minimal|Low|Medium|High|XHigh)\)\s*$/i, "")
          .trim();
        dynamicModels.set(baseId, {
          name: cleanName || baseId,
          description: `${cleanName || baseId} model. Select tier at runtime.`,
          maxTokens: typeof entry?.maxTokens === "number" ? entry.maxTokens : 1048576,
          maxOutputTokens: typeof entry?.maxOutputTokens === "number" ? entry.maxOutputTokens : 65536,
          toolCall: true,
          reasoning: entry?.supportsThinking ?? true,
          attachment: entry?.supportsImages ?? !baseId.startsWith("gpt-"),
        });
        changed = true;
      }
      continue;
    }

    // Standalone model not in STATIC_MODELS_SIMPLE
    if (!dynamicModels.has(id)) {
      const displayName = entry?.displayName?.trim() || id;
      dynamicModels.set(id, {
        name: displayName,
        description: `${displayName} model via Antigravity CLI.`,
        maxTokens: typeof entry?.maxTokens === "number" ? entry.maxTokens : 1048576,
        maxOutputTokens: typeof entry?.maxOutputTokens === "number" ? entry.maxOutputTokens : 65536,
        toolCall: true,
        reasoning: entry?.supportsThinking ?? true,
        attachment: entry?.supportsImages ?? !id.startsWith("gpt-"),
      });
      changed = true;
    }
  }

  return changed;
}

function resolveModelFamily(modelId: string): string {
  if (modelId.startsWith("claude-")) return "claude";
  if (modelId.startsWith("gpt-")) return "gpt";
  return "gemini";
}

function resolveInputModalities(modelId: string, simple: SimpleStaticModel): string[] {
  if (!simple.attachment) {
    return ["text"];
  }
  const isClaude = modelId.startsWith("claude-");
  const isGpt = modelId.startsWith("gpt-");
  if (!isClaude && !isGpt) {
    return ["text", "image", "pdf", "audio", "video"];
  }
  return ["text", "image", "pdf"];
}

function applyProviderInfo(provider: OpenCodeV2ProviderInfo): void {
  provider.id = AGY_PROVIDER_ID;
  provider.name = provider.name && provider.name !== AGY_PROVIDER_ID ? provider.name : "Antigravity CLI";
  provider.activation = "auto";
  provider.package = GOOGLE_PROVIDER_PACKAGE;
  provider.integrationID = AGY_PROVIDER_ID;
}

function applyModelInfo(model: OpenCodeV2ModelInfo, modelId: string, simple: SimpleStaticModel): void {
  model.id = modelId;
  model.modelID = modelId;
  model.providerID = AGY_PROVIDER_ID;
  model.name = model.name && model.name !== modelId ? model.name : simple.name;
  model.family = resolveModelFamily(modelId);
  model.package = GOOGLE_PROVIDER_PACKAGE;
  model.capabilities = {
    tools: simple.toolCall,
    input: resolveInputModalities(modelId, simple),
    output: ["text"],
    temperature: true,
  };
  model.limit = {
    context: simple.maxTokens,
    output: simple.maxOutputTokens,
  };
  model.cost = Array.isArray(model.cost) ? model.cost : [];
  model.variants = resolveModelVariants(modelId);
  model.status = "active";
  model.enabled = model.enabled ?? true;
  model.time = model.time ?? { released: 0 };
}

/**
 * Native OpenCode v2 setup for the `google-agy` Antigravity CLI OAuth provider.
 */
export async function setupOpenCodeV2(ctx: OpenCodeV2PluginContext): Promise<OpenCodeV2Cleanup> {
  try {
    initDiskSignatureCache({
      enabled: true,
      memory_ttl_seconds: 3600,
      disk_ttl_seconds: 86400,
      write_interval_seconds: 30,
    });
  } catch (e) {
    console.warn(
      `[Agy Auth] initDiskSignatureCache failed, running without signature disk cache: ${e instanceof Error ? e.message : e}`,
    );
  }

  try {
    initTurnStateTracker();
  } catch (e) {
    console.warn(
      `[Agy Auth] initTurnStateTracker failed, running without turn-state tracking: ${e instanceof Error ? e.message : e}`,
    );
  }

  try {
    initCooldownPersistence();
  } catch (e) {
    console.warn(
      `[Agy Auth] initCooldownPersistence failed, running without cooldown disk persistence: ${e instanceof Error ? e.message : e}`,
    );
  }

  const getConfiguredProjectId = () =>
    resolveConfiguredProjectId({
      configProjectId: typeof ctx.options?.projectId === "string" ? ctx.options.projectId : undefined,
    });

  // 1. Register Google Antigravity OAuth integration (authorize + native token refresh + account label)
  await ctx.integration.transform((editor) => {
    if (!editor) return;

    editor.update(AGY_PROVIDER_ID, (integration) => {
      integration.name = "Antigravity CLI";
    });

    editor.method.update({
      integrationID: AGY_PROVIDER_ID,
      method: {
        id: OAUTH_METHOD_ID,
        type: "oauth",
        label: "Sign in with Google (Antigravity CLI)",
      },
      label: (credential) =>
        typeof credential.metadata?.email === "string" ? credential.metadata.email : undefined,
      authorize: async () => {
        const authorization = await authorizeAgy();

        return {
          mode: "code",
          url: authorization.url,
          instructions:
            "Complete Google sign-in in your browser. After authorization redirects to https://antigravity.google/oauth-callback?code=..., copy the full redirect URL (or code parameter) and paste it below:",
          callback: async (rawInput: string): Promise<OpenCodeV2OAuthCredential> => {
            const parsed = parseOAuthCallbackInput(rawInput);
            if (!parsed.code) {
              throw new Error("Missing authorization code in callback input.");
            }
            if (parsed.state && parsed.state !== authorization.state) {
              throw new Error("OAuth state mismatch in callback input.");
            }

            const exchangeResult = await exchangeAgyWithVerifier(parsed.code, authorization.verifier);
            if (exchangeResult.type !== "success") {
              throw new Error(exchangeResult.error || "Google OAuth token exchange failed.");
            }

            const initialRefresh = formatRefreshParts({
              refreshToken: exchangeResult.refresh,
            });

            let authRecord: OAuthAuthDetails = {
              type: "oauth",
              refresh: initialRefresh,
              access: exchangeResult.access,
              expires: Math.max(0, Math.floor(exchangeResult.expires)),
            };

            try {
              const projectContext = await ensureProjectContext(
                authRecord,
                persistAuthClient,
                getConfiguredProjectId(),
              );
              authRecord = {
                ...authRecord,
                refresh: projectContext.auth.refresh,
              };
            } catch (error) {
              const msg = error instanceof Error ? error.message : String(error);
              console.warn(`[Agy Auth] Deferred project binding until first request: ${msg}`);
            }

            try {
              saveStoredAuthToJson(authRecord);
            } catch {
              // Non-fatal: OpenCode v2 persists credentials natively in Credential.Service
            }

            void syncAvailableModels(authRecord);

            return {
              type: "oauth",
              methodID: OAUTH_METHOD_ID,
              refresh: authRecord.refresh,
              access: authRecord.access,
              expires: Math.max(0, Math.floor(authRecord.expires)),
              ...(exchangeResult.email ? { metadata: { email: exchangeResult.email } } : {}),
            };
          },
        };
      },
      refresh: async (credential): Promise<OpenCodeV2OAuthCredential> => {
        const refreshed = await refreshAccessToken(
          {
            type: "oauth",
            refresh: credential.refresh,
            access: credential.access,
            expires: credential.expires,
            metadata: credential.metadata,
          },
          persistAuthClient,
        );

        if (!refreshed) {
          throw new Error(
            "Failed to refresh Google Antigravity OAuth token. Reconnect the Antigravity CLI integration.",
          );
        }

        try {
          saveStoredAuthToJson(refreshed);
        } catch {
          // Non-fatal: OpenCode v2 persists refreshed credentials natively
        }

        return {
          type: "oauth",
          methodID: credential.methodID || OAUTH_METHOD_ID,
          refresh: refreshed.refresh,
          access: refreshed.access,
          expires: Math.max(0, Math.floor(refreshed.expires)),
          ...(credential.metadata ? { metadata: credential.metadata } : {}),
        };
      },
    });
  });

  // 2. Register google-agy provider and its static + dynamically discovered model catalog
  await ctx.provider.transform((editor) => {
    if (!editor) return;

    editor.update(AGY_PROVIDER_ID, applyProviderInfo);

    for (const [modelId, simple] of Object.entries(STATIC_MODELS_SIMPLE)) {
      editor.models.update(AGY_PROVIDER_ID, modelId, (model) => {
        applyModelInfo(model, modelId, simple);
      });
    }

    for (const [modelId, simple] of dynamicModels.entries()) {
      editor.models.update(AGY_PROVIDER_ID, modelId, (model) => {
        applyModelInfo(model, modelId, simple);
      });
    }
  });

  // 3. Register session HTTP request/response rewriting and quota-aware retry hooks
  await registerV2SessionHooks(ctx, { getConfiguredProjectId });

  let disposed = false;

  async function syncAvailableModels(authOverride?: OAuthAuthDetails): Promise<void> {
    if (disposed || typeof ctx.provider.reload !== "function") {
      return;
    }

    try {
      let auth = authOverride ?? (await resolveActiveOAuthCredential(ctx.integration));
      if (!auth?.refresh) return;

      if (!auth.access || accessTokenExpired(auth)) {
        const refreshed = await refreshAccessToken(auth, persistAuthClient);
        if (!refreshed) return;
        auth = refreshed;
      }

      const parts = parseRefreshParts(auth.refresh);
      const project = getConfiguredProjectId() || parts.managedProjectId || parts.projectId;
      if (!project) return;

      const resp = await agyFetch(`${AGY_CODE_ASSIST_ENDPOINT}/v1internal:fetchAvailableModels`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.access}`,
          "User-Agent": buildAgyCliUserAgent(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ project }),
      });

      if (!resp.ok || disposed) return;
      const payload = await resp.json();
      if (disposed) return;

      const addedNewModelsOrVariants = ingestAvailableModelsResponse(payload);
      if (addedNewModelsOrVariants && !disposed) {
        await ctx.provider.reload();
      }
    } catch {
      // Best-effort background catalog refresh; static catalog remains active
    }
  }

  void syncAvailableModels();

  return () => {
    disposed = true;
    getDiskSignatureCache()?.shutdown();
    shutdownTurnStateTracker();
    shutdownRetryCooldowns();
  };
}

export const v2PluginDefinition: OpenCodeV2PluginDefinition = defineOpenCodeV2Plugin({
  id: AGY_PROVIDER_ID,
  setup: setupOpenCodeV2,
});

export const createV2PluginDefinition = (): OpenCodeV2PluginDefinition => v2PluginDefinition;
