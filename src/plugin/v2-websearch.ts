import { AGY_PROVIDER_ID } from "../constants";
import { executeAgyWebSearch } from "../sdk/websearch";
import { accessTokenExpired, parseRefreshParts } from "./auth";
import { clearCachedAuth } from "./cache";
import { ensureProjectContext, invalidateProjectContextCache } from "./project";
import { refreshAccessToken } from "./token";
import type {
  OAuthAuthDetails,
  OpenCodeV2PluginContext,
  OpenCodeV2PluginOptions,
  OpenCodeV2WebSearchOptions,
  OpenCodeV2WebSearchResult,
  PluginClient,
} from "./types";
import { resolveActiveOAuthCredential } from "./v2-session";
import { saveStoredAuthToJson } from "./v2-storage";

const persistAuthClient: PluginClient = {
  auth: {
    async set({ body }) {
      try {
        saveStoredAuthToJson(body);
      } catch {
        // Best-effort sync to auth.json
      }
    },
  },
};

export interface ResolvedWebSearchConfig {
  readonly enabled: boolean;
  readonly setDefault: boolean;
  readonly model?: string;
}

/**
 * Resolves Antigravity web search configuration.
 * Enabled by default; opt out via `options.webSearch: false` or `OPENCODE_AGY_WEBSEARCH=false`.
 */
export function resolveWebSearchConfig(options?: OpenCodeV2PluginOptions): ResolvedWebSearchConfig {
  const envFlag = process.env.OPENCODE_AGY_WEBSEARCH?.trim().toLowerCase();
  if (envFlag === "false" || envFlag === "0" || envFlag === "off" || envFlag === "no") {
    return { enabled: false, setDefault: false };
  }

  const raw = options?.webSearch;
  if (raw === false) {
    return { enabled: false, setDefault: false };
  }

  if (raw && typeof raw === "object") {
    const obj = raw as OpenCodeV2WebSearchOptions;
    if (obj.enabled === false) {
      return { enabled: false, setDefault: false };
    }
    return {
      enabled: true,
      setDefault: obj.default !== false,
      model: typeof obj.model === "string" && obj.model.trim() ? obj.model.trim() : undefined,
    };
  }

  return { enabled: true, setDefault: true };
}

export async function registerV2WebSearch(
  ctx: OpenCodeV2PluginContext,
  deps: { getConfiguredProjectId: () => string | undefined },
): Promise<(() => Promise<void> | void) | undefined> {
  if (!ctx.websearch || typeof ctx.websearch.transform !== "function") {
    return undefined;
  }

  const config = resolveWebSearchConfig(ctx.options);
  if (!config.enabled) {
    return undefined;
  }

  const runSearchWithAuth = async (
    query: string,
    signal: AbortSignal,
    forceRefresh: boolean,
  ): Promise<{ results: OpenCodeV2WebSearchResult[]; auth: OAuthAuthDetails }> => {
    let auth = await resolveActiveOAuthCredential(ctx.integration);
    if (!auth?.refresh) {
      throw new Error(
        "Not signed in to Antigravity CLI. Run `opencode auth login` and connect Antigravity CLI.",
      );
    }

    if (forceRefresh || !auth.access || accessTokenExpired(auth)) {
      if (forceRefresh) {
        clearCachedAuth(auth.refresh);
        invalidateProjectContextCache(auth.refresh);
      }
      const refreshed = await refreshAccessToken(
        forceRefresh ? { ...auth, expires: 0 } : auth,
        persistAuthClient,
      );
      if (!refreshed) {
        throw new Error(
          "Failed to refresh Google Antigravity OAuth token for web search. Reconnect Antigravity CLI.",
        );
      }
      auth = refreshed;
    }

    const configuredProjectId = deps.getConfiguredProjectId();
    let effectiveProjectId: string;
    try {
      const projectCtx = await ensureProjectContext(
        auth,
        persistAuthClient,
        configuredProjectId,
        config.model,
      );
      effectiveProjectId = projectCtx.effectiveProjectId;
      auth = projectCtx.auth;
    } catch (error) {
      const fallbackParts = parseRefreshParts(auth.refresh);
      const fallbackProject =
        configuredProjectId || fallbackParts.managedProjectId || fallbackParts.projectId;
      if (!fallbackProject) {
        throw error;
      }
      effectiveProjectId = fallbackProject;
    }

    const results = await executeAgyWebSearch({
      query,
      accessToken: auth.access,
      projectId: effectiveProjectId,
      model: config.model,
      signal,
    });

    return { results, auth };
  };

  const registration = await ctx.websearch.transform((editor) => {
    if (!editor) return;

    editor.add({
      id: AGY_PROVIDER_ID,
      name: "Antigravity CLI",
      execute: async ({ query }, { signal }) => {
        try {
          const { results } = await runSearchWithAuth(query, signal, false);
          return results;
        } catch (error) {
          const status = (error as { response?: { status?: number } })?.response?.status;
          if (status === 401 && !signal.aborted) {
            const { results } = await runSearchWithAuth(query, signal, true);
            return results;
          }
          throw error;
        }
      },
    });

    if (config.setDefault && editor.default.get() === undefined) {
      editor.default.set(AGY_PROVIDER_ID);
    }
  });

  if (registration && typeof registration.dispose === "function") {
    return () => registration.dispose();
  }
  return undefined;
}
