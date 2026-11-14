import type { OpenCodeV2PluginContext, OpenCodeV2StorageDomain } from "../plugin/types";
import { type DiscoveredAgyCatalog } from "./catalog";
import { type AcpClientPool, type AgySpawnConfig } from "./client";
export type AgyAuthReadinessState = "unknown" | "ready" | "needs_auth" | "missing" | "failed";
export interface ClassifiedAgyAuthError {
    readonly state: "needs_auth" | "missing" | "failed";
    readonly message: string;
}
export interface AgyProbeOutcome {
    readonly state: AgyAuthReadinessState;
    readonly message?: string;
    readonly agentVersion?: string;
    readonly catalog?: DiscoveredAgyCatalog;
    readonly error?: unknown;
}
/**
 * Classifies ACP startup / `session/new` errors, explicitly catching both standard
 * `-32000` (`auth_required`) and `agy`'s headless `-32603` browser error (`#36037`).
 */
export declare function classifyAcpAuthError(error: unknown): ClassifiedAgyAuthError;
export declare function buildAgyLoginCommand(config?: AgySpawnConfig): string[];
/**
 * Instant synchronous hint used ONLY at `t = 0ms` cold-start before the live
 * `session/new` probe completes. Supports `auth.json`, OS-keyring-backed
 * `jetski_state.pbtxt`, and standalone `jetski-standalone-oauth-token`.
 * Authoritative readiness always comes from `probeAgyAuthAndCatalog()` (`#34389`).
 */
export declare function hasLocalAgyAuthHint(config?: AgySpawnConfig): boolean;
export declare function resolveEffectiveSpawnConfig(ctx: Pick<OpenCodeV2PluginContext, "options" | "integration" | "location">, overrides?: Partial<AgySpawnConfig>): Promise<AgySpawnConfig>;
/**
 * Probes authoritative `agy acp` auth readiness and discovers the full live model
 * + `thought_level` catalog via an ephemeral `initialize` + `session/new` session.
 * Never calls `authenticate` (which blocks waiting for an interactive browser).
 */
export declare function probeAgyAuthAndCatalog(pool: AcpClientPool, config: AgySpawnConfig, options?: {
    probeThoughtLevels?: boolean;
    signal?: AbortSignal;
    timeoutMs?: number;
}): Promise<AgyProbeOutcome>;
export declare class AgyAuthController {
    private readonly initialConfig;
    private readiness;
    private lastMessage;
    private disposed;
    constructor(initialConfig: AgySpawnConfig);
    get state(): AgyAuthReadinessState;
    get message(): string | undefined;
    get shouldActivateProvider(): boolean;
    hydrateFromStorage(storage?: OpenCodeV2StorageDomain, config?: AgySpawnConfig): Promise<void>;
    persistToStorage(storage?: OpenCodeV2StorageDomain, config?: AgySpawnConfig): Promise<void>;
    updateFromOutcome(outcome: Pick<AgyProbeOutcome, "state" | "message">): boolean;
    markDisposed(): void;
    get isDisposed(): boolean;
}
export declare function syncIntegrationConnectionStatus(ctx: Pick<OpenCodeV2PluginContext, "integration">, auth: AgyAuthController): Promise<void>;
export declare function registerAgyIntegration(ctx: OpenCodeV2PluginContext, deps: {
    auth: AgyAuthController;
    getSpawnConfig: () => AgySpawnConfig;
    onCredentialsChanged: () => Promise<void>;
    cleanups: Array<() => Promise<void> | void>;
}): Promise<void>;
