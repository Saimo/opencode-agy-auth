import type { AgyToolMode, OpenCodeV2PermissionDomain, OpenCodeV2SessionRequestKind, OpenCodeV2StorageDomain } from "../plugin/types";
import { type AgyCatalogStore } from "./catalog";
import { type AcpClientPool, type AgySpawnConfig } from "./client";
import { type AcpAgentCapabilities, type AcpContentBlock, type AcpPromptUsage, type AcpRequestPermissionParams, type AcpToolCallPayload, type JSONValue, type LanguageModelV3CallOptions, type LanguageModelV3FinishReason, type LanguageModelV3Message, type LanguageModelV3Prompt, type LanguageModelV3StreamPart, type LanguageModelV3ToolResultPart, type LanguageModelV3Usage } from "./types";
export interface PersistedAgySessionRecord {
    readonly acpSessionId: string;
    readonly cwd: string;
    readonly systemHash: string;
    readonly syncedMessageDigests: ReadonlyArray<string>;
    readonly updatedAt: number;
}
export interface AgySessionManagerDeps {
    readonly pool: AcpClientPool;
    readonly catalog: AgyCatalogStore;
    readonly getSpawnConfig: () => Promise<AgySpawnConfig> | AgySpawnConfig;
    readonly getToolMode: () => AgyToolMode;
    readonly getWatchdogTimeoutMs: () => number;
    readonly storage?: OpenCodeV2StorageDomain;
    readonly permission?: OpenCodeV2PermissionDomain;
    readonly onAuthFailure?: (message: string) => void;
}
export declare function extractCallRoutingMetadata(options: LanguageModelV3CallOptions): {
    sessionId?: string;
    kind: OpenCodeV2SessionRequestKind;
    agent?: string;
    forkSourceSessionId?: string;
    effort?: string;
    mode?: string;
    toolModeOverride?: AgyToolMode;
};
export declare function computeMessageDigest(message: LanguageModelV3Message): string;
export declare function extractSystemAndConversation(prompt: LanguageModelV3Prompt, options: LanguageModelV3CallOptions): {
    systemAppend: string;
    systemHash: string;
    nonSystemMessages: LanguageModelV3Message[];
    digests: string[];
};
export declare function extractTrailingToolResults(messages: ReadonlyArray<LanguageModelV3Message>): LanguageModelV3ToolResultPart[];
/**
 * Builds ACP prompt content blocks from a sequence of OpenCode messages.
 * If `includeCheckpointForHistory` is true and prior assistant/tool messages exist
 * before the latest user message (e.g. session fork, rewind, compaction, or `#28889`
 * recovery), wraps prior turns in `<conversation-checkpoint>`.
 */
export declare function buildPromptBlocksFromMessages(messages: ReadonlyArray<LanguageModelV3Message>, capabilities?: AcpAgentCapabilities, options?: {
    forceCheckpoint?: boolean;
}): AcpContentBlock[];
export declare function mapAcpUsageToV3(usage?: AcpPromptUsage | null): LanguageModelV3Usage;
export declare function mapAcpStopReasonToV3(stopReason: string | undefined): LanguageModelV3FinishReason;
/**
 * Synthesizes a structured `NonNullable<JSONValue>` result for `"hybrid"` mode
 * native Cortex tools when `rawOutput` is omitted (`#36138`).
 */
export declare function synthesizeNativeToolOutput(payload: AcpToolCallPayload): NonNullable<JSONValue>;
export declare function mapNativeToolPermissionChecks(params: AcpRequestPermissionParams, cwd: string): Array<{
    action: string;
    resources: string[];
    metadata: Record<string, unknown>;
}>;
export declare class AgySessionManager {
    private readonly deps;
    private readonly liveSessions;
    private readonly persistedRecords;
    private readonly sessionLocks;
    private disposed;
    constructor(deps: AgySessionManagerDeps);
    private getSessionLock;
    private loadPersistedRecord;
    private savePersistedRecord;
    createStream(requestedModelId: string, callOptions: LanguageModelV3CallOptions): ReadableStream<LanguageModelV3StreamPart>;
    private inspectForAuthFailure;
    private normalizeOutboundError;
    private applySessionModelThoughtAndMode;
    private runStatefulSessionStep;
    private executeNewOrResumedStatefulTurn;
    private runStatelessAuxiliaryCall;
    private disposeLiveBinding;
    dispose(): Promise<void>;
}
