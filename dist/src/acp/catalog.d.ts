import type { OpenCodeV2ModelInfo, OpenCodeV2StorageDomain } from "../plugin/types";
import type { AcpConnection } from "./client";
import type { AcpSessionConfigOption, AcpSessionConfigSelectOption, AcpSessionSetupResult } from "./types";
export interface AgyCatalogModelEntry {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly thoughtLevels: ReadonlyArray<string>;
    readonly defaultThoughtLevel?: string;
    readonly maxTokens: number;
    readonly maxOutputTokens: number;
    readonly toolCall: boolean;
    readonly reasoning: boolean;
    readonly attachment: boolean;
    readonly source: "static" | "cache" | "live";
}
export interface PersistedAgyCatalog {
    readonly version: 1;
    readonly updatedAt: number;
    readonly defaultModelId?: string;
    readonly models: ReadonlyArray<{
        readonly id: string;
        readonly name: string;
        readonly description?: string;
        readonly thoughtLevels: ReadonlyArray<string>;
        readonly defaultThoughtLevel?: string;
    }>;
}
export interface DiscoveredAgyCatalog {
    readonly defaultModelId?: string;
    readonly models: ReadonlyArray<{
        readonly id: string;
        readonly name: string;
        readonly description?: string;
        readonly thoughtLevels: ReadonlyArray<string>;
        readonly defaultThoughtLevel?: string;
    }>;
}
export declare function flattenSelectOptions(option: AcpSessionConfigOption | undefined): AcpSessionConfigSelectOption[];
export declare function findConfigOption(configOptions: ReadonlyArray<AcpSessionConfigOption> | null | undefined, categoryOrId: "model" | "thought_level" | "mode" | string): Extract<AcpSessionConfigOption, {
    type: "select";
}> | undefined;
/**
 * Merges incoming `config_option_update` entries with previously known session
 * `configOptions` by `id` so partial updates (`#28433`, e.g. updating only `mode`
 * or `thought_level`) never drop the `model` option list.
 */
export declare function mergeSessionConfigOptions(previous: ReadonlyArray<AcpSessionConfigOption> | null | undefined, incoming: ReadonlyArray<AcpSessionConfigOption> | null | undefined): AcpSessionConfigOption[];
export declare function extractThoughtLevelsFromConfig(configOptions: ReadonlyArray<AcpSessionConfigOption> | null | undefined): {
    levels: string[];
    current?: string;
    configId?: string;
};
export declare function extractModelsFromSessionSetup(setup: Pick<AcpSessionSetupResult, "configOptions" | "models">): {
    modelConfigId?: string;
    currentModelId?: string;
    models: Array<{
        id: string;
        name: string;
        description?: string;
        inferredTiers?: string[];
    }>;
};
/**
 * Discovers all live `agy acp` models and probes per-model `thought_level` options
 * inside a single ACP session by stepping through `session/set_config_option`.
 */
export declare function discoverCatalogFromSession(connection: AcpConnection, sessionSetup: AcpSessionSetupResult, options?: {
    probeThoughtLevels?: boolean;
    restoreInitialModel?: boolean;
    signal?: AbortSignal;
}): Promise<DiscoveredAgyCatalog>;
export declare function toOpenCodeModelInfo(entry: AgyCatalogModelEntry): OpenCodeV2ModelInfo;
export interface ResolvedAcpModelSelection {
    readonly modelId: string;
    readonly thoughtLevel?: string;
    readonly modelConfigId?: string;
    readonly thoughtConfigId?: string;
}
export declare class AgyCatalogStore {
    private readonly models;
    private defaultModelId;
    private hasLive;
    private readonly explicitCacheDir;
    constructor(options?: {
        cacheDir?: string;
    });
    get hasLiveCatalog(): boolean;
    get defaultModel(): string | undefined;
    private seedStaticFallback;
    private getDiskCacheFilePath;
    private buildPersistedSnapshot;
    private tryLoadDiskCache;
    hydrateFromStorage(storage: OpenCodeV2StorageDomain | undefined): Promise<boolean>;
    private applyPersistedPayload;
    applyDiscoveredCatalog(discovered: DiscoveredAgyCatalog, storage?: OpenCodeV2StorageDomain): Promise<boolean>;
    /**
     * Updates session-observed configOptions incrementally without dropping any
     * previously known catalog models (`#28433`).
     */
    applyIncrementalConfigOptions(configOptions: ReadonlyArray<AcpSessionConfigOption> | null | undefined): void;
    listEntries(): AgyCatalogModelEntry[];
    listOpenCodeModels(): OpenCodeV2ModelInfo[];
    getEntry(modelId: string): AgyCatalogModelEntry | undefined;
    /**
     * Resolves an OpenCode model ID + requested effort/tier into the target ACP
     * `model` config option value and validated `thought_level` value.
     */
    resolveAcpModelAndThoughtLevel(requestedModelId: string, requestedEffort: string | undefined, sessionConfigOptions?: ReadonlyArray<AcpSessionConfigOption> | null): ResolvedAcpModelSelection;
}
