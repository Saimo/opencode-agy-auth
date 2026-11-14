import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import {
  AGY_HEADER_FORK_SOURCE,
  AGY_HEADER_REQUEST_KIND,
  AGY_HEADER_SESSION_ID,
  AGY_OPTION_AGENT_SYSTEM,
  AGY_OPTION_INSTRUCTIONS,
  AGY_PROVIDER_ID,
  AGY_STORAGE_SESSION_PREFIX,
} from "../constants";
import type {
  AgyToolMode,
  OpenCodeV2PermissionDomain,
  OpenCodeV2SessionRequestKind,
  OpenCodeV2StorageDomain,
} from "../plugin/types";
import { classifyAcpAuthError } from "./auth";
import {
  findConfigOption,
  mergeSessionConfigOptions,
  type AgyCatalogStore,
} from "./catalog";
import {
  AsyncLock,
  cleanupSessionDbFiles,
  resolveSessionDbPath,
  type AcpClientPool,
  type AcpConnection,
  type AgySpawnConfig,
} from "./client";
import {
  OpenCodeMcpBridge,
  isAgyMcpBridgedToolCall,
  stripAgyMcpTitlePrefix,
  type ParkedOpenCodeToolCall,
} from "./mcp-bridge";
import {
  AgyTurnOutcomeError,
  inspectTurnOutcomeFromDb,
  isInvalidThinkingSignatureText,
  readPreTurnMaxStepIdx,
} from "./turn-outcome";
import {
  AcpRpcError,
  type AcpAgentCapabilities,
  type AcpContentBlock,
  type AcpPermissionOption,
  type AcpPromptResult,
  type AcpPromptUsage,
  type AcpRequestPermissionParams,
  type AcpRequestPermissionResult,
  type AcpSessionConfigOption,
  type AcpSessionModeState,
  type AcpSessionSetupResult,
  type AcpSessionUpdate,
  type AcpToolCallPayload,
  type JSONObject,
  type JSONValue,
  type LanguageModelV3CallOptions,
  type LanguageModelV3DataContent,
  type LanguageModelV3FilePart,
  type LanguageModelV3FinishReason,
  type LanguageModelV3Message,
  type LanguageModelV3Prompt,
  type LanguageModelV3StreamPart,
  type LanguageModelV3ToolResultPart,
  type LanguageModelV3Usage,
} from "./types";

const DEFAULT_WATCHDOG_TIMEOUT_MS = 45_000;

export interface PersistedAgySessionRecord {
  readonly acpSessionId: string;
  readonly cwd: string;
  readonly systemHash: string;
  readonly syncedMessageDigests: ReadonlyArray<string>;
  readonly updatedAt: number;
}

interface LiveSessionBinding {
  acpSessionId: string;
  connection: AcpConnection;
  releaseWorker: () => void;
  mcpBridge: OpenCodeMcpBridge;
  cwd: string;
  toolMode: AgyToolMode;
  systemHash: string;
  configOptions: AcpSessionConfigOption[];
  modes: AcpSessionModeState | null | undefined;
  activeTurn?: ActiveAcpTurn;
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

function readHeader(
  headers: Record<string, string | undefined> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower && typeof v === "string" && v.trim()) {
      return v.trim();
    }
  }
  return undefined;
}

function readProviderOptionString(
  providerOptions: LanguageModelV3CallOptions["providerOptions"],
  key: string,
): string | undefined {
  const bucket = providerOptions?.[AGY_PROVIDER_ID] ?? providerOptions?.["antigravity"];
  const val = bucket?.[key];
  return typeof val === "string" && val.trim() ? val.trim() : undefined;
}

export function extractCallRoutingMetadata(options: LanguageModelV3CallOptions): {
  sessionId?: string;
  kind: OpenCodeV2SessionRequestKind;
  agent?: string;
  forkSourceSessionId?: string;
  effort?: string;
  mode?: string;
  toolModeOverride?: AgyToolMode;
} {
  const sessionId =
    readHeader(options.headers, AGY_HEADER_SESSION_ID) ??
    readProviderOptionString(options.providerOptions, "sessionId") ??
    readProviderOptionString(options.providerOptions, "sessionID");

  const rawKind =
    readHeader(options.headers, AGY_HEADER_REQUEST_KIND) ??
    readProviderOptionString(options.providerOptions, "kind");

  const kind: OpenCodeV2SessionRequestKind =
    rawKind === "title" || rawKind === "compaction" || rawKind === "generate"
      ? rawKind
      : "primary";

  const agent =
    readHeader(options.headers, "x-opencode-agy-agent") ??
    readProviderOptionString(options.providerOptions, "agent");

  const forkSourceSessionId =
    readHeader(options.headers, AGY_HEADER_FORK_SOURCE) ??
    readProviderOptionString(options.providerOptions, "forkSourceSessionId");

  const effort =
    readProviderOptionString(options.providerOptions, "thoughtLevel") ??
    readProviderOptionString(options.providerOptions, "effort") ??
    readProviderOptionString(options.providerOptions, "reasoningEffort") ??
    readHeader(options.headers, "x-agy-tier");

  const mode = readProviderOptionString(options.providerOptions, "mode");
  const rawToolMode = readProviderOptionString(options.providerOptions, "toolMode");
  const toolModeOverride: AgyToolMode | undefined =
    rawToolMode === "hybrid" || rawToolMode === "opencode" ? rawToolMode : undefined;

  return {
    ...(sessionId ? { sessionId } : {}),
    kind,
    ...(agent ? { agent } : {}),
    ...(forkSourceSessionId ? { forkSourceSessionId } : {}),
    ...(effort ? { effort } : {}),
    ...(mode ? { mode } : {}),
    ...(toolModeOverride ? { toolModeOverride } : {}),
  };
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

export function computeMessageDigest(message: LanguageModelV3Message): string {
  return sha256Hex(
    JSON.stringify({
      role: message.role,
      content: message.content,
    }),
  );
}

export function extractSystemAndConversation(
  prompt: LanguageModelV3Prompt,
  options: LanguageModelV3CallOptions,
): {
  systemAppend: string;
  systemHash: string;
  nonSystemMessages: LanguageModelV3Message[];
  digests: string[];
} {
  const systemParts: string[] = [];

  const optAgentSys = readProviderOptionString(options.providerOptions, AGY_OPTION_AGENT_SYSTEM);
  const optInstructions = readProviderOptionString(
    options.providerOptions,
    AGY_OPTION_INSTRUCTIONS,
  );
  if (optAgentSys) systemParts.push(optAgentSys);
  if (optInstructions) systemParts.push(optInstructions);

  const nonSystemMessages: LanguageModelV3Message[] = [];
  for (const msg of prompt) {
    if (msg.role === "system") {
      if (msg.content.trim()) {
        systemParts.push(msg.content.trim());
      }
    } else {
      nonSystemMessages.push(msg);
    }
  }

  if (options.responseFormat?.type === "json") {
    const schemaHint = options.responseFormat.schema
      ? `\nRequired JSON Schema:\n${JSON.stringify(options.responseFormat.schema, null, 2)}`
      : "";
    systemParts.push(
      `Respond ONLY with valid JSON matching the requested format without surrounding markdown code fences.${schemaHint}`,
    );
  }

  if (options.toolChoice?.type === "tool") {
    systemParts.push(
      `IMPORTANT: You MUST invoke the tool "${options.toolChoice.toolName}" immediately with valid JSON arguments matching its input schema. Do NOT reply with plain text instead of calling "${options.toolChoice.toolName}".`,
    );
  } else if (options.toolChoice?.type === "required") {
    systemParts.push(
      "IMPORTANT: You MUST invoke at least one available tool before concluding your response.",
    );
  }

  const dedupedSystem: string[] = [];
  for (const part of systemParts) {
    if (!dedupedSystem.includes(part)) {
      dedupedSystem.push(part);
    }
  }

  const systemAppend = dedupedSystem.join("\n\n").trim();
  const systemHash = sha256Hex(systemAppend);
  const digests = nonSystemMessages.map(computeMessageDigest);

  return {
    systemAppend,
    systemHash,
    nonSystemMessages,
    digests,
  };
}

export function extractTrailingToolResults(
  messages: ReadonlyArray<LanguageModelV3Message>,
): LanguageModelV3ToolResultPart[] {
  const results: LanguageModelV3ToolResultPart[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (msg.role === "tool") {
      for (const item of msg.content) {
        if (item.type === "tool-result") {
          results.push(item);
        }
      }
      continue;
    }
    if (msg.role === "assistant") {
      for (const item of msg.content) {
        if (item.type === "tool-result") {
          results.push(item);
        }
      }
    }
    break;
  }
  return results;
}

function encodeDataContentToBase64(data: LanguageModelV3DataContent): {
  base64?: string;
  url?: string;
  utf8Text?: string;
} {
  if (data instanceof Uint8Array) {
    return {
      base64: Buffer.from(data).toString("base64"),
      utf8Text: Buffer.from(data).toString("utf8"),
    };
  }
  if (data instanceof URL) {
    return { url: data.toString() };
  }
  if (typeof data === "string") {
    const dataUrlMatch = data.match(/^data:([^;]+)?(;base64)?,([\s\S]*)$/);
    if (dataUrlMatch) {
      const isBase64 = Boolean(dataUrlMatch[2]);
      const payload = dataUrlMatch[3] ?? "";
      if (isBase64) {
        return {
          base64: payload,
          utf8Text: Buffer.from(payload, "base64").toString("utf8"),
        };
      }
      const decoded = decodeURIComponent(payload);
      return {
        base64: Buffer.from(decoded, "utf8").toString("base64"),
        utf8Text: decoded,
      };
    }
    if (/^https?:\/\//i.test(data)) {
      return { url: data };
    }
    return {
      base64: data,
      utf8Text: Buffer.from(data, "base64").toString("utf8"),
    };
  }
  return {};
}

function convertFilePartToAcpBlock(
  part: LanguageModelV3FilePart,
  capabilities?: AcpAgentCapabilities,
): AcpContentBlock {
  const encoded = encodeDataContentToBase64(part.data);
  const mediaType = part.mediaType || "application/octet-stream";
  const filename = part.filename || "attachment";
  const fileUri = `attachment:///${encodeURIComponent(filename)}`;

  if (encoded.url) {
    return {
      type: "resource_link",
      uri: encoded.url,
      name: filename,
      mimeType: mediaType,
    };
  }

  if (mediaType.startsWith("image/") && encoded.base64 && capabilities?.promptCapabilities?.image !== false) {
    return {
      type: "image",
      data: encoded.base64,
      mimeType: mediaType,
    };
  }

  if (mediaType.startsWith("audio/") && encoded.base64 && capabilities?.promptCapabilities?.audio === true) {
    return {
      type: "audio",
      data: encoded.base64,
      mimeType: mediaType,
    };
  }

  const isTextLike =
    mediaType.startsWith("text/") ||
    mediaType === "application/json" ||
    mediaType === "application/xml" ||
    mediaType.endsWith("+json") ||
    mediaType.endsWith("+xml");

  if (capabilities?.promptCapabilities?.embeddedContext !== false) {
    if (isTextLike && encoded.utf8Text !== undefined) {
      return {
        type: "resource",
        resource: {
          uri: fileUri,
          mimeType: mediaType,
          text: encoded.utf8Text,
        },
      };
    }
    if (encoded.base64) {
      return {
        type: "resource",
        resource: {
          uri: fileUri,
          mimeType: mediaType,
          blob: encoded.base64,
        },
      };
    }
  }

  if (isTextLike && encoded.utf8Text !== undefined) {
    return {
      type: "text",
      text: `<attachment filename="${filename}" mime="${mediaType}">\n${encoded.utf8Text}\n</attachment>`,
    };
  }

  return {
    type: "text",
    text: `[Attached file: ${filename} (${mediaType})]`,
  };
}

function summarizeMessageForCheckpoint(msg: LanguageModelV3Message): string {
  if (msg.role === "system") {
    return "";
  }
  if (msg.role === "user") {
    const parts: string[] = [];
    for (const item of msg.content) {
      if (item.type === "text") {
        parts.push(item.text);
      } else if (item.type === "file") {
        parts.push(`[Attached file: ${item.filename ?? item.mediaType}]`);
      }
    }
    return `<message role="user">\n${parts.join("\n")}\n</message>`;
  }
  if (msg.role === "assistant") {
    const parts: string[] = [];
    for (const item of msg.content) {
      if (item.type === "text" && item.text.trim()) {
        parts.push(item.text);
      } else if (item.type === "tool-call") {
        const inputStr =
          typeof item.input === "string"
            ? item.input
            : JSON.stringify(item.input ?? {});
        parts.push(`[Tool Call: ${item.toolName}(${inputStr})]`);
      } else if (item.type === "tool-result") {
        parts.push(`[Tool Result (${item.toolName}): ${JSON.stringify(item.output)}]`);
      }
      // Deliberately omit binary `reasoning` signature metadata so `#28889` corrupted
      // thinking signatures are cleanly stripped during checkpoint replay!
    }
    if (!parts.length) return "";
    return `<message role="assistant">\n${parts.join("\n")}\n</message>`;
  }
  if (msg.role === "tool") {
    const parts: string[] = [];
    for (const item of msg.content) {
      if (item.type === "tool-result") {
        let rendered = "";
        if (item.output.type === "text" || item.output.type === "error-text") {
          rendered = item.output.value;
        } else if (item.output.type === "json" || item.output.type === "error-json") {
          rendered = JSON.stringify(item.output.value);
        } else if (item.output.type === "execution-denied") {
          rendered = item.output.reason ?? "Denied";
        } else {
          rendered = JSON.stringify(item.output.value);
        }
        parts.push(`[Tool Result (${item.toolName}): ${rendered}]`);
      }
    }
    if (!parts.length) return "";
    return `<message role="tool">\n${parts.join("\n")}\n</message>`;
  }
  return "";
}

/**
 * Builds ACP prompt content blocks from a sequence of OpenCode messages.
 * If `includeCheckpointForHistory` is true and prior assistant/tool messages exist
 * before the latest user message (e.g. session fork, rewind, compaction, or `#28889`
 * recovery), wraps prior turns in `<conversation-checkpoint>`.
 */
export function buildPromptBlocksFromMessages(
  messages: ReadonlyArray<LanguageModelV3Message>,
  capabilities?: AcpAgentCapabilities,
  options?: { forceCheckpoint?: boolean },
): AcpContentBlock[] {
  if (messages.length === 0) {
    return [{ type: "text", text: "Continue." }];
  }

  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === "user") {
      lastUserIdx = i;
      break;
    }
  }

  const hasPriorNonUser =
    options?.forceCheckpoint === true ||
    messages.some((m, idx) => idx !== lastUserIdx && m.role !== "user");

  if (!hasPriorNonUser && lastUserIdx >= 0) {
    const blocks: AcpContentBlock[] = [];
    for (const msg of messages) {
      if (msg.role !== "user") continue;
      for (const part of msg.content) {
        if (part.type === "text") {
          if (part.text) blocks.push({ type: "text", text: part.text });
        } else if (part.type === "file") {
          blocks.push(convertFilePartToAcpBlock(part, capabilities));
        }
      }
    }
    return blocks.length > 0 ? blocks : [{ type: "text", text: "Continue." }];
  }

  if (lastUserIdx > 0) {
    const historySlice = messages.slice(0, lastUserIdx);
    const trailingSlice = messages.slice(lastUserIdx);
    const checkpointEntries = historySlice
      .map(summarizeMessageForCheckpoint)
      .filter(Boolean);

    const blocks: AcpContentBlock[] = [];
    if (checkpointEntries.length > 0) {
      blocks.push({
        type: "text",
        text: `<conversation-checkpoint>\nPrior conversation context:\n${checkpointEntries.join("\n")}\n</conversation-checkpoint>`,
      });
    }

    for (const msg of trailingSlice) {
      if (msg.role === "user") {
        for (const part of msg.content) {
          if (part.type === "text") {
            if (part.text) blocks.push({ type: "text", text: part.text });
          } else if (part.type === "file") {
            blocks.push(convertFilePartToAcpBlock(part, capabilities));
          }
        }
      } else {
        const summary = summarizeMessageForCheckpoint(msg);
        if (summary) blocks.push({ type: "text", text: summary });
      }
    }

    return blocks.length > 0 ? blocks : [{ type: "text", text: "Continue." }];
  }

  const allSummaries = messages.map(summarizeMessageForCheckpoint).filter(Boolean);
  return [
    {
      type: "text",
      text:
        allSummaries.length > 0
          ? `<conversation-checkpoint>\n${allSummaries.join("\n")}\n</conversation-checkpoint>`
          : "Continue.",
    },
  ];
}

export function mapAcpUsageToV3(usage?: AcpPromptUsage | null): LanguageModelV3Usage {
  const inputTotal = typeof usage?.inputTokens === "number" ? usage.inputTokens : 0;
  const cacheRead = typeof usage?.cachedReadTokens === "number" ? usage.cachedReadTokens : 0;
  const cacheWrite = typeof usage?.cachedWriteTokens === "number" ? usage.cachedWriteTokens : 0;
  const noCache = Math.max(0, inputTotal - cacheRead);

  const outputText = typeof usage?.outputTokens === "number" ? usage.outputTokens : 0;
  const reasoning = typeof usage?.thoughtTokens === "number" ? usage.thoughtTokens : 0;
  const outputTotal = outputText + reasoning;

  const raw: JSONObject = {};
  if (usage) {
    if (typeof usage.inputTokens === "number") raw.inputTokens = usage.inputTokens;
    if (typeof usage.outputTokens === "number") raw.outputTokens = usage.outputTokens;
    if (typeof usage.cachedReadTokens === "number") raw.cachedReadTokens = usage.cachedReadTokens;
    if (typeof usage.cachedWriteTokens === "number") raw.cachedWriteTokens = usage.cachedWriteTokens;
    if (typeof usage.thoughtTokens === "number") raw.thoughtTokens = usage.thoughtTokens;
    if (typeof usage.totalTokens === "number") raw.totalTokens = usage.totalTokens;
  }

  return {
    inputTokens: {
      total: inputTotal,
      noCache,
      cacheRead,
      cacheWrite,
    },
    outputTokens: {
      total: outputTotal,
      text: outputText,
      reasoning,
    },
    ...(Object.keys(raw).length > 0 ? { raw } : {}),
  };
}

export function mapAcpStopReasonToV3(stopReason: string | undefined): LanguageModelV3FinishReason {
  switch (stopReason) {
    case "end_turn":
      return { unified: "stop", raw: stopReason };
    case "max_tokens":
      return { unified: "length", raw: stopReason };
    case "refusal":
      return { unified: "content-filter", raw: stopReason };
    case "tool_use":
    case "tool_calls":
      return { unified: "tool-calls", raw: stopReason };
    case "cancelled":
    case "max_turn_requests":
      return { unified: "other", raw: stopReason };
    default:
      return { unified: "stop", raw: stopReason ?? "end_turn" };
  }
}

/**
 * Synthesizes a structured `NonNullable<JSONValue>` result for `"hybrid"` mode
 * native Cortex tools when `rawOutput` is omitted (`#36138`).
 */
export function synthesizeNativeToolOutput(payload: AcpToolCallPayload): NonNullable<JSONValue> {
  if (payload.rawOutput !== undefined && payload.rawOutput !== null) {
    try {
      return JSON.parse(JSON.stringify(payload.rawOutput)) as NonNullable<JSONValue>;
    } catch {
      return String(payload.rawOutput);
    }
  }

  if (Array.isArray(payload.content) && payload.content.length > 0) {
    const texts: string[] = [];
    const diffs: JSONObject[] = [];

    for (const entry of payload.content) {
      if (entry.content?.type === "text" && entry.content.text) {
        texts.push(entry.content.text);
      } else if (entry.type === "diff" && entry.path) {
        diffs.push({
          path: entry.path,
          oldText: entry.oldText ?? null,
          newText: entry.newText ?? "",
        });
      } else if (entry.terminalId) {
        texts.push(`[Terminal ${entry.terminalId}]`);
      }
    }

    if (diffs.length > 0) {
      return {
        diffs,
        ...(texts.length > 0 ? { output: texts.join("\n") } : {}),
      };
    }
    if (texts.length > 0) {
      return texts.join("\n");
    }
  }

  if (Array.isArray(payload.locations) && payload.locations.length > 0) {
    return {
      locations: payload.locations.map((loc) => ({
        path: loc.path,
        ...(typeof loc.line === "number" ? { line: loc.line } : {}),
      })),
    };
  }

  return {
    status: payload.status ?? "completed",
    ...(payload.title ? { title: payload.title } : {}),
  };
}

function selectPermissionOption(
  options: ReadonlyArray<AcpPermissionOption>,
  allow: boolean,
): AcpRequestPermissionResult {
  if (allow) {
    const preferred =
      options.find((o) => o.kind === "allow_once") ??
      options.find((o) => o.kind === "allow_always") ??
      options.find((o) => o.kind.startsWith("allow"));
    if (preferred) {
      return { outcome: { outcome: "selected", optionId: preferred.optionId } };
    }
  } else {
    const rejected =
      options.find((o) => o.kind === "reject_once") ??
      options.find((o) => o.kind === "reject_always") ??
      options.find((o) => o.kind.startsWith("reject"));
    if (rejected) {
      return { outcome: { outcome: "selected", optionId: rejected.optionId } };
    }
  }
  return { outcome: { outcome: "cancelled" } };
}

export function mapNativeToolPermissionChecks(
  params: AcpRequestPermissionParams,
  cwd: string,
): Array<{ action: string; resources: string[]; metadata: Record<string, unknown> }> {
  const tc = params.toolCall;
  const kind = (tc.kind ?? "").toLowerCase();
  const title = (tc.title ?? "").trim();
  const rawInput =
    tc.rawInput && typeof tc.rawInput === "object" && !Array.isArray(tc.rawInput)
      ? (tc.rawInput as Record<string, unknown>)
      : {};

  const paths: string[] = [];
  if (Array.isArray(tc.locations)) {
    for (const loc of tc.locations) {
      if (typeof loc?.path === "string" && loc.path.trim()) {
        paths.push(loc.path.trim());
      }
    }
  }
  for (const key of ["path", "filePath", "TargetFile", "DirectoryPath", "SearchPath"]) {
    const val = rawInput[key];
    if (typeof val === "string" && val.trim() && !paths.includes(val.trim())) {
      paths.push(val.trim());
    }
  }

  const externalDirs: string[] = [];
  for (const p of paths) {
    const abs = isAbsolute(p) ? resolve(p) : resolve(cwd, p);
    const rel = relative(resolve(cwd), abs);
    if (
      rel === ".." ||
      rel.startsWith("../") ||
      rel.startsWith("..\\") ||
      isAbsolute(rel)
    ) {
      externalDirs.push(abs);
    }
  }

  const checks: Array<{
    action: string;
    resources: string[];
    metadata: Record<string, unknown>;
  }> = [];

  if (externalDirs.length > 0) {
    checks.push({
      action: "external_directory",
      resources: externalDirs,
      metadata: { title, kind },
    });
  }

  if (kind === "execute" || /\brun[_\s-]*command\b|\bterminal\b|\bbash\b/i.test(title)) {
    const cmd =
      typeof rawInput.CommandLine === "string"
        ? rawInput.CommandLine
        : typeof rawInput.command === "string"
          ? rawInput.command
          : title || "command";
    checks.push({
      action: "shell",
      resources: [cmd],
      metadata: { title, kind, rawInput },
    });
  } else if (kind === "edit" || kind === "delete" || kind === "move" || /\bedit\b|\bwrite\b/i.test(title)) {
    checks.push({
      action: "edit",
      resources: paths.length > 0 ? paths : [title || "file"],
      metadata: { title, kind, rawInput },
    });
  } else if (kind === "search" || /search_web|web[\s_-]*search/i.test(title)) {
    const query =
      typeof rawInput.query === "string" ? rawInput.query : title || "search_web";
    checks.push({
      action: "websearch",
      resources: [query],
      metadata: { title, kind, rawInput },
    });
  } else if (kind === "fetch" || /read_url|fetch/i.test(title)) {
    const url =
      typeof rawInput.url === "string"
        ? rawInput.url
        : typeof rawInput.Url === "string"
          ? rawInput.Url
          : title || "url";
    checks.push({
      action: "webfetch",
      resources: [url],
      metadata: { title, kind, rawInput },
    });
  } else if (checks.length === 0 && kind !== "read" && kind !== "think") {
    checks.push({
      action: kind || "tool",
      resources: paths.length > 0 ? paths : [title || tc.toolCallId],
      metadata: { title, kind, rawInput },
    });
  }

  return checks;
}

class StepStreamEmitter {
  private openReasoningId: string | undefined;
  private openTextId: string | undefined;
  private emittedVisibleOutput = false;
  private finished = false;
  private seq = 0;

  constructor(
    private readonly enqueue: (part: LanguageModelV3StreamPart) => void,
    private readonly modelId: string,
  ) {
    this.enqueue({ type: "stream-start", warnings: [] });
    this.enqueue({
      type: "response-metadata",
      id: `agy_resp_${randomUUID().slice(0, 12)}`,
      timestamp: new Date(),
      modelId: this.modelId,
    });
  }

  get hasVisibleOutput(): boolean {
    return this.emittedVisibleOutput;
  }

  emitReasoningDelta(delta: string): void {
    if (this.finished || !delta) return;
    this.closeTextBlock();
    if (!this.openReasoningId) {
      this.openReasoningId = `agy_think_${++this.seq}`;
      this.enqueue({ type: "reasoning-start", id: this.openReasoningId });
    }
    this.emittedVisibleOutput = true;
    this.enqueue({
      type: "reasoning-delta",
      id: this.openReasoningId,
      delta,
    });
  }

  emitTextDelta(delta: string): void {
    if (this.finished || !delta) return;
    this.closeReasoningBlock();
    if (!this.openTextId) {
      this.openTextId = `agy_txt_${++this.seq}`;
      this.enqueue({ type: "text-start", id: this.openTextId });
    }
    this.emittedVisibleOutput = true;
    this.enqueue({
      type: "text-delta",
      id: this.openTextId,
      delta,
    });
  }

  emitOpenCodeToolCalls(calls: ReadonlyArray<ParkedOpenCodeToolCall>): void {
    if (this.finished) return;
    this.closeOpenTextAndReasoning();
    for (const call of calls) {
      this.emittedVisibleOutput = true;
      this.enqueue({
        type: "tool-input-start",
        id: call.callId,
        toolName: call.toolName,
        providerExecuted: false,
      });
      this.enqueue({
        type: "tool-input-delta",
        id: call.callId,
        delta: call.argsJson,
      });
      this.enqueue({
        type: "tool-input-end",
        id: call.callId,
      });
      this.enqueue({
        type: "tool-call",
        toolCallId: call.callId,
        toolName: call.toolName,
        input: call.argsJson,
        providerExecuted: false,
      });
    }
  }

  emitNativeHostedToolCall(
    toolCallId: string,
    toolName: string,
    inputJson: string,
    title?: string,
  ): void {
    if (this.finished) return;
    this.closeOpenTextAndReasoning();
    this.emittedVisibleOutput = true;
    this.enqueue({
      type: "tool-input-start",
      id: toolCallId,
      toolName,
      providerExecuted: true,
      ...(title ? { title } : {}),
    });
    this.enqueue({
      type: "tool-input-delta",
      id: toolCallId,
      delta: inputJson,
    });
    this.enqueue({
      type: "tool-input-end",
      id: toolCallId,
    });
    this.enqueue({
      type: "tool-call",
      toolCallId,
      toolName,
      input: inputJson,
      providerExecuted: true,
    });
  }

  emitNativeHostedToolResult(
    toolCallId: string,
    toolName: string,
    result: NonNullable<JSONValue>,
    isError: boolean,
  ): void {
    if (this.finished) return;
    this.closeOpenTextAndReasoning();
    this.emittedVisibleOutput = true;
    this.enqueue({
      type: "tool-result",
      toolCallId,
      toolName,
      result,
      ...(isError ? { isError: true } : {}),
    });
  }

  finish(finishReason: LanguageModelV3FinishReason, usage: LanguageModelV3Usage): void {
    if (this.finished) return;
    this.closeOpenTextAndReasoning();
    this.finished = true;
    this.enqueue({
      type: "finish",
      finishReason,
      usage,
    });
  }

  emitError(error: unknown): void {
    if (this.finished) return;
    this.closeOpenTextAndReasoning();
    this.finished = true;
    this.enqueue({ type: "error", error });
  }

  private closeReasoningBlock(): void {
    if (this.openReasoningId) {
      this.enqueue({ type: "reasoning-end", id: this.openReasoningId });
      this.openReasoningId = undefined;
    }
  }

  private closeTextBlock(): void {
    if (this.openTextId) {
      this.enqueue({ type: "text-end", id: this.openTextId });
      this.openTextId = undefined;
    }
  }

  private closeOpenTextAndReasoning(): void {
    this.closeReasoningBlock();
    this.closeTextBlock();
  }
}

interface NativeToolTrackerEntry {
  toolName: string;
  title?: string;
  emittedCall: boolean;
  settledResult: boolean;
  latestPayload: AcpToolCallPayload;
}

class ActiveAcpTurn {
  private emitter: StepStreamEmitter | undefined;
  private readonly bufferedUpdates: AcpSessionUpdate[] = [];
  private readonly nativeTools = new Map<string, NativeToolTrackerEntry>();
  private latestUsage: AcpPromptUsage | undefined;
  private anyTurnOutput = false;

  private promptSettled = false;
  private promptResult: AcpPromptResult | undefined;
  private promptError: unknown;
  private promptWakeups: Array<() => void> = [];

  private watchdogTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingPermissionCount = 0;
  private unsubscribeUpdates: (() => void) | undefined;
  private unsubscribePermission: (() => void) | undefined;
  private cleanedUp = false;
  private stepEpochValue = 0;

  constructor(
    private readonly params: {
      readonly acpSessionId: string;
      readonly openCodeSessionId?: string;
      readonly agent?: string;
      readonly cwd: string;
      readonly dbPath: string;
      readonly preTurnMaxIdx: number;
      readonly toolMode: AgyToolMode;
      readonly watchdogTimeoutMs: number;
      readonly connection: AcpConnection;
      readonly mcpBridge?: OpenCodeMcpBridge;
      readonly permission?: OpenCodeV2PermissionDomain;
      readonly onConfigUpdate?: (options: ReadonlyArray<AcpSessionConfigOption>) => void;
      readonly onTurnFullyCompleted?: () => Promise<void> | void;
    },
  ) {}

  get hasEmittedAnyOutput(): boolean {
    return this.anyTurnOutput;
  }

  get isPromptSettled(): boolean {
    return this.promptSettled;
  }

  get stepEpoch(): number {
    return this.stepEpochValue;
  }

  startPrompt(promptBlocks: ReadonlyArray<AcpContentBlock>): void {
    this.unsubscribeUpdates = this.params.connection.onSessionUpdate(
      this.params.acpSessionId,
      (notification) => {
        this.touchWatchdog();
        this.handleUpdate(notification.update);
      },
    );

    this.unsubscribePermission = this.params.connection.setPermissionHandler(
      this.params.acpSessionId,
      (permParams) => this.handlePermissionRequest(permParams),
    );

    this.params.mcpBridge?.beginTurn();
    this.params.mcpBridge?.setOnActivity(() => {
      this.touchWatchdog();
    });

    this.armWatchdog();

    this.params.connection
      .prompt({
        sessionId: this.params.acpSessionId,
        prompt: promptBlocks,
      })
      .then(
        (res) => {
          if (res.usage) {
            this.latestUsage = res.usage;
          }
          this.promptResult = res;
          this.promptSettled = true;
          this.notifyPromptWakeups();
        },
        (err) => {
          if (!this.promptError) {
            this.promptError = err;
          }
          this.promptSettled = true;
          this.notifyPromptWakeups();
        },
      );
  }

  /**
   * Drives a single OpenCode `doStream` step:
   * - Either yields a batch of parked OpenCode MCP tool calls (`finishReason = tool-calls`),
   * - Or finishes when `session/prompt` completes (`finishReason = stop`),
   * - Or throws/emits an enriched `AgyTurnOutcomeError` if ACP/SQLite reported an error.
   */
  async executeStep(
    emitter: StepStreamEmitter,
    options?: {
      signal?: AbortSignal;
      supplyToolResults?: ReadonlyArray<LanguageModelV3ToolResultPart>;
    },
  ): Promise<{ turnDone: boolean }> {
    this.stepEpochValue += 1;
    this.emitter = emitter;

    if (this.bufferedUpdates.length > 0) {
      const pending = this.bufferedUpdates.splice(0, this.bufferedUpdates.length);
      for (const u of pending) {
        this.processUpdateWithEmitter(u, emitter);
      }
    }

    if (options?.supplyToolResults?.length && this.params.mcpBridge) {
      this.params.mcpBridge.supplyToolResults(options.supplyToolResults);
      this.armWatchdog();
    }

    let cleanupAbort: (() => void) | undefined;
    const abortPromise = new Promise<{ kind: "aborted"; error: unknown }>((resolveAbort) => {
      if (!options?.signal) return;
      if (options.signal.aborted) {
        resolveAbort({
          kind: "aborted",
          error:
            options.signal.reason instanceof Error
              ? options.signal.reason
              : new DOMException("The operation was aborted.", "AbortError"),
        });
        return;
      }
      const onAbort = () => {
        resolveAbort({
          kind: "aborted",
          error:
            options.signal?.reason instanceof Error
              ? options.signal.reason
              : new DOMException("The operation was aborted.", "AbortError"),
        });
      };
      options.signal.addEventListener("abort", onAbort, { once: true });
      cleanupAbort = () => options.signal?.removeEventListener("abort", onAbort);
    });

    const promptDonePromise = this.waitForPromptSettlement().then(
      () => ({ kind: "prompt_settled" as const }),
    );

    const raceCandidates: Array<
      Promise<
        | { kind: "tool_batch"; calls: ParkedOpenCodeToolCall[] }
        | { kind: "prompt_settled" }
        | { kind: "aborted"; error: unknown }
      >
    > = [promptDonePromise, abortPromise];

    const stepWaiterAbort = new AbortController();
    if (this.params.mcpBridge) {
      raceCandidates.push(
        this.params.mcpBridge
          .waitForNextToolBatch(stepWaiterAbort.signal)
          .then((calls) => ({ kind: "tool_batch" as const, calls })),
      );
    }

    try {
      const winner = await Promise.race(raceCandidates);

      if (winner.kind === "aborted") {
        await this.abortTurn();
        throw winner.error;
      }

      if (winner.kind === "tool_batch") {
        this.anyTurnOutput = true;
        emitter.emitOpenCodeToolCalls(winner.calls);
        emitter.finish(
          { unified: "tool-calls", raw: "tool_use" },
          mapAcpUsageToV3(this.latestUsage),
        );
        this.emitter = undefined;
        // Pause watchdog while parked waiting on OpenCode to execute tools
        this.clearWatchdog();
        return { turnDone: false };
      }

      if (options?.signal?.aborted) {
        await this.abortTurn();
        throw options.signal.reason instanceof Error
          ? options.signal.reason
          : new DOMException("The operation was aborted.", "AbortError");
      }

      // `session/prompt` settled: inspect SQLite if an error occurred or zero output was produced
      await this.finalizePromptSettlement(emitter);
      return { turnDone: true };
    } finally {
      stepWaiterAbort.abort();
      cleanupAbort?.();
      if (this.emitter === emitter) {
        this.emitter = undefined;
      }
    }
  }

  private async finalizePromptSettlement(emitter: StepStreamEmitter): Promise<void> {
    this.clearWatchdog();

    // Settle any `"hybrid"` mode native tools that did not emit a terminal update (`#28450`)
    if (this.params.toolMode === "hybrid") {
      for (const [toolCallId, tracked] of this.nativeTools.entries()) {
        if (tracked.emittedCall && !tracked.settledResult) {
          tracked.settledResult = true;
          const synthesized = synthesizeNativeToolOutput(tracked.latestPayload);
          emitter.emitNativeHostedToolResult(
            toolCallId,
            tracked.toolName,
            synthesized,
            tracked.latestPayload.status === "failed",
          );
        }
      }
    }

    const shouldInspectDb =
      Boolean(this.promptError) || (!this.anyTurnOutput && !emitter.hasVisibleOutput);

    if (shouldInspectDb) {
      const dbOutcome = await inspectTurnOutcomeFromDb(
        this.params.dbPath,
        this.params.preTurnMaxIdx,
      );
      if (dbOutcome) {
        await this.cleanup();
        throw new AgyTurnOutcomeError(dbOutcome);
      }
    }

    if (this.promptError) {
      const err = this.promptError;
      await this.cleanup();
      throw err;
    }

    const finishReason = mapAcpStopReasonToV3(this.promptResult?.stopReason);
    const usage = mapAcpUsageToV3(this.promptResult?.usage ?? this.latestUsage);
    emitter.finish(finishReason, usage);

    await this.cleanup();
    await this.params.onTurnFullyCompleted?.();
  }

  async abortTurn(): Promise<void> {
    this.clearWatchdog();
    this.params.mcpBridge?.endTurn("Cancelled.");
    this.params.connection.cancelSession(this.params.acpSessionId);
    await this.cleanup();
  }

  async cleanup(): Promise<void> {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    this.clearWatchdog();
    this.params.mcpBridge?.endTurn("Turn completed.");
    this.params.mcpBridge?.setOnActivity(undefined);
    this.unsubscribeUpdates?.();
    this.unsubscribeUpdates = undefined;
    this.unsubscribePermission?.();
    this.unsubscribePermission = undefined;
  }

  private waitForPromptSettlement(): Promise<void> {
    if (this.promptSettled) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.promptWakeups.push(resolve);
    });
  }

  private notifyPromptWakeups(): void {
    const wakeups = this.promptWakeups.splice(0, this.promptWakeups.length);
    for (const fn of wakeups) {
      fn();
    }
  }

  private isPausedOnClient(): boolean {
    return (
      this.pendingPermissionCount > 0 ||
      Boolean(this.params.mcpBridge?.hasParkedToolCalls)
    );
  }

  private clearWatchdog(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = undefined;
    }
  }

  private touchWatchdog(): void {
    if (this.promptSettled || this.cleanedUp) return;
    if (this.isPausedOnClient()) {
      this.clearWatchdog();
      return;
    }
    this.armWatchdog();
  }

  private armWatchdog(): void {
    this.clearWatchdog();
    if (this.promptSettled || this.cleanedUp || this.params.watchdogTimeoutMs <= 0) {
      return;
    }
    if (this.isPausedOnClient()) {
      return;
    }

    this.watchdogTimer = setTimeout(() => {
      void this.onWatchdogTick();
    }, this.params.watchdogTimeoutMs);
    this.watchdogTimer.unref?.();
  }

  private async onWatchdogTick(): Promise<void> {
    if (this.promptSettled || this.cleanedUp || this.isPausedOnClient()) {
      return;
    }

    const dbOutcome = await inspectTurnOutcomeFromDb(
      this.params.dbPath,
      this.params.preTurnMaxIdx,
    );

    if (dbOutcome) {
      // Upstream recorded a terminal `step_type = 17` error and silently stalled (`#33596`)!
      this.promptError = new AgyTurnOutcomeError(dbOutcome);
      this.promptSettled = true;
      this.params.mcpBridge?.endTurn(dbOutcome.message);
      this.params.connection.cancelSession(this.params.acpSessionId);
      this.notifyPromptWakeups();
      return;
    }

    // No error row recorded in SQLite (e.g., legitimate deep thinking) — re-arm watchdog
    this.armWatchdog();
  }

  private handleUpdate(update: AcpSessionUpdate): void {
    if (update.sessionUpdate === "config_option_update") {
      this.params.onConfigUpdate?.(update.configOptions);
      return;
    }

    if (update.sessionUpdate === "usage_update") {
      if (update.usage) {
        this.latestUsage = update.usage;
      } else if (
        typeof update.inputTokens === "number" ||
        typeof update.outputTokens === "number"
      ) {
        this.latestUsage = update;
      }
      return;
    }

    if (!this.emitter) {
      this.bufferedUpdates.push(update);
      return;
    }

    this.processUpdateWithEmitter(update, this.emitter);
  }

  private processUpdateWithEmitter(
    update: AcpSessionUpdate,
    emitter: StepStreamEmitter,
  ): void {
    switch (update.sessionUpdate) {
      case "agent_thought_chunk": {
        if (update.content?.type === "text" && update.content.text) {
          this.anyTurnOutput = true;
          emitter.emitReasoningDelta(update.content.text);
        }
        return;
      }

      case "agent_message_chunk": {
        if (update.content?.type === "text" && update.content.text) {
          this.anyTurnOutput = true;
          emitter.emitTextDelta(update.content.text);
        }
        return;
      }

      case "tool_call":
      case "tool_call_update": {
        // MCP-bridged OpenCode tools are emitted directly by OpenCodeMcpBridge (`providerExecuted: false`)
        if (
          this.params.toolMode !== "hybrid" ||
          isAgyMcpBridgedToolCall({
            title: update.title,
            toolCallId: update.toolCallId,
            meta: update._meta,
          })
        ) {
          return;
        }

        const toolCallId = update.toolCallId;
        if (!toolCallId) return;

        let tracked = this.nativeTools.get(toolCallId);
        const inferredName =
          stripAgyMcpTitlePrefix(update.title ?? "") ||
          update.kind ||
          "antigravity_tool";

        if (!tracked) {
          tracked = {
            toolName: inferredName,
            ...(update.title ? { title: update.title } : {}),
            emittedCall: false,
            settledResult: false,
            latestPayload: update,
          };
          this.nativeTools.set(toolCallId, tracked);
        } else {
          tracked.latestPayload = {
            ...tracked.latestPayload,
            ...update,
            ...(update.rawInput !== undefined ? { rawInput: update.rawInput } : {}),
            ...(update.rawOutput !== undefined ? { rawOutput: update.rawOutput } : {}),
            ...(update.content ? { content: update.content } : {}),
            ...(update.locations ? { locations: update.locations } : {}),
          };
        }

        const status = tracked.latestPayload.status;
        const hasInput = tracked.latestPayload.rawInput !== undefined;

        if (!tracked.emittedCall && (hasInput || status === "completed" || status === "failed")) {
          tracked.emittedCall = true;
          this.anyTurnOutput = true;
          const inputJson = JSON.stringify(
            tracked.latestPayload.rawInput &&
              typeof tracked.latestPayload.rawInput === "object"
              ? tracked.latestPayload.rawInput
              : {},
          );
          emitter.emitNativeHostedToolCall(
            toolCallId,
            tracked.toolName,
            inputJson,
            tracked.title,
          );
        }

        if (
          tracked.emittedCall &&
          !tracked.settledResult &&
          (status === "completed" || status === "failed")
        ) {
          tracked.settledResult = true;
          const output = synthesizeNativeToolOutput(tracked.latestPayload);
          emitter.emitNativeHostedToolResult(
            toolCallId,
            tracked.toolName,
            output,
            status === "failed",
          );
        }
        return;
      }

      default:
        return;
    }
  }

  private async handlePermissionRequest(
    permParams: AcpRequestPermissionParams,
  ): Promise<AcpRequestPermissionResult> {
    if (
      isAgyMcpBridgedToolCall({
        title: permParams.toolCall.title,
        toolCallId: permParams.toolCall.toolCallId,
        meta: permParams.toolCall._meta ?? permParams._meta,
      })
    ) {
      // Auto-approve `mcp_opencode_*` inside `agy` so execution passes to OpenCode's
      // own tool engine + native permission prompts (`bash`, `edit`, `webfetch`, etc.).
      return selectPermissionOption(permParams.options, true);
    }

    if (this.params.toolMode !== "hybrid") {
      return selectPermissionOption(permParams.options, false);
    }

    if (!this.params.permission?.assert || !this.params.openCodeSessionId) {
      return selectPermissionOption(permParams.options, true);
    }

    this.pendingPermissionCount += 1;
    this.clearWatchdog();

    try {
      const checks = mapNativeToolPermissionChecks(permParams, this.params.cwd);
      for (const check of checks) {
        await this.params.permission.assert({
          sessionID: this.params.openCodeSessionId,
          ...(this.params.agent ? { agent: this.params.agent } : {}),
          action: check.action,
          resources: check.resources,
          metadata: check.metadata,
        });
      }
      return selectPermissionOption(permParams.options, true);
    } catch {
      return selectPermissionOption(permParams.options, false);
    } finally {
      this.pendingPermissionCount = Math.max(0, this.pendingPermissionCount - 1);
      this.touchWatchdog();
    }
  }
}

export class AgySessionManager {
  private readonly liveSessions = new Map<string, LiveSessionBinding>();
  private readonly persistedRecords = new Map<string, PersistedAgySessionRecord>();
  private readonly sessionLocks = new Map<string, AsyncLock>();
  private disposed = false;

  constructor(private readonly deps: AgySessionManagerDeps) {}

  private getSessionLock(sessionId: string): AsyncLock {
    let lock = this.sessionLocks.get(sessionId);
    if (!lock) {
      lock = new AsyncLock();
      this.sessionLocks.set(sessionId, lock);
    }
    return lock;
  }

  private async loadPersistedRecord(
    openCodeSessionId: string,
  ): Promise<PersistedAgySessionRecord | undefined> {
    const inMem = this.persistedRecords.get(openCodeSessionId);
    if (inMem) return inMem;
    if (!this.deps.storage) return undefined;

    try {
      const raw = await this.deps.storage.get(
        `${AGY_STORAGE_SESSION_PREFIX}${openCodeSessionId}`,
      );
      if (
        raw &&
        typeof raw === "object" &&
        typeof (raw as PersistedAgySessionRecord).acpSessionId === "string"
      ) {
        const rec = raw as PersistedAgySessionRecord;
        this.persistedRecords.set(openCodeSessionId, rec);
        return rec;
      }
    } catch {
      // Ignore storage read failure
    }
    return undefined;
  }

  private async savePersistedRecord(
    openCodeSessionId: string,
    record: PersistedAgySessionRecord,
  ): Promise<void> {
    this.persistedRecords.set(openCodeSessionId, record);
    if (!this.deps.storage) return;
    await this.deps.storage
      .set(`${AGY_STORAGE_SESSION_PREFIX}${openCodeSessionId}`, record)
      .catch(() => {});
  }

  createStream(
    requestedModelId: string,
    callOptions: LanguageModelV3CallOptions,
  ): ReadableStream<LanguageModelV3StreamPart> {
    const routing = extractCallRoutingMetadata(callOptions);
    const isStateful = Boolean(routing.sessionId && routing.kind === "primary");

    const streamAbort = new AbortController();
    let cleanupUpstreamAbort: (() => void) | undefined;
    if (callOptions.abortSignal) {
      if (callOptions.abortSignal.aborted) {
        streamAbort.abort(callOptions.abortSignal.reason);
      } else {
        const onUpstreamAbort = () => {
          streamAbort.abort(callOptions.abortSignal?.reason);
        };
        callOptions.abortSignal.addEventListener("abort", onUpstreamAbort, { once: true });
        cleanupUpstreamAbort = () => {
          callOptions.abortSignal?.removeEventListener("abort", onUpstreamAbort);
        };
      }
    }

    const effectiveCallOptions: LanguageModelV3CallOptions = {
      ...callOptions,
      abortSignal: streamAbort.signal,
    };

    let controllerSettled = false;
    let streamCancelled = false;
    let runPromise: Promise<void> | undefined;
    let parkedStep:
      | {
          readonly openCodeSessionId: string;
          readonly turn: ActiveAcpTurn;
          readonly stepEpoch: number;
        }
      | undefined;

    return new ReadableStream<LanguageModelV3StreamPart>({
      start: (controller) => {
        const safeEnqueue = (part: LanguageModelV3StreamPart): void => {
          if (controllerSettled || streamCancelled) return;
          try {
            controller.enqueue(part);
          } catch {
            controllerSettled = true;
          }
        };

        const safeClose = (): void => {
          if (controllerSettled || streamCancelled) return;
          controllerSettled = true;
          try {
            controller.close();
          } catch {
            // Ignore already-closed controller
          }
        };

        const safeError = (err: Error): void => {
          if (controllerSettled || streamCancelled) return;
          controllerSettled = true;
          try {
            controller.error(err);
          } catch {
            // Ignore already-closed controller
          }
        };

        runPromise = (async () => {
          try {
            if (isStateful && routing.sessionId) {
              await this.runStatefulSessionStep(
                routing.sessionId,
                requestedModelId,
                effectiveCallOptions,
                routing,
                safeEnqueue,
                (info) => {
                  parkedStep = info;
                },
              );
            } else {
              await this.runStatelessAuxiliaryCall(
                requestedModelId,
                effectiveCallOptions,
                routing,
                safeEnqueue,
              );
            }
            safeClose();
          } catch (error) {
            if (!streamCancelled) {
              if (!streamAbort.signal.aborted) {
                this.inspectForAuthFailure(error);
              }
              safeError(
                streamAbort.signal.aborted
                  ? error instanceof Error
                    ? error
                    : new Error(String(error))
                  : this.normalizeOutboundError(error),
              );
            }
          } finally {
            cleanupUpstreamAbort?.();
            cleanupUpstreamAbort = undefined;
          }
        })();
      },
      cancel: async (reason) => {
        streamCancelled = true;
        controllerSettled = true;
        if (!streamAbort.signal.aborted) {
          streamAbort.abort(
            reason instanceof Error
              ? reason
              : new DOMException(
                  reason !== undefined ? String(reason) : "The stream was cancelled.",
                  "AbortError",
                ),
          );
        }
        cleanupUpstreamAbort?.();
        cleanupUpstreamAbort = undefined;
        if (runPromise) {
          await runPromise.catch(() => {});
        }
        const pendingParked = parkedStep;
        parkedStep = undefined;
        if (pendingParked && !this.disposed) {
          await this.getSessionLock(pendingParked.openCodeSessionId)
            .run(async () => {
              const live = this.liveSessions.get(pendingParked.openCodeSessionId);
              if (
                live?.activeTurn === pendingParked.turn &&
                pendingParked.turn.stepEpoch === pendingParked.stepEpoch
              ) {
                live.activeTurn = undefined;
                await pendingParked.turn.abortTurn();
              }
            })
            .catch(() => {});
        }
      },
    });
  }

  private inspectForAuthFailure(error: unknown): void {
    const classified = classifyAcpAuthError(error);
    if (classified.state === "needs_auth" || classified.state === "missing") {
      this.deps.onAuthFailure?.(classified.message);
    }
  }

  private normalizeOutboundError(error: unknown): Error {
    if (error instanceof AgyTurnOutcomeError || error instanceof AcpRpcError) {
      return error;
    }
    const classified = classifyAcpAuthError(error);
    if (classified.state === "needs_auth" || classified.state === "missing") {
      return new AcpRpcError({
        code: -32000,
        status: 401,
        message: classified.message,
        isRetryable: false,
        cause: error,
      });
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  private async applySessionModelThoughtAndMode(
    connection: AcpConnection,
    acpSessionId: string,
    requestedModelId: string,
    requestedEffort: string | undefined,
    requestedMode: string | undefined,
    agent: string | undefined,
    currentConfigOptions: AcpSessionConfigOption[],
    modes: AcpSessionModeState | null | undefined,
    signal?: AbortSignal,
  ): Promise<AcpSessionConfigOption[]> {
    let configOptions = [...currentConfigOptions];
    const firstPass = this.deps.catalog.resolveAcpModelAndThoughtLevel(
      requestedModelId,
      requestedEffort,
      configOptions,
    );

    const modelOpt = findConfigOption(configOptions, "model");
    if (modelOpt && modelOpt.currentValue !== firstPass.modelId) {
      const res = await connection.setConfigOption(
        acpSessionId,
        modelOpt.id,
        firstPass.modelId,
        { signal },
      );
      configOptions = mergeSessionConfigOptions(configOptions, res.configOptions);
      this.deps.catalog.applyIncrementalConfigOptions(configOptions);
    }

    const secondPass = this.deps.catalog.resolveAcpModelAndThoughtLevel(
      firstPass.modelId,
      requestedEffort,
      configOptions,
    );

    const thoughtOpt = findConfigOption(configOptions, "thought_level");
    if (
      thoughtOpt &&
      secondPass.thoughtLevel &&
      thoughtOpt.currentValue !== secondPass.thoughtLevel
    ) {
      const res = await connection.setConfigOption(
        acpSessionId,
        thoughtOpt.id,
        secondPass.thoughtLevel,
        { signal },
      );
      configOptions = mergeSessionConfigOptions(configOptions, res.configOptions);
      this.deps.catalog.applyIncrementalConfigOptions(configOptions);
    }

    const desiredMode =
      requestedMode ?? (agent?.toLowerCase() === "plan" ? "plan" : undefined);
    if (desiredMode && modes?.availableModes?.length) {
      const validMode = modes.availableModes.find(
        (m) => m.id.toLowerCase() === desiredMode.toLowerCase(),
      );
      if (validMode && modes.currentModeId !== validMode.id) {
        await connection.setMode(acpSessionId, validMode.id, { signal }).catch(() => {});
      }
    }

    return configOptions;
  }

  private async runStatefulSessionStep(
    openCodeSessionId: string,
    requestedModelId: string,
    callOptions: LanguageModelV3CallOptions,
    routing: ReturnType<typeof extractCallRoutingMetadata>,
    enqueue: (part: LanguageModelV3StreamPart) => void,
    onStepParked?: (info: {
      readonly openCodeSessionId: string;
      readonly turn: ActiveAcpTurn;
      readonly stepEpoch: number;
    }) => void,
  ): Promise<void> {
    await this.getSessionLock(openCodeSessionId).run(async () => {
      if (this.disposed) {
        throw new Error("Antigravity session manager has been disposed.");
      }

      const { systemAppend, systemHash, nonSystemMessages, digests } =
        extractSystemAndConversation(callOptions.prompt, callOptions);

      // 1. Check if this `doStream` call is supplying OpenCode MCP tool results to a parked turn
      const existingLive = this.liveSessions.get(openCodeSessionId);
      if (existingLive?.activeTurn && existingLive.mcpBridge.hasParkedToolCalls) {
        const trailingToolResults = extractTrailingToolResults(nonSystemMessages);
        if (trailingToolResults.length > 0 && existingLive.connection.alive) {
          existingLive.mcpBridge.updateTools(
            callOptions.tools,
            callOptions.toolChoice,
            existingLive.toolMode,
          );
          const emitter = new StepStreamEmitter(enqueue, requestedModelId);
          const resumedTurn = existingLive.activeTurn;
          try {
            const { turnDone } = await resumedTurn.executeStep(emitter, {
              signal: callOptions.abortSignal,
              supplyToolResults: trailingToolResults,
            });
            if (!turnDone && callOptions.abortSignal?.aborted) {
              existingLive.activeTurn = undefined;
              await resumedTurn.abortTurn();
              throw callOptions.abortSignal.reason instanceof Error
                ? callOptions.abortSignal.reason
                : new DOMException("The operation was aborted.", "AbortError");
            }
            if (turnDone) {
              existingLive.activeTurn = undefined;
              await this.savePersistedRecord(openCodeSessionId, {
                acpSessionId: existingLive.acpSessionId,
                cwd: existingLive.cwd,
                systemHash: existingLive.systemHash,
                syncedMessageDigests: digests,
                updatedAt: Date.now(),
              });
            } else {
              onStepParked?.({
                openCodeSessionId,
                turn: resumedTurn,
                stepEpoch: resumedTurn.stepEpoch,
              });
            }
            return;
          } catch (err) {
            existingLive.activeTurn = undefined;
            throw err;
          }
        }

        // User interrupted/rewound instead of supplying parked tool results — tear down stale turn
        await existingLive.activeTurn.abortTurn();
        existingLive.activeTurn = undefined;
      }

      // `toolChoice: { type: "none" }` on a fresh turn runs statelessly with all built-in
      // and MCP tools disabled (even when `toolMode === "hybrid"`), per architecture spec.
      if (callOptions.toolChoice?.type === "none") {
        await this.runStatelessAuxiliaryCall(
          requestedModelId,
          callOptions,
          routing,
          enqueue,
        );
        return;
      }

      await this.executeNewOrResumedStatefulTurn({
        openCodeSessionId,
        requestedModelId,
        callOptions,
        routing,
        systemAppend,
        systemHash,
        nonSystemMessages,
        digests,
        enqueue,
        onStepParked,
        forceFreshSession: false,
      });
    }, callOptions.abortSignal);
  }

  private async executeNewOrResumedStatefulTurn(input: {
    openCodeSessionId: string;
    requestedModelId: string;
    callOptions: LanguageModelV3CallOptions;
    routing: ReturnType<typeof extractCallRoutingMetadata>;
    systemAppend: string;
    systemHash: string;
    nonSystemMessages: LanguageModelV3Message[];
    digests: string[];
    enqueue: (part: LanguageModelV3StreamPart) => void;
    onStepParked?: (info: {
      readonly openCodeSessionId: string;
      readonly turn: ActiveAcpTurn;
      readonly stepEpoch: number;
    }) => void;
    forceFreshSession: boolean;
  }): Promise<void> {
    const baseSpawnConfig = await this.deps.getSpawnConfig();
    const toolMode = input.routing.toolModeOverride ?? this.deps.getToolMode();
    const spawnConfig: AgySpawnConfig = {
      ...baseSpawnConfig,
      includeDefaultCustomizations:
        baseSpawnConfig.includeDefaultCustomizations ??
        (toolMode !== "hybrid" ? false : undefined),
    };
    const cwd = spawnConfig.cwd ?? process.cwd();

    const persisted = input.forceFreshSession
      ? undefined
      : await this.loadPersistedRecord(input.openCodeSessionId);

    const isStrictExtension =
      Boolean(persisted) &&
      !input.routing.forkSourceSessionId &&
      persisted!.cwd === cwd &&
      persisted!.syncedMessageDigests.length > 0 &&
      input.digests.length > persisted!.syncedMessageDigests.length &&
      persisted!.syncedMessageDigests.every(
        (digest, index) => input.digests[index] === digest,
      );

    let live = this.liveSessions.get(input.openCodeSessionId);
    if (
      live &&
      (!live.connection.alive ||
        live.cwd !== cwd ||
        live.toolMode !== toolMode ||
        live.systemHash !== input.systemHash ||
        input.forceFreshSession ||
        !isStrictExtension)
    ) {
      await this.disposeLiveBinding(input.openCodeSessionId, live);
      live = undefined;
    }

    let resumedExistingSession = false;

    if (live && isStrictExtension && persisted && live.acpSessionId === persisted.acpSessionId) {
      resumedExistingSession = true;
    } else {
      const mcpBridge = new OpenCodeMcpBridge();
      await mcpBridge.start();
      mcpBridge.updateTools(input.callOptions.tools, input.callOptions.toolChoice, toolMode);

      let connection: AcpConnection;
      let release: (() => void) | undefined;
      let setup: AcpSessionSetupResult | undefined;

      try {
        const lease = await this.deps.pool.acquire(spawnConfig, {
          signal: input.callOptions.abortSignal,
        });
        connection = lease.connection;
        release = lease.release;

        const mcpServer = mcpBridge.toAcpMcpServer(
          connection.initializeResult?.agentCapabilities,
        );
        const sessionMeta = {
          disableBuiltInTools: toolMode !== "hybrid",
          ...(input.systemAppend
            ? {
                antigravity: {
                  systemPrompt: {
                    append: input.systemAppend,
                  },
                },
              }
            : {}),
        };

        if (isStrictExtension && persisted) {
          try {
            setup = await connection.resumeSession(
              {
                sessionId: persisted.acpSessionId,
                cwd,
                mcpServers: [mcpServer],
                _meta: sessionMeta,
              },
              { signal: input.callOptions.abortSignal },
            );
            resumedExistingSession = true;
          } catch {
            resumedExistingSession = false;
          }
        }

        if (!setup) {
          setup = await connection.createSession(
            {
              cwd,
              mcpServers: [mcpServer],
              _meta: sessionMeta,
            },
            { signal: input.callOptions.abortSignal },
          );
        }
      } catch (err) {
        await mcpBridge.close().catch(() => {});
        release?.();
        throw err;
      }

      const initialConfigOptions = setup.configOptions ? [...setup.configOptions] : [];
      this.deps.catalog.applyIncrementalConfigOptions(initialConfigOptions);

      live = {
        acpSessionId: setup.sessionId,
        connection,
        releaseWorker: release,
        mcpBridge,
        cwd,
        toolMode,
        systemHash: input.systemHash,
        configOptions: initialConfigOptions,
        modes: setup.modes,
      };
      this.liveSessions.set(input.openCodeSessionId, live);
    }

    live.mcpBridge.updateTools(input.callOptions.tools, input.callOptions.toolChoice, toolMode);

    live.configOptions = await this.applySessionModelThoughtAndMode(
      live.connection,
      live.acpSessionId,
      input.requestedModelId,
      input.routing.effort,
      input.routing.mode,
      input.routing.agent,
      live.configOptions,
      live.modes,
      input.callOptions.abortSignal,
    );

    let messagesToSend: LanguageModelV3Message[];
    if (resumedExistingSession && persisted) {
      const rawDelta = input.nonSystemMessages.slice(
        persisted.syncedMessageDigests.length,
      );
      // Skip leading assistant/tool outputs from the completion of the previously
      // synced turn already persisted inside `<sessionId>.db`.
      const firstUserIdx = rawDelta.findIndex((m) => m.role === "user");
      messagesToSend = firstUserIdx > 0 ? rawDelta.slice(firstUserIdx) : rawDelta;
    } else {
      messagesToSend = input.nonSystemMessages;
    }

    const promptBlocks = buildPromptBlocksFromMessages(
      messagesToSend,
      live.connection.initializeResult?.agentCapabilities,
      {
        forceCheckpoint:
          !resumedExistingSession &&
          (input.forceFreshSession || Boolean(input.routing.forkSourceSessionId)),
      },
    );

    const dbPath = resolveSessionDbPath(live.acpSessionId, {
      geminiDir: spawnConfig.geminiDir,
      appDataDir: spawnConfig.appDataDir,
      env: spawnConfig.env,
    });
    const preTurnMaxIdx = resumedExistingSession ? await readPreTurnMaxStepIdx(dbPath) : -1;

    const capturedLive = live;
    const turn = new ActiveAcpTurn({
      acpSessionId: capturedLive.acpSessionId,
      openCodeSessionId: input.openCodeSessionId,
      agent: input.routing.agent,
      cwd,
      dbPath,
      preTurnMaxIdx,
      toolMode,
      watchdogTimeoutMs:
        this.deps.getWatchdogTimeoutMs() > 0
          ? this.deps.getWatchdogTimeoutMs()
          : DEFAULT_WATCHDOG_TIMEOUT_MS,
      connection: capturedLive.connection,
      mcpBridge: capturedLive.mcpBridge,
      permission: this.deps.permission,
      onConfigUpdate: (updated) => {
        capturedLive.configOptions = mergeSessionConfigOptions(
          capturedLive.configOptions,
          updated,
        );
        this.deps.catalog.applyIncrementalConfigOptions(capturedLive.configOptions);
      },
    });

    capturedLive.activeTurn = turn;
    turn.startPrompt(promptBlocks);

    let bufferedRetryParts: LanguageModelV3StreamPart[] | undefined =
      resumedExistingSession && !input.forceFreshSession ? [] : undefined;

    const emitter = new StepStreamEmitter((part) => {
      if (bufferedRetryParts) {
        if (part.type === "stream-start" || part.type === "response-metadata") {
          bufferedRetryParts.push(part);
          return;
        }
        // Flush buffered header parts on first real output chunk
        for (const headerPart of bufferedRetryParts) {
          input.enqueue(headerPart);
        }
        bufferedRetryParts = undefined;
      }
      input.enqueue(part);
    }, input.requestedModelId);

    try {
      const { turnDone } = await turn.executeStep(emitter, {
        signal: input.callOptions.abortSignal,
      });

      if (!turnDone && input.callOptions.abortSignal?.aborted) {
        capturedLive.activeTurn = undefined;
        await turn.abortTurn();
        throw input.callOptions.abortSignal.reason instanceof Error
          ? input.callOptions.abortSignal.reason
          : new DOMException("The operation was aborted.", "AbortError");
      }

      if (bufferedRetryParts) {
        for (const headerPart of bufferedRetryParts) {
          input.enqueue(headerPart);
        }
        bufferedRetryParts = undefined;
      }

      if (turnDone) {
        capturedLive.activeTurn = undefined;
        await this.savePersistedRecord(input.openCodeSessionId, {
          acpSessionId: capturedLive.acpSessionId,
          cwd,
          systemHash: input.systemHash,
          syncedMessageDigests: input.digests,
          updatedAt: Date.now(),
        });
      } else {
        input.onStepParked?.({
          openCodeSessionId: input.openCodeSessionId,
          turn,
          stepEpoch: turn.stepEpoch,
        });
      }
    } catch (err) {
      capturedLive.activeTurn = undefined;

      const isSigCorruption =
        (err instanceof AgyTurnOutcomeError && err.isInvalidThinkingSignature) ||
        (err instanceof Error && isInvalidThinkingSignatureText(err.message));

      // Automatic `#28889` Claude thinking signature recovery on resumed sessions!
      if (
        isSigCorruption &&
        resumedExistingSession &&
        !input.forceFreshSession &&
        !turn.hasEmittedAnyOutput
      ) {
        await this.disposeLiveBinding(input.openCodeSessionId, capturedLive);
        await this.executeNewOrResumedStatefulTurn({
          ...input,
          forceFreshSession: true,
        });
        return;
      }

      throw err;
    }
  }

  private async runStatelessAuxiliaryCall(
    requestedModelId: string,
    callOptions: LanguageModelV3CallOptions,
    routing: ReturnType<typeof extractCallRoutingMetadata>,
    enqueue: (part: LanguageModelV3StreamPart) => void,
  ): Promise<void> {
    const baseConfig = await this.deps.getSpawnConfig();
    const tempCwd = mkdtempSync(
      `${tmpdir()}/opencode-agy-${routing.kind || "aux"}-`,
    );

    // Keep pooled worker OS cwd on a persistent directory so `rmSync(tempCwd)` in `finally`
    // never unlinks the working directory of a pooled `agy acp` process.
    const auxConfig: AgySpawnConfig = {
      ...baseConfig,
      cwd: baseConfig.cwd ?? tmpdir(),
      includeDefaultCustomizations: false,
    };

    const { systemAppend, nonSystemMessages } = extractSystemAndConversation(
      callOptions.prompt,
      callOptions,
    );

    const hasActiveFunctionTools =
      callOptions.toolChoice?.type !== "none" &&
      Boolean(callOptions.tools?.some((t) => t.type === "function"));

    let mcpBridge: OpenCodeMcpBridge | undefined;
    if (hasActiveFunctionTools) {
      mcpBridge = new OpenCodeMcpBridge();
      await mcpBridge.start();
      mcpBridge.updateTools(callOptions.tools, callOptions.toolChoice, "opencode");
    }

    let lease: { connection: AcpConnection; release: () => void } | undefined;
    let acpSessionId: string | undefined;
    let activeTurn: ActiveAcpTurn | undefined;
    let turnCompleted = false;

    try {
      lease = await this.deps.pool.acquire(auxConfig, {
        signal: callOptions.abortSignal,
      });
      const { connection } = lease;

      const mcpServers = mcpBridge
        ? [mcpBridge.toAcpMcpServer(connection.initializeResult?.agentCapabilities)]
        : [];

      const setup = await connection.createSession(
        {
          cwd: tempCwd,
          mcpServers,
          _meta: {
            disableBuiltInTools: true,
            ...(systemAppend
              ? {
                  antigravity: {
                    systemPrompt: {
                      append: systemAppend,
                    },
                  },
                }
              : {}),
          },
        },
        { signal: callOptions.abortSignal },
      );
      acpSessionId = setup.sessionId;

      const initialConfig = setup.configOptions ? [...setup.configOptions] : [];
      await this.applySessionModelThoughtAndMode(
        connection,
        acpSessionId,
        requestedModelId,
        routing.effort,
        routing.mode,
        routing.agent,
        initialConfig,
        setup.modes,
        callOptions.abortSignal,
      );

      const promptBlocks = buildPromptBlocksFromMessages(
        nonSystemMessages,
        connection.initializeResult?.agentCapabilities,
      );

      const dbPath = resolveSessionDbPath(acpSessionId, {
        geminiDir: auxConfig.geminiDir,
        appDataDir: auxConfig.appDataDir,
        env: auxConfig.env,
      });
      const preTurnMaxIdx = -1;

      activeTurn = new ActiveAcpTurn({
        acpSessionId,
        cwd: tempCwd,
        dbPath,
        preTurnMaxIdx,
        toolMode: "opencode",
        watchdogTimeoutMs:
          this.deps.getWatchdogTimeoutMs() > 0
            ? this.deps.getWatchdogTimeoutMs()
            : DEFAULT_WATCHDOG_TIMEOUT_MS,
        connection,
        ...(mcpBridge ? { mcpBridge } : {}),
      });

      const emitter = new StepStreamEmitter(enqueue, requestedModelId);
      activeTurn.startPrompt(promptBlocks);
      const { turnDone } = await activeTurn.executeStep(emitter, {
        signal: callOptions.abortSignal,
      });
      turnCompleted = turnDone;
    } finally {
      if (activeTurn && !turnCompleted) {
        await activeTurn.abortTurn().catch(() => {});
      }
      if (mcpBridge) {
        await mcpBridge.close().catch(() => {});
      }
      if (acpSessionId && lease) {
        await lease.connection.closeSession(acpSessionId).catch(() => {});
        cleanupSessionDbFiles(acpSessionId, {
          geminiDir: auxConfig.geminiDir,
          appDataDir: auxConfig.appDataDir,
          env: auxConfig.env,
        });
      }
      lease?.release();
      try {
        rmSync(tempCwd, { recursive: true, force: true });
      } catch {
        // Ignore temp dir removal errors
      }
    }
  }

  private async disposeLiveBinding(
    openCodeSessionId: string,
    binding: LiveSessionBinding,
  ): Promise<void> {
    if (this.liveSessions.get(openCodeSessionId) === binding) {
      this.liveSessions.delete(openCodeSessionId);
    }
    if (binding.activeTurn) {
      await binding.activeTurn.abortTurn().catch(() => {});
      binding.activeTurn = undefined;
    }
    await binding.connection.closeSession(binding.acpSessionId).catch(() => {});
    await binding.mcpBridge.close().catch(() => {});
    binding.releaseWorker();
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const tasks: Array<Promise<void>> = [];
    for (const [sessionId, binding] of this.liveSessions.entries()) {
      tasks.push(this.disposeLiveBinding(sessionId, binding));
    }
    await Promise.all(tasks);
  }
}
