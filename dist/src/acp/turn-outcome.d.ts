export declare const CORTEX_STEP_TYPE_ERROR_MESSAGE = 17;
export interface SqliteStepRow {
    readonly idx: number;
    readonly step_type: number;
    readonly status?: unknown;
    readonly step_payload?: Uint8Array | Buffer | string | null;
    readonly error_details?: Uint8Array | Buffer | string | null;
}
export interface AgyTurnErrorOutcome {
    readonly stepIdx: number;
    readonly message: string;
    readonly statusCode?: number;
    readonly retryAfterMs?: number;
    readonly quotaResetTimestamp?: string;
    readonly isInvalidThinkingSignature: boolean;
    readonly isRetryable: boolean;
}
declare const AI_SDK_ERROR_SYMBOL: unique symbol;
declare const AI_SDK_API_CALL_ERROR_SYMBOL: unique symbol;
export declare class AgyTurnOutcomeError extends Error {
    readonly [AI_SDK_ERROR_SYMBOL] = true;
    readonly [AI_SDK_API_CALL_ERROR_SYMBOL] = true;
    readonly url = "acp://agy/session/prompt";
    readonly requestBodyValues: Record<string, unknown>;
    readonly status?: number;
    readonly statusCode?: number;
    readonly retryAfterMs?: number;
    readonly quotaResetTimestamp?: string;
    readonly isInvalidThinkingSignature: boolean;
    readonly isRetryable: boolean;
    readonly responseHeaders?: Record<string, string>;
    readonly responseBody?: string;
    constructor(outcome: AgyTurnErrorOutcome);
}
/**
 * Reads `MAX(idx)` from `<sessionId>.db` before sending `session/prompt` so
 * out-of-band inspection only considers steps produced by the current turn.
 */
export declare function readPreTurnMaxStepIdx(dbPath: string): Promise<number>;
/**
 * Inspects `<sessionId>.db` for terminal `step_type = 17` (`ERROR_MESSAGE`) rows
 * added after `preTurnMaxIdx`. Ignores transient mid-turn errors that were
 * superseded by a later non-error step (`idx > errorRow.idx`).
 */
export declare function inspectTurnOutcomeFromDb(dbPath: string, preTurnMaxIdx: number): Promise<AgyTurnErrorOutcome | undefined>;
/**
 * Pure evaluator over `steps` rows (`idx > preTurnMaxIdx`) — separated for deterministic unit testing.
 */
export declare function evaluateTurnStepRows(rows: ReadonlyArray<SqliteStepRow>): AgyTurnErrorOutcome | undefined;
export declare function parseErrorStepRow(row: SqliteStepRow): AgyTurnErrorOutcome;
export declare function isInvalidThinkingSignatureText(text: string): boolean;
/**
 * Genuine protobuf wire-format scanner (`wireType` 0/1/2/5) that extracts nested
 * UTF-8 string fields and HTTP status varints without external dependencies.
 */
export declare function scanProtobufWire(bytes: Uint8Array, start: number, end: number, outStrings: string[], outCodes: number[], depth?: number): boolean;
export {};
