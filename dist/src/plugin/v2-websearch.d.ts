import { type AcpClientPool, type AgySpawnConfig } from "../acp/client";
import type { OpenCodeV2PluginContext, OpenCodeV2PluginOptions, OpenCodeV2WebSearchResult } from "./types";
export declare const AGY_WEBSEARCH_PROVIDER_ID = "google-agy";
export declare const AGY_WEBSEARCH_PROVIDER_NAME = "Antigravity CLI";
export interface ResolvedWebSearchConfig {
    readonly enabled: boolean;
    readonly setDefault: boolean;
    readonly model?: string;
}
export declare function resolveWebSearchConfig(options?: OpenCodeV2PluginOptions): ResolvedWebSearchConfig;
export interface DiscoveredWebSource {
    readonly url: string;
    readonly title?: string;
    readonly snippet?: string;
}
/**
 * Parses `agy acp` web search text output + harvested `search_web` tool sources
 * into OpenCode's `OpenCodeV2WebSearchResult[]` schema.
 */
export declare function parseAgyWebSearchOutput(rawText: string, query: string, toolSources?: ReadonlyArray<DiscoveredWebSource>): OpenCodeV2WebSearchResult[];
export declare function buildWebSearchPrompt(query: string, domain?: string): string;
export declare function executeAgyWebSearch(input: {
    readonly query: string;
    readonly domain?: string;
    readonly model?: string;
    readonly signal?: AbortSignal;
    readonly pool: AcpClientPool;
    readonly spawnConfig: AgySpawnConfig;
}): Promise<OpenCodeV2WebSearchResult[]>;
export declare function registerV2WebSearch(ctx: OpenCodeV2PluginContext, deps: {
    pool: AcpClientPool;
    getSpawnConfig: () => Promise<AgySpawnConfig> | AgySpawnConfig;
    cleanups: Array<() => Promise<void> | void>;
}): Promise<void>;
