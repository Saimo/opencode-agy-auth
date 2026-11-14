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
export declare const ORDERED_EFFORT_LEVELS: readonly ["minimal", "low", "medium", "high", "xhigh", "max"];
export type AgyEffortLevel = (typeof ORDERED_EFFORT_LEVELS)[number];
export declare const STATIC_MODELS_SIMPLE: Record<string, SimpleStaticModel>;
export declare const TIER_MAPPING: Record<string, {
    minimal?: string;
    low?: string;
    medium?: string;
    high?: string;
    xhigh?: string;
    max?: string;
} & Record<string, string | undefined>>;
export declare function registerDynamicTierVariant(baseModelId: string, tier: string, targetModelId: string): boolean;
export declare function getEffectiveTierMapping(baseModelId: string): Record<string, string | undefined> | undefined;
export declare function getStaticModelEfforts(modelId: string): string[];
export declare function resetDynamicTierMappingsForTesting(): void;
/**
 * Resolves a cold-start model ID and optional request headers or `@tier` suffix
 * into its tier variant ID.
 */
export declare function resolveModelTier(baseModelId: string, headersOrInit?: RequestInit | unknown): string;
