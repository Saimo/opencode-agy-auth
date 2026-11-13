export interface SimpleStaticModel {
    name: string;
    description: string;
    maxTokens: number;
    maxOutputTokens: number;
    toolCall: boolean;
    reasoning: boolean;
    attachment: boolean;
    cost?: {
        input: number;
        output: number;
        cache?: {
            read: number;
            write: number;
        };
    };
}
export declare const STATIC_MODELS_SIMPLE: Record<string, SimpleStaticModel>;
export declare const TIER_MAPPING: Record<string, {
    low?: string;
    high?: string;
    medium?: string;
    minimal?: string;
    xhigh?: string;
} & Record<string, string | undefined>>;
export declare function registerDynamicTierVariant(baseModelId: string, tier: string, targetModelId: string): boolean;
export declare function getEffectiveTierMapping(baseModelId: string): Record<string, string | undefined> | undefined;
export declare function resetDynamicTierMappingsForTesting(): void;
/**
 * Resolves a model ID and optional request headers or suffix into the appropriate tier variant.
 */
export declare function resolveModelTier(baseModelId: string, headersOrInit?: RequestInit | unknown): string;
