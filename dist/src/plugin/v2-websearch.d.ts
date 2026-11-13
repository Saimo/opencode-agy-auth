import type { OpenCodeV2PluginContext, OpenCodeV2PluginOptions } from "./types";
export interface ResolvedWebSearchConfig {
    readonly enabled: boolean;
    readonly setDefault: boolean;
    readonly model?: string;
}
/**
 * Resolves Antigravity web search configuration.
 * Enabled by default; opt out via `options.webSearch: false` or `OPENCODE_AGY_WEBSEARCH=false`.
 */
export declare function resolveWebSearchConfig(options?: OpenCodeV2PluginOptions): ResolvedWebSearchConfig;
export declare function registerV2WebSearch(ctx: OpenCodeV2PluginContext, deps: {
    getConfiguredProjectId: () => string | undefined;
}): Promise<(() => Promise<void> | void) | undefined>;
