import { AGY_PROVIDER_ID } from "../constants";
import { buildAgyCliUserAgent } from "../sdk/user-agent";
import {
  isGenerativeLanguageRequest,
  parseGenerativeLanguageRequest,
  prepareAgyRequest,
  transformAgyResponse,
} from "../sdk/request";
import { classifyQuotaResponse, parseRetryDelayFromBody } from "../sdk/retry/quota";
import { getExponentialDelayWithJitter, isRetryableNetworkError, isRetryableStatus } from "../sdk/retry/helpers";
import { resolveCachedAuth } from "./cache";
import { accessTokenExpired, isOAuthAuth, parseRefreshParts } from "./auth";
import { refreshAccessToken } from "./token";
import { ensureProjectContext } from "./project";
import { resolveConfiguredProjectId } from "./provider";
import { loadStoredAuthFromJson, saveStoredAuthToJson } from "./v2-storage";
import { toUrlString } from "./headers";
import { resolveModelTier } from "./tier";
import type {
  OAuthAuthDetails,
  OpenCodeV2IntegrationDomain,
  OpenCodeV2PluginContext,
  OpenCodeV2SessionHttpRequest,
  OpenCodeV2SessionHttpResponse,
  OpenCodeV2SessionRetry,
  PluginClient,
} from "./types";

interface TrackedRequestMeta {
  requestedModel?: string;
  sessionID?: string;
  streaming: boolean;
}

export interface V2SessionHookOptions {
  integration?: OpenCodeV2IntegrationDomain;
  getConfiguredProjectId?: () => string | undefined;
}

const persistAuthClient: PluginClient = {
  auth: {
    async set({ body }) {
      try {
        saveStoredAuthToJson(body);
      } catch {
        // Ignore best-effort auth.json sync failures
      }
    },
  },
};

function stripSensitiveAndInternalHeaders(headers: Headers): void {
  for (const key of Array.from(headers.keys())) {
    const lower = key.toLowerCase();
    if (
      lower === "x-api-key" ||
      lower === "api-key" ||
      lower === "x-goog-api-key" ||
      lower === "x-agy-tier" ||
      lower === "x-session-affinity" ||
      lower === "x-session-id" ||
      lower === "x-parent-session-id" ||
      lower.startsWith("x-opencode-")
    ) {
      headers.delete(key);
    }
  }
}

function stripUrlApiKeys(rawUrl: string): string {
  try {
    const parsedUrl = new URL(rawUrl);
    let changed = false;
    for (const param of ["key", "x-goog-api-key", "api-key"]) {
      if (parsedUrl.searchParams.has(param)) {
        parsedUrl.searchParams.delete(param);
        changed = true;
      }
    }
    return changed ? parsedUrl.toString() : rawUrl;
  } catch {
    return rawUrl;
  }
}

async function resolveActiveOAuthCredential(
  integration?: OpenCodeV2IntegrationDomain,
): Promise<OAuthAuthDetails | undefined> {
  const connApi = integration?.connection;
  if (typeof connApi?.active === "function" && typeof connApi?.resolve === "function") {
    try {
      const connection = await connApi.active(AGY_PROVIDER_ID);
      if (connection) {
        const resolved = await connApi.resolve(connection);
        if (resolved && typeof resolved === "object") {
          // OpenCode v2 `connection.resolve` returns Credential.Value directly (`{ type: "oauth", access, refresh, expires, ... }`)
          const candidate =
            resolved.type === "oauth"
              ? resolved
              : (resolved as { credential?: unknown }).credential;
          if (
            candidate &&
            typeof candidate === "object" &&
            (candidate as { type?: string }).type === "oauth" &&
            typeof (candidate as { access?: unknown }).access === "string" &&
            typeof (candidate as { refresh?: unknown }).refresh === "string"
          ) {
            const oauth = candidate as {
              access: string;
              refresh: string;
              expires?: number;
              metadata?: Record<string, unknown>;
            };
            return {
              type: "oauth",
              access: oauth.access,
              refresh: oauth.refresh,
              expires: typeof oauth.expires === "number" ? oauth.expires : Date.now() + 3600_000,
              metadata: oauth.metadata,
            };
          }
        }
      }
    } catch {
      // Fall through to auth.json fallback
    }
  }

  const stored = loadStoredAuthFromJson();
  if (stored && isOAuthAuth(stored)) {
    return stored;
  }
  return undefined;
}

export function createV2HttpRequestHook(
  trackedRequests: WeakMap<Request, TrackedRequestMeta> = new WeakMap(),
  options: V2SessionHookOptions = {},
) {
  return async (event: OpenCodeV2SessionHttpRequest) => {
    if (!event?.request) return;

    const rawUrl = event.request.url || "";
    const isGL = isGenerativeLanguageRequest(rawUrl);
    const isInternal = rawUrl.includes("cloudcode-pa.googleapis.com");

    if (!isGL && !isInternal) {
      return;
    }

    let authRecord = await resolveActiveOAuthCredential(options.integration);
    if (authRecord) {
      authRecord = resolveCachedAuth(authRecord);
      if (accessTokenExpired(authRecord)) {
        const refreshed = await refreshAccessToken(authRecord, persistAuthClient);
        if (refreshed) {
          authRecord = refreshed;
          try {
            saveStoredAuthToJson(refreshed);
          } catch {
            // Best-effort sync
          }
        }
      }
    }

    if (isInternal && !isGL) {
      const headers = new Headers(event.request.headers);
      stripSensitiveAndInternalHeaders(headers);
      if (authRecord?.access && !headers.has("authorization")) {
        headers.set("Authorization", `Bearer ${authRecord.access}`);
      }
      headers.set("User-Agent", buildAgyCliUserAgent(event.model?.id));

      const nextRequest = new Request(rawUrl, {
        method: event.request.method || "POST",
        headers,
        body: event.request.body ? await event.request.clone().arrayBuffer() : undefined,
      });
      trackedRequests.set(nextRequest, {
        requestedModel: event.model?.id,
        sessionID: event.sessionID,
        streaming: rawUrl.includes(":streamGenerateContent"),
      });
      event.request = nextRequest;
      return;
    }

    const cleanUrl = stripUrlApiKeys(rawUrl);
    const parsedTarget = parseGenerativeLanguageRequest(cleanUrl);
    const baseModel = (parsedTarget?.effectiveModel ?? event.model?.id ?? "").replace(/^google-agy\//, "");

    // Merge variant tier from OpenCode v2's `event.model.variant` with any `x-agy-tier` header
    const tierHeaders = new Headers(event.request.headers);
    if (event.model?.variant && !tierHeaders.has("x-agy-tier")) {
      tierHeaders.set("x-agy-tier", event.model.variant);
    }
    const resolvedModel = baseModel ? resolveModelTier(baseModel, { headers: tierHeaders }) : baseModel;
    const modifiedUrl =
      baseModel && resolvedModel && baseModel !== resolvedModel
        ? cleanUrl.replace(`models/${baseModel}`, `models/${resolvedModel}`)
        : cleanUrl;

    if (!authRecord?.access) {
      const headers = new Headers(event.request.headers);
      stripSensitiveAndInternalHeaders(headers);
      headers.set("User-Agent", buildAgyCliUserAgent(resolvedModel || undefined));
      event.request = new Request(cleanUrl, {
        method: event.request.method || "POST",
        headers,
        body: event.request.body ? await event.request.clone().arrayBuffer() : undefined,
      });
      return;
    }

    const configuredProjectId = resolveConfiguredProjectId({
      configProjectId: options.getConfiguredProjectId?.(),
    });

    let effectiveProjectId: string;
    try {
      const projectContext = await ensureProjectContext(
        authRecord,
        persistAuthClient,
        configuredProjectId,
        resolvedModel || undefined,
      );
      effectiveProjectId = projectContext.effectiveProjectId;
      authRecord = projectContext.auth;
    } catch (error) {
      const fallbackParts = parseRefreshParts(authRecord.refresh);
      const fallbackProject =
        configuredProjectId || fallbackParts.projectId || fallbackParts.managedProjectId;
      if (!fallbackProject) {
        throw error;
      }
      effectiveProjectId = fallbackProject;
    }

    let bodyText: string | undefined;
    try {
      bodyText = await event.request.clone().text();
    } catch {
      bodyText = undefined;
    }

    const transformed = prepareAgyRequest(
      modifiedUrl,
      {
        method: event.request.method || "POST",
        headers: tierHeaders,
        body: bodyText,
      },
      authRecord.access,
      effectiveProjectId,
      undefined,
      event.sessionID,
    );

    const targetUrl = toUrlString(transformed.request);
    const nextRequest = new Request(targetUrl, {
      method: transformed.init.method || "POST",
      headers: transformed.init.headers,
      body: transformed.init.body,
    });

    trackedRequests.set(nextRequest, {
      requestedModel: transformed.requestedModel ?? (resolvedModel || undefined),
      sessionID: transformed.sessionId ?? event.sessionID,
      streaming: transformed.streaming,
    });

    event.request = nextRequest;
  };
}

export function createV2HttpResponseHook(
  trackedRequests: WeakMap<Request, TrackedRequestMeta> = new WeakMap(),
) {
  return async (event: OpenCodeV2SessionHttpResponse) => {
    if (!event?.response || !(event.response instanceof Response)) return;

    const rawUrl = event.request?.url || "";
    if (!rawUrl.includes("cloudcode-pa.googleapis.com")) {
      return;
    }

    const tracked = event.request ? trackedRequests.get(event.request) : undefined;
    const isStreaming = Boolean(
      tracked?.streaming ||
        rawUrl.includes(":streamGenerateContent") ||
        event.response.headers.get("content-type")?.includes("text/event-stream"),
    );

    const requestedModel =
      tracked?.requestedModel ??
      event.model?.id ??
      parseGenerativeLanguageRequest(rawUrl)?.effectiveModel;
    const sessionId = tracked?.sessionID ?? event.sessionID;

    event.response = await transformAgyResponse(
      event.response,
      isStreaming,
      null,
      requestedModel,
      sessionId,
    );
  };
}

export function createV2RetryHook() {
  return async (event: OpenCodeV2SessionRetry) => {
    if (!event?.error) return;

    const status = event.error.status;
    const bodyText = event.error.response?.body;

    if (status === 429) {
      if (bodyText) {
        const synthetic = new Response(bodyText, { status: 429 });
        const quota = await classifyQuotaResponse(synthetic);
        if (quota?.terminal) {
          event.decision = { retry: false };
          return;
        }
        if (quota?.retryDelayMs !== undefined) {
          event.decision = { retry: true, delay: Math.max(0, Math.ceil(quota.retryDelayMs)) };
          return;
        }
      }

      const fallbackDelay =
        event.error.retryAfterMs ??
        (event.decision?.retry ? event.decision.delay : getExponentialDelayWithJitter(event.attempt || 1));
      event.decision = { retry: true, delay: Math.max(0, Math.ceil(fallbackDelay)) };
      return;
    }

    if (typeof status === "number" && isRetryableStatus(status)) {
      let bodyDelay: number | null = null;
      if (bodyText) {
        bodyDelay = await parseRetryDelayFromBody(new Response(bodyText, { status }));
      }
      const delay =
        bodyDelay ??
        event.error.retryAfterMs ??
        (event.decision?.retry ? event.decision.delay : getExponentialDelayWithJitter(event.attempt || 1));
      event.decision = { retry: true, delay: Math.max(0, Math.ceil(delay)) };
      return;
    }

    if (status === undefined && isRetryableNetworkError(event.error)) {
      if (!event.decision?.retry) {
        event.decision = {
          retry: true,
          delay: getExponentialDelayWithJitter(event.attempt || 1),
        };
      }
    }
  };
}

export async function registerV2SessionHooks(
  ctx: Pick<OpenCodeV2PluginContext, "session" | "integration">,
  options: Omit<V2SessionHookOptions, "integration"> = {},
): Promise<void> {
  const trackedRequests = new WeakMap<Request, TrackedRequestMeta>();
  const hookOptions: V2SessionHookOptions = {
    integration: ctx.integration,
    ...options,
  };

  await ctx.session.hook("http.request", createV2HttpRequestHook(trackedRequests, hookOptions), {
    providerID: AGY_PROVIDER_ID,
  });
  await ctx.session.hook("http.response", createV2HttpResponseHook(trackedRequests), {
    providerID: AGY_PROVIDER_ID,
  });
  await ctx.session.hook("retry", createV2RetryHook(), {
    providerID: AGY_PROVIDER_ID,
  });
}
