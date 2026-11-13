import type { OpenCodeV2WebSearchResult } from "../plugin/types";
export interface AgyWebSearchRequestOptions {
    readonly query: string;
    readonly domain?: string;
    readonly accessToken: string;
    readonly projectId: string;
    readonly model?: string;
    readonly signal?: AbortSignal;
}
interface RawGroundingSupport {
    segment?: {
        partIndex?: number;
        startIndex?: number;
        endIndex?: number;
        text?: string;
    };
    groundingChunkIndices?: number[];
}
export interface DeduplicatedGroundingSource {
    readonly citationIndex: number;
    readonly uri: string;
    readonly title: string;
    readonly snippets: string[];
}
/**
 * Injects sorted inline `[1][2]` markers at UTF-8 byte offsets from Gemini `groundingSupports`.
 */
export declare function injectInlineCitations(summaryText: string, supports: readonly RawGroundingSupport[], chunkToCitation: ReadonlyMap<number, number>): string;
/**
 * Parses a Code Assist `:generateContent` grounded web search payload into OpenCode v2 `WebSearch.Result[]`.
 */
export declare function parseAgyWebSearchPayload(payload: unknown, query: string): OpenCodeV2WebSearchResult[];
export declare function buildAgyWebSearchRequestBody(input: {
    query: string;
    domain?: string;
    projectId: string;
    model: string;
}): Record<string, unknown>;
/**
 * Executes a grounded web search through Antigravity's Code Assist API (`requestType: "web_search"`).
 */
export declare function executeAgyWebSearch(options: AgyWebSearchRequestOptions): Promise<OpenCodeV2WebSearchResult[]>;
export {};
