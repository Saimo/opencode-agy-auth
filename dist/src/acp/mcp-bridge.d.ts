import type { AgyToolMode } from "../plugin/types";
import type { AcpAgentCapabilities, AcpMcpServer, LanguageModelV3FunctionTool, LanguageModelV3ProviderTool, LanguageModelV3ToolChoice, LanguageModelV3ToolResultOutput, LanguageModelV3ToolResultPart } from "./types";
export declare const AGY_MCP_SERVER_NAME = "opencode";
export type McpToolResultBlock = {
    readonly type: "text";
    readonly text: string;
} | {
    readonly type: "image";
    readonly data: string;
    readonly mimeType: string;
} | {
    readonly type: "resource";
    readonly resource: {
        readonly uri: string;
        readonly mimeType?: string;
        readonly text: string;
    } | {
        readonly uri: string;
        readonly mimeType?: string;
        readonly blob: string;
    };
};
export interface McpCallToolResult {
    readonly content: ReadonlyArray<McpToolResultBlock>;
    readonly isError?: boolean;
}
export interface ParkedOpenCodeToolCall {
    readonly callId: string;
    readonly mcpToolName: string;
    readonly toolName: string;
    readonly args: Record<string, unknown>;
    readonly argsJson: string;
}
/**
 * Strips `agy`'s `"Run mcp_opencode_..."` wrapper prefix from ACP titles/names (`#36138`).
 */
export declare function stripAgyMcpTitlePrefix(rawTitleOrName: string): string;
export declare function isAgyMcpBridgedToolCall(input: {
    title?: string | null;
    toolCallId?: string | null;
    meta?: Record<string, unknown> | null;
}): boolean;
/**
 * Removes Antigravity's injected `toolSummary` field unless the OpenCode tool's
 * JSON Schema explicitly declares `properties.toolSummary` (`#36138`).
 */
export declare function stripInjectedToolSummary(rawArgs: unknown, inputSchema?: Record<string, unknown>): Record<string, unknown>;
/**
 * Converts AI SDK `LanguageModelV3ToolResultOutput` into MCP `CallToolResult`,
 * preserving multimodal `image` and `resource` blocks (`#36144`).
 */
export declare function convertToolResultOutputToMcp(output: LanguageModelV3ToolResultOutput | unknown): McpCallToolResult;
/**
 * Per-session OpenCode MCP bridge server implementing the Pause-and-Yield state machine.
 */
export declare class OpenCodeMcpBridge {
    private server;
    private port;
    private readonly authToken;
    private readonly toolsByMcpName;
    private readonly parkedCalls;
    private batchWaiters;
    private coalesceTimer;
    private maxWaitTimer;
    private onActivityCallback;
    private acceptingCalls;
    private lastCancelReason;
    private closed;
    setOnActivity(cb: (() => void) | undefined): void;
    /**
     * Opens the turn gate so incoming MCP `tools/call` invocations are accepted
     * for the active `session/prompt` turn.
     */
    beginTurn(): void;
    /**
     * Closes the turn gate when a `session/prompt` turn settles or is aborted so
     * late/straggler `tools/call` HTTP requests cannot leak into `parkedCalls`
     * across turns or hang `session/cancel`.
     */
    endTurn(reason?: string): void;
    get hasParkedToolCalls(): boolean;
    get parkedCount(): number;
    get batchWaiterCount(): number;
    updateTools(tools: ReadonlyArray<LanguageModelV3FunctionTool | LanguageModelV3ProviderTool> | undefined, toolChoice?: LanguageModelV3ToolChoice, toolMode?: AgyToolMode): void;
    start(): Promise<void>;
    toAcpMcpServer(agentCapabilities?: AcpAgentCapabilities): AcpMcpServer;
    /**
     * Resolves as soon as one or more un-emitted MCP `tools/call` invocations are
     * parked waiting for OpenCode tool execution (coalescing parallel tool calls).
     * Pass `signal` to unregister the waiter cleanly when the current step finishes
     * without tool calls or is aborted.
     */
    waitForNextToolBatch(signal?: AbortSignal): Promise<ParkedOpenCodeToolCall[]>;
    /**
     * Supplies OpenCode's `LanguageModelV3ToolResultPart` outputs to the parked
     * MCP `tools/call` promises so `agy acp` resumes its paused `session/prompt`.
     * Returns the number of matched parked calls resolved.
     */
    supplyToolResults(results: ReadonlyArray<LanguageModelV3ToolResultPart>): number;
    /**
     * Cancels any parked `tools/call` requests (e.g., on user abort, session rewind,
     * or worker teardown) so HTTP requests never hang, and clears stale batch waiters.
     */
    cancelParkedCalls(reason?: string): void;
    close(): Promise<void>;
    private takeUnemittedCalls;
    private scheduleBatchFlush;
    private clearBatchTimers;
    private flushBatchWaiters;
    private handleHttpRequest;
    private dispatchMcpRpc;
}
