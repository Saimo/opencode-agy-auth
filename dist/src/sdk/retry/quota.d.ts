export interface QuotaContext {
    terminal: boolean;
    retryDelayMs?: number;
    reason?: string;
}
/**
 * Classifies Google Code Assist 429 responses into terminal quota exhaustion vs.
 * retryable rate limits / instantaneous model capacity overloads.
 */
export declare function classifyQuotaResponse(response: Response): Promise<QuotaContext | null>;
/**
 * Extracts the RetryInfo delay hint directly from the error payload.
 */
export declare function parseRetryDelayFromBody(response: Response): Promise<number | null>;
declare function parseRetryDelayValue(value: string | {
    seconds?: number;
    nanos?: number;
}): number | null;
declare function parseRetryDelayFromMessage(message: string): number | null;
export declare const retryInternals: {
    parseRetryDelayValue: typeof parseRetryDelayValue;
    parseRetryDelayFromMessage: typeof parseRetryDelayFromMessage;
};
export {};
