import { retryInternals } from "./quota";
export declare function initCooldownPersistence(): void;
/**
 * Sends a request with retry/exponential backoff semantics, consistent with Gemini/Agy CLI.
 */
export declare function fetchWithRetry(input: RequestInfo, init: RequestInit | undefined): Promise<Response>;
export declare function shutdownRetryCooldowns(): void;
export { retryInternals };
