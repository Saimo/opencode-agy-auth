import { type OpenCodeV2Cleanup, type OpenCodeV2ModelVariant, type OpenCodeV2PluginContext, type OpenCodeV2PluginDefinition } from "./types";
export { getSafeHeader, setSafeHeaders, toUrlString } from "./headers";
export { STATIC_MODELS_SIMPLE, TIER_MAPPING, resolveModelTier, type SimpleStaticModel } from "./tier";
export { getDiskSignatureCache, resetDiskSignatureCacheForTesting } from "./cache";
export { registerV2WebSearch, resolveWebSearchConfig } from "./v2-websearch";
export { executeAgyWebSearch, parseAgyWebSearchPayload } from "../sdk/websearch";
export { loadStoredAuthFromJson, saveStoredAuthToJson, setStoredAuthOverrideForTesting, } from "./v2-storage";
export declare function resetDynamicModelsForTesting(): void;
export declare function resolveModelVariants(modelId: string): OpenCodeV2ModelVariant[];
/**
 * Ingests a Code Assist `:fetchAvailableModels` payload, updating live `MODEL_PLACEHOLDER_M*`
 * enums and registering any newly available `agy` models or tier variants.
 * Returns `true` if any new models or tier variants were added.
 */
export declare function ingestAvailableModelsResponse(payload: unknown): boolean;
/**
 * Native OpenCode v2 setup for the `google-agy` Antigravity CLI OAuth provider.
 */
export declare function setupOpenCodeV2(ctx: OpenCodeV2PluginContext): Promise<OpenCodeV2Cleanup>;
export declare const v2PluginDefinition: OpenCodeV2PluginDefinition;
export declare const createV2PluginDefinition: () => OpenCodeV2PluginDefinition;
