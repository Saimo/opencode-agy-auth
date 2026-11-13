import type { OAuthAuthDetails, OpenCodeV2IntegrationDomain, OpenCodeV2PluginContext, OpenCodeV2SessionHttpRequest, OpenCodeV2SessionHttpResponse, OpenCodeV2SessionRetry } from "./types";
interface TrackedRequestMeta {
    requestedModel?: string;
    sessionID?: string;
    streaming: boolean;
}
export interface V2SessionHookOptions {
    integration?: OpenCodeV2IntegrationDomain;
    getConfiguredProjectId?: () => string | undefined;
}
export declare function resolveActiveOAuthCredential(integration?: OpenCodeV2IntegrationDomain): Promise<OAuthAuthDetails | undefined>;
export declare function createV2HttpRequestHook(trackedRequests?: WeakMap<Request, TrackedRequestMeta>, options?: V2SessionHookOptions): (event: OpenCodeV2SessionHttpRequest) => Promise<void>;
export declare function createV2HttpResponseHook(trackedRequests?: WeakMap<Request, TrackedRequestMeta>): (event: OpenCodeV2SessionHttpResponse) => Promise<void>;
export declare function createV2RetryHook(): (event: OpenCodeV2SessionRetry) => Promise<void>;
export declare function registerV2SessionHooks(ctx: Pick<OpenCodeV2PluginContext, "session" | "integration">, options?: Omit<V2SessionHookOptions, "integration">): Promise<void>;
export {};
