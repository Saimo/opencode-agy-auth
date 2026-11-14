// ============================================================================
// AI SDK LanguageModelV3 Self-Contained Types (@ai-sdk/provider v3 compatible)
// ============================================================================

export type JSONValue = null | string | number | boolean | JSONObject | JSONArray;
export type JSONObject = { [key: string]: JSONValue | undefined };
export type JSONArray = JSONValue[];

export type SharedV3Headers = Record<string, string>;
export type SharedV3ProviderMetadata = Record<string, JSONObject>;
export type SharedV3ProviderOptions = Record<string, JSONObject>;

export type SharedV3Warning =
  | { type: "unsupported"; feature: string; details?: string }
  | { type: "compatibility"; feature: string; details?: string }
  | { type: "other"; message: string };

export interface LanguageModelV3FunctionTool {
  type: "function";
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  inputExamples?: Array<{ input: JSONObject }>;
  strict?: boolean;
  providerOptions?: SharedV3ProviderOptions;
}

export interface LanguageModelV3ProviderTool {
  type: "provider";
  id: `${string}.${string}`;
  name: string;
  args: Record<string, unknown>;
}

export type LanguageModelV3DataContent = Uint8Array | string | URL;

export interface LanguageModelV3TextPart {
  type: "text";
  text: string;
  providerOptions?: SharedV3ProviderOptions;
}

export interface LanguageModelV3ReasoningPart {
  type: "reasoning";
  text: string;
  providerOptions?: SharedV3ProviderOptions;
}

export interface LanguageModelV3FilePart {
  type: "file";
  filename?: string;
  data: LanguageModelV3DataContent;
  mediaType: string;
  providerOptions?: SharedV3ProviderOptions;
}

export interface LanguageModelV3ToolCallPart {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  input: unknown;
  providerExecuted?: boolean;
  providerOptions?: SharedV3ProviderOptions;
}

export type LanguageModelV3ToolResultContentItem =
  | { type: "text"; text: string; providerOptions?: SharedV3ProviderOptions }
  | {
      type: "file-data";
      data: string;
      mediaType: string;
      filename?: string;
      providerOptions?: SharedV3ProviderOptions;
    }
  | { type: "file-url"; url: string; providerOptions?: SharedV3ProviderOptions }
  | {
      type: "file-id";
      fileId: string | Record<string, string>;
      providerOptions?: SharedV3ProviderOptions;
    }
  | {
      type: "image-data";
      data: string;
      mediaType: string;
      providerOptions?: SharedV3ProviderOptions;
    }
  | { type: "image-url"; url: string; providerOptions?: SharedV3ProviderOptions }
  | {
      type: "image-file-id";
      fileId: string | Record<string, string>;
      providerOptions?: SharedV3ProviderOptions;
    }
  | { type: "custom"; providerOptions?: SharedV3ProviderOptions };

export type LanguageModelV3ToolResultOutput =
  | { type: "text"; value: string; providerOptions?: SharedV3ProviderOptions }
  | { type: "json"; value: JSONValue; providerOptions?: SharedV3ProviderOptions }
  | { type: "execution-denied"; reason?: string; providerOptions?: SharedV3ProviderOptions }
  | { type: "error-text"; value: string; providerOptions?: SharedV3ProviderOptions }
  | { type: "error-json"; value: JSONValue; providerOptions?: SharedV3ProviderOptions }
  | {
      type: "content";
      value: Array<LanguageModelV3ToolResultContentItem>;
    };

export interface LanguageModelV3ToolResultPart {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  output: LanguageModelV3ToolResultOutput;
  providerOptions?: SharedV3ProviderOptions;
}

export interface LanguageModelV3ToolApprovalResponsePart {
  type: "tool-approval-response";
  approvalId: string;
  approved: boolean;
  reason?: string;
  providerOptions?: SharedV3ProviderOptions;
}

export type LanguageModelV3Message = (
  | { role: "system"; content: string }
  | { role: "user"; content: Array<LanguageModelV3TextPart | LanguageModelV3FilePart> }
  | {
      role: "assistant";
      content: Array<
        | LanguageModelV3TextPart
        | LanguageModelV3FilePart
        | LanguageModelV3ReasoningPart
        | LanguageModelV3ToolCallPart
        | LanguageModelV3ToolResultPart
      >;
    }
  | {
      role: "tool";
      content: Array<LanguageModelV3ToolResultPart | LanguageModelV3ToolApprovalResponsePart>;
    }
) & {
  providerOptions?: SharedV3ProviderOptions;
};

export type LanguageModelV3Prompt = Array<LanguageModelV3Message>;

export type LanguageModelV3ToolChoice =
  | { type: "auto" }
  | { type: "none" }
  | { type: "required" }
  | { type: "tool"; toolName: string };

export interface LanguageModelV3CallOptions {
  prompt: LanguageModelV3Prompt;
  maxOutputTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  responseFormat?:
    | { type: "text" }
    | {
        type: "json";
        schema?: Record<string, unknown>;
        name?: string;
        description?: string;
      };
  seed?: number;
  tools?: Array<LanguageModelV3FunctionTool | LanguageModelV3ProviderTool>;
  toolChoice?: LanguageModelV3ToolChoice;
  includeRawChunks?: boolean;
  abortSignal?: AbortSignal;
  headers?: Record<string, string | undefined>;
  providerOptions?: SharedV3ProviderOptions;
}

export interface LanguageModelV3FinishReason {
  unified: "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other";
  raw: string | undefined;
}

export interface LanguageModelV3Usage {
  inputTokens: {
    total: number | undefined;
    noCache: number | undefined;
    cacheRead: number | undefined;
    cacheWrite: number | undefined;
  };
  outputTokens: {
    total: number | undefined;
    text: number | undefined;
    reasoning: number | undefined;
  };
  raw?: JSONObject;
}

export type LanguageModelV3Content =
  | { type: "text"; text: string; providerMetadata?: SharedV3ProviderMetadata }
  | { type: "reasoning"; text: string; providerMetadata?: SharedV3ProviderMetadata }
  | {
      type: "file";
      mediaType: string;
      data: string | Uint8Array;
      providerMetadata?: SharedV3ProviderMetadata;
    }
  | {
      type: "source";
      sourceType: "url";
      id: string;
      url: string;
      title?: string;
      providerMetadata?: SharedV3ProviderMetadata;
    }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      input: string;
      providerExecuted?: boolean;
      dynamic?: boolean;
      providerMetadata?: SharedV3ProviderMetadata;
    }
  | {
      type: "tool-result";
      toolCallId: string;
      toolName: string;
      result: NonNullable<JSONValue>;
      isError?: boolean;
      preliminary?: boolean;
      dynamic?: boolean;
      providerMetadata?: SharedV3ProviderMetadata;
    };

export interface LanguageModelV3GenerateResult {
  content: Array<LanguageModelV3Content>;
  finishReason: LanguageModelV3FinishReason;
  usage: LanguageModelV3Usage;
  providerMetadata?: SharedV3ProviderMetadata;
  request?: { body?: unknown };
  response?: {
    id?: string;
    timestamp?: Date;
    modelId?: string;
    headers?: SharedV3Headers;
    body?: unknown;
  };
  warnings: Array<SharedV3Warning>;
}

export type LanguageModelV3StreamPart =
  | { type: "stream-start"; warnings: Array<SharedV3Warning> }
  | { type: "response-metadata"; id?: string; timestamp?: Date; modelId?: string }
  | { type: "text-start"; id: string; providerMetadata?: SharedV3ProviderMetadata }
  | { type: "text-delta"; id: string; delta: string; providerMetadata?: SharedV3ProviderMetadata }
  | { type: "text-end"; id: string; providerMetadata?: SharedV3ProviderMetadata }
  | { type: "reasoning-start"; id: string; providerMetadata?: SharedV3ProviderMetadata }
  | {
      type: "reasoning-delta";
      id: string;
      delta: string;
      providerMetadata?: SharedV3ProviderMetadata;
    }
  | { type: "reasoning-end"; id: string; providerMetadata?: SharedV3ProviderMetadata }
  | {
      type: "tool-input-start";
      id: string;
      toolName: string;
      providerExecuted?: boolean;
      dynamic?: boolean;
      title?: string;
      providerMetadata?: SharedV3ProviderMetadata;
    }
  | {
      type: "tool-input-delta";
      id: string;
      delta: string;
      providerMetadata?: SharedV3ProviderMetadata;
    }
  | { type: "tool-input-end"; id: string; providerMetadata?: SharedV3ProviderMetadata }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      input: string;
      providerExecuted?: boolean;
      dynamic?: boolean;
      providerMetadata?: SharedV3ProviderMetadata;
    }
  | {
      type: "tool-result";
      toolCallId: string;
      toolName: string;
      result: NonNullable<JSONValue>;
      isError?: boolean;
      preliminary?: boolean;
      dynamic?: boolean;
      providerMetadata?: SharedV3ProviderMetadata;
    }
  | {
      type: "finish";
      usage: LanguageModelV3Usage;
      finishReason: LanguageModelV3FinishReason;
      providerMetadata?: SharedV3ProviderMetadata;
    }
  | { type: "raw"; rawValue: unknown }
  | { type: "error"; error: unknown };

export interface LanguageModelV3StreamResult {
  stream: ReadableStream<LanguageModelV3StreamPart>;
  request?: { body?: unknown };
  response?: { headers?: SharedV3Headers };
}

export interface LanguageModelV3 {
  readonly specificationVersion: "v3";
  readonly provider: string;
  readonly modelId: string;
  supportedUrls: PromiseLike<Record<string, RegExp[]>> | Record<string, RegExp[]>;
  doGenerate(options: LanguageModelV3CallOptions): PromiseLike<LanguageModelV3GenerateResult>;
  doStream(options: LanguageModelV3CallOptions): PromiseLike<LanguageModelV3StreamResult>;
}

// ============================================================================
// ACP (Agent Client Protocol v1) + `agy 1.5.8` JSON-RPC 2.0 Types
// ============================================================================

export interface JsonRpcErrorObject {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

export interface JsonRpcRequest {
  readonly jsonrpc: "2.0";
  readonly id: number | string;
  readonly method: string;
  readonly params?: unknown;
}

export interface JsonRpcNotification {
  readonly jsonrpc: "2.0";
  readonly method: string;
  readonly params?: unknown;
}

export interface JsonRpcSuccessResponse {
  readonly jsonrpc: "2.0";
  readonly id: number | string;
  readonly result: unknown;
}

export interface JsonRpcErrorResponse {
  readonly jsonrpc: "2.0";
  readonly id: number | string | null;
  readonly error: JsonRpcErrorObject;
}

export type JsonRpcFrame =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcSuccessResponse
  | JsonRpcErrorResponse;

const AI_SDK_ERROR_SYMBOL = Symbol.for("vercel.ai.error");
const AI_SDK_API_CALL_ERROR_SYMBOL = Symbol.for("vercel.ai.error.AI_APICallError");

export class AcpRpcError extends Error {
  readonly [AI_SDK_ERROR_SYMBOL] = true;
  readonly [AI_SDK_API_CALL_ERROR_SYMBOL] = true;
  readonly url = "acp://agy";
  readonly requestBodyValues: Record<string, unknown> = {};
  readonly code: number;
  readonly data?: unknown;
  readonly status?: number;
  readonly statusCode?: number;
  readonly retryAfterMs?: number;
  readonly isRetryable: boolean;
  readonly responseHeaders?: Record<string, string>;
  readonly responseBody?: string;

  constructor(input: {
    code: number;
    message: string;
    data?: unknown;
    status?: number;
    retryAfterMs?: number;
    isRetryable?: boolean;
    cause?: unknown;
  }) {
    super(input.message, input.cause !== undefined ? { cause: input.cause } : undefined);
    this.name = "AcpRpcError";
    this.code = input.code;
    this.data = input.data;
    const isAuthRpcFailure =
      input.code === -32000 ||
      (input.code === -32603 &&
        /no browser is available|authentication required|not logged in|failed to authenticate|unauthenticated|sign[\s-]*in required/i.test(
          input.message,
        ));
    const inferredStatus = input.status ?? (isAuthRpcFailure ? 401 : undefined);
    this.status = inferredStatus;
    this.statusCode = inferredStatus;
    this.retryAfterMs = input.retryAfterMs;
    this.isRetryable =
      input.isRetryable ??
      (inferredStatus !== undefined && (inferredStatus === 429 || inferredStatus >= 500));
    if (input.retryAfterMs !== undefined && input.retryAfterMs > 0) {
      this.responseHeaders = {
        "retry-after": String(Math.max(1, Math.ceil(input.retryAfterMs / 1000))),
        "retry-after-ms": String(input.retryAfterMs),
      };
    }
    this.responseBody = JSON.stringify({
      error: {
        code: inferredStatus ?? input.code,
        rpcCode: input.code,
        message: input.message,
        ...(input.retryAfterMs !== undefined ? { retryAfterMs: input.retryAfterMs } : {}),
      },
    });
  }
}

export interface AcpAuthMethod {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
}

export interface AcpAgentCapabilities {
  readonly loadSession?: boolean;
  readonly promptCapabilities?: {
    readonly image?: boolean;
    readonly audio?: boolean;
    readonly embeddedContext?: boolean;
  };
  readonly sessionCapabilities?: {
    readonly resume?: Record<string, unknown>;
    readonly close?: Record<string, unknown>;
    readonly load?: Record<string, unknown>;
    readonly list?: Record<string, unknown>;
    readonly additionalDirectories?: Record<string, unknown>;
  };
  readonly mcpCapabilities?: {
    readonly http?: boolean;
    readonly sse?: boolean;
  };
  readonly auth?: {
    readonly logout?: Record<string, unknown>;
  };
  readonly _meta?: {
    readonly antigravity?: {
      readonly tier?: boolean;
      readonly systemPrompt?: {
        readonly append?: boolean;
      };
    };
    readonly [key: string]: unknown;
  };
}

export interface AcpInitializeParams {
  readonly protocolVersion: 1;
  readonly clientCapabilities: {
    readonly fs: {
      readonly readTextFile: boolean;
      readonly writeTextFile: boolean;
    };
    readonly terminal: boolean;
    readonly _meta?: Record<string, unknown>;
  };
  readonly clientInfo: {
    readonly name: string;
    readonly title?: string;
    readonly version: string;
  };
}

export interface AcpInitializeResult {
  readonly protocolVersion: number;
  readonly agentCapabilities?: AcpAgentCapabilities;
  readonly agentInfo?: {
    readonly name: string;
    readonly version: string;
  };
  readonly authMethods?: ReadonlyArray<AcpAuthMethod>;
}

export type AcpMcpServer =
  | {
      readonly name: string;
      readonly command: string;
      readonly args: ReadonlyArray<string>;
      readonly env: ReadonlyArray<{ readonly name: string; readonly value: string }>;
      readonly _meta?: Record<string, unknown>;
    }
  | {
      readonly type: "http";
      readonly name: string;
      readonly url: string;
      readonly headers: ReadonlyArray<{ readonly name: string; readonly value: string }>;
      readonly _meta?: Record<string, unknown>;
    }
  | {
      readonly type: "sse";
      readonly name: string;
      readonly url: string;
      readonly headers: ReadonlyArray<{ readonly name: string; readonly value: string }>;
      readonly _meta?: Record<string, unknown>;
    };

export interface AcpSessionConfigSelectOption {
  readonly value: string;
  readonly name: string;
  readonly description?: string | null;
  readonly _meta?: Record<string, unknown> | null;
}

export interface AcpSessionConfigSelectGroup {
  readonly group: string;
  readonly name: string;
  readonly options: ReadonlyArray<AcpSessionConfigSelectOption>;
  readonly _meta?: Record<string, unknown> | null;
}

export type AcpSessionConfigOption =
  | {
      readonly id: string;
      readonly name: string;
      readonly description?: string | null;
      readonly category?: string | null;
      readonly type: "select";
      readonly currentValue: string;
      readonly options: ReadonlyArray<AcpSessionConfigSelectOption | AcpSessionConfigSelectGroup>;
      readonly _meta?: Record<string, unknown> | null;
    }
  | {
      readonly id: string;
      readonly name: string;
      readonly description?: string | null;
      readonly category?: string | null;
      readonly type: "boolean";
      readonly currentValue: boolean;
      readonly _meta?: Record<string, unknown> | null;
    };

export interface AcpSessionMode {
  readonly id: string;
  readonly name: string;
  readonly description?: string | null;
}

export interface AcpSessionModeState {
  readonly currentModeId: string;
  readonly availableModes: ReadonlyArray<AcpSessionMode>;
}

export interface AcpSessionModelEntry {
  readonly modelId: string;
  readonly name: string;
  readonly description?: string | null;
}

export interface AcpSessionModelState {
  readonly currentModelId?: string;
  readonly availableModels?: ReadonlyArray<AcpSessionModelEntry>;
}

export interface AcpSessionMeta {
  readonly disableBuiltInTools?: boolean;
  readonly antigravity?: {
    readonly systemPrompt?: {
      readonly append?: string;
    };
  };
  readonly [key: string]: unknown;
}

export interface AcpNewSessionParams {
  readonly cwd: string;
  readonly mcpServers: ReadonlyArray<AcpMcpServer>;
  readonly _meta?: AcpSessionMeta;
}

export interface AcpResumeSessionParams {
  readonly sessionId: string;
  readonly cwd: string;
  readonly mcpServers?: ReadonlyArray<AcpMcpServer>;
  readonly _meta?: AcpSessionMeta;
}

export interface AcpSessionSetupResult {
  readonly sessionId: string;
  readonly configOptions?: ReadonlyArray<AcpSessionConfigOption> | null;
  readonly modes?: AcpSessionModeState | null;
  readonly models?: AcpSessionModelState | null;
  readonly _meta?: Record<string, unknown> | null;
}

export interface AcpSetConfigOptionResult {
  readonly configOptions?: ReadonlyArray<AcpSessionConfigOption> | null;
  readonly _meta?: Record<string, unknown> | null;
}

export type AcpContentBlock =
  | {
      readonly type: "text";
      readonly text: string;
      readonly _meta?: Record<string, unknown> | null;
    }
  | {
      readonly type: "image";
      readonly data: string;
      readonly mimeType: string;
      readonly uri?: string | null;
      readonly _meta?: Record<string, unknown> | null;
    }
  | {
      readonly type: "audio";
      readonly data: string;
      readonly mimeType: string;
      readonly _meta?: Record<string, unknown> | null;
    }
  | {
      readonly type: "resource";
      readonly resource:
        | {
            readonly uri: string;
            readonly mimeType?: string | null;
            readonly text: string;
          }
        | {
            readonly uri: string;
            readonly mimeType?: string | null;
            readonly blob: string;
          };
      readonly _meta?: Record<string, unknown> | null;
    }
  | {
      readonly type: "resource_link";
      readonly uri: string;
      readonly name: string;
      readonly mimeType?: string | null;
      readonly description?: string | null;
      readonly _meta?: Record<string, unknown> | null;
    };

export interface AcpPromptUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly cachedReadTokens?: number;
  readonly cachedWriteTokens?: number;
  readonly thoughtTokens?: number;
  readonly totalTokens?: number;
}

export interface AcpPromptParams {
  readonly sessionId: string;
  readonly prompt: ReadonlyArray<AcpContentBlock>;
  readonly _meta?: Record<string, unknown>;
}

export interface AcpPromptResult {
  readonly stopReason: string;
  readonly usage?: AcpPromptUsage | null;
  readonly _meta?: Record<string, unknown> | null;
}

export interface AcpToolCallContentEntry {
  readonly type: string;
  readonly content?: AcpContentBlock;
  readonly path?: string;
  readonly oldText?: string | null;
  readonly newText?: string;
  readonly terminalId?: string;
}

export interface AcpToolCallLocation {
  readonly path: string;
  readonly line?: number | null;
}

export interface AcpToolCallPayload {
  readonly toolCallId: string;
  readonly title?: string | null;
  readonly kind?: string | null;
  readonly status?: "pending" | "in_progress" | "inProgress" | "completed" | "failed" | string | null;
  readonly rawInput?: unknown;
  readonly rawOutput?: unknown;
  readonly content?: ReadonlyArray<AcpToolCallContentEntry> | null;
  readonly locations?: ReadonlyArray<AcpToolCallLocation> | null;
  readonly _meta?: Record<string, unknown> | null;
}

export type AcpSessionUpdate =
  | {
      readonly sessionUpdate: "agent_message_chunk";
      readonly content: AcpContentBlock;
      readonly _meta?: Record<string, unknown> | null;
    }
  | {
      readonly sessionUpdate: "agent_thought_chunk";
      readonly content: AcpContentBlock;
      readonly _meta?: Record<string, unknown> | null;
    }
  | {
      readonly sessionUpdate: "user_message_chunk";
      readonly content: AcpContentBlock;
      readonly _meta?: Record<string, unknown> | null;
    }
  | ({
      readonly sessionUpdate: "tool_call";
    } & AcpToolCallPayload)
  | ({
      readonly sessionUpdate: "tool_call_update";
    } & AcpToolCallPayload)
  | {
      readonly sessionUpdate: "config_option_update";
      readonly configOptions: ReadonlyArray<AcpSessionConfigOption>;
      readonly _meta?: Record<string, unknown> | null;
    }
  | {
      readonly sessionUpdate: "current_mode_update";
      readonly currentModeId: string;
      readonly _meta?: Record<string, unknown> | null;
    }
  | ({
      readonly sessionUpdate: "usage_update";
      readonly used?: number;
      readonly size?: number;
      readonly usage?: AcpPromptUsage | null;
      readonly _meta?: Record<string, unknown> | null;
    } & AcpPromptUsage)
  | {
      readonly sessionUpdate: "plan" | "available_commands_update" | "session_info_update";
      readonly [key: string]: unknown;
    };

export interface AcpSessionNotification {
  readonly sessionId: string;
  readonly update: AcpSessionUpdate;
}

export interface AcpPermissionOption {
  readonly optionId: string;
  readonly name: string;
  readonly kind: "allow_once" | "allow_always" | "reject_once" | "reject_always" | string;
}

export interface AcpRequestPermissionParams {
  readonly sessionId: string;
  readonly toolCall: AcpToolCallPayload;
  readonly options: ReadonlyArray<AcpPermissionOption>;
  readonly _meta?: Record<string, unknown> | null;
}

export interface AcpRequestPermissionResult {
  readonly outcome:
    | { readonly outcome: "cancelled" }
    | { readonly outcome: "selected"; readonly optionId: string };
}
