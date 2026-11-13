/**
 * Normalizes Gemini/Agy responses, preserving request metadata and usage counters.
 */
export declare function transformAgyResponse(response: Response, streaming: boolean, _ignoredDebugContext?: unknown, requestedModel?: string, sessionId?: string): Promise<Response>;
