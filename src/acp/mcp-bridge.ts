import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { AgyToolMode } from "../plugin/types";
import type {
  AcpAgentCapabilities,
  AcpMcpServer,
  LanguageModelV3FunctionTool,
  LanguageModelV3ProviderTool,
  LanguageModelV3ToolChoice,
  LanguageModelV3ToolResultOutput,
  LanguageModelV3ToolResultPart,
} from "./types";

const TOOL_BATCH_COALESCE_MS = 25;
const TOOL_BATCH_MAX_WAIT_MS = 150;

/**
 * OpenCode built-in filesystem/shell/search tools that directly duplicate `agy`'s
 * native Cortex tools when `toolMode === "hybrid"`. Non-overlapping OpenCode tools
 * (`task`, `subagent`, `skill`, `todowrite`, `question`, `webfetch`, `lsp`, custom MCPs, etc.)
 * remain exposed over the `opencode` MCP bridge in `"hybrid"` mode.
 */
const HYBRID_OVERLAPPING_OPENCODE_TOOLS = new Set([
  "bash",
  "read",
  "write",
  "edit",
  "multiedit",
  "patch",
  "apply_patch",
  "glob",
  "grep",
  "list",
  "ls",
  "websearch",
]);

export const AGY_MCP_SERVER_NAME = "opencode";

/**
 * Self-contained Node/Bun stdio-to-HTTP MCP relay script.
 * Supports concurrent JSON-RPC `tools/call` requests without head-of-line blocking,
 * preserves multi-byte UTF-8 characters split across pipe chunks, and works under
 * both `node` and compiled OpenCode (`BUN_BE_BUN=1`).
 */
const STDIO_HTTP_RELAY_SCRIPT = `
const http = require("node:http");
const url = new URL(process.env.OPENCODE_AGY_MCP_URL);
const token = process.env.OPENCODE_AGY_MCP_TOKEN || "";
let inFlight = 0;
let stdinEnded = false;
let rawBuf = Buffer.alloc(0);
const CL_PREFIX_LEN = 15;
const HEADER_SEP = Buffer.from("\\r\\n\\r\\n", "ascii");

function maybeExit() {
  if (stdinEnded && inFlight === 0) process.exit(0);
}

function forwardJsonFrame(rawJson) {
  const trimmed = rawJson.trim();
  if (!trimmed) return;
  inFlight++;
  const body = Buffer.from(trimmed, "utf8");
  const req = http.request(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token,
        "Content-Length": body.length,
      },
    },
    (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const respText = Buffer.concat(chunks).toString("utf8").trim();
        if (respText && res.statusCode !== 202 && res.statusCode !== 204) {
          try {
            const compact = JSON.stringify(JSON.parse(respText));
            process.stdout.write(compact + "\\n");
          } catch {
            process.stdout.write(respText.replace(/[\\r\\n]+/g, " ") + "\\n");
          }
        }
        inFlight--;
        maybeExit();
      });
    }
  );
  req.on("error", (err) => {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && parsed.id !== undefined && parsed.id !== null) {
        process.stdout.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: parsed.id,
            error: { code: -32603, message: err.message || "MCP bridge error" },
          }) + "\\n"
        );
      }
    } catch {}
    inFlight--;
    maybeExit();
  });
  req.write(body);
  req.end();
}

function drainBuffer() {
  while (rawBuf.length > 0) {
    let start = 0;
    while (
      start < rawBuf.length &&
      (rawBuf[start] === 13 || rawBuf[start] === 10 || rawBuf[start] === 32 || rawBuf[start] === 9)
    ) {
      start++;
    }
    if (start > 0) {
      rawBuf = rawBuf.subarray(start);
      if (rawBuf.length === 0) return;
    }

    if (rawBuf[0] === 67 || rawBuf[0] === 99) {
      if (rawBuf.length < CL_PREFIX_LEN) return;
      if (rawBuf.subarray(0, CL_PREFIX_LEN).toString("ascii").toLowerCase() === "content-length:") {
        const headerEnd = rawBuf.indexOf(HEADER_SEP);
        if (headerEnd === -1) return;
        const headerStr = rawBuf.subarray(0, headerEnd).toString("ascii");
        const m = headerStr.match(/Content-Length:\\s*(\\d+)/i);
        const byteLen = m ? Number(m[1]) : 0;
        const bodyStart = headerEnd + 4;
        if (rawBuf.length < bodyStart + byteLen) return;
        const frameText = rawBuf.subarray(bodyStart, bodyStart + byteLen).toString("utf8");
        rawBuf = rawBuf.subarray(bodyStart + byteLen);
        forwardJsonFrame(frameText);
        continue;
      }
    }

    const nl = rawBuf.indexOf(10);
    if (nl === -1) return;
    const line = rawBuf.subarray(0, nl).toString("utf8");
    rawBuf = rawBuf.subarray(nl + 1);
    forwardJsonFrame(line);
  }
}

process.stdin.on("data", (chunk) => {
  const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  rawBuf = rawBuf.length === 0 ? b : Buffer.concat([rawBuf, b]);
  drainBuffer();
});
process.stdin.on("end", () => {
  if (rawBuf.length > 0) {
    const rem = rawBuf.toString("utf8").trim();
    rawBuf = Buffer.alloc(0);
    if (rem) forwardJsonFrame(rem);
  }
  stdinEnded = true;
  maybeExit();
});
`.trim();

export type McpToolResultBlock =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image"; readonly data: string; readonly mimeType: string }
  | {
      readonly type: "resource";
      readonly resource:
        | { readonly uri: string; readonly mimeType?: string; readonly text: string }
        | { readonly uri: string; readonly mimeType?: string; readonly blob: string };
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

interface InternalParkedCall extends ParkedOpenCodeToolCall {
  emitted: boolean;
  readonly resolve: (result: McpCallToolResult) => void;
}

interface RegisteredToolEntry {
  readonly mcpName: string;
  readonly openCodeName: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

/**
 * Strips `agy`'s `"Run mcp_opencode_..."` wrapper prefix from ACP titles/names (`#36138`).
 */
export function stripAgyMcpTitlePrefix(rawTitleOrName: string): string {
  let clean = rawTitleOrName.trim();
  clean = clean.replace(/^run\s+/i, "");
  clean = clean.replace(new RegExp(`^mcp_${AGY_MCP_SERVER_NAME}_`, "i"), "");
  clean = clean.replace(new RegExp(`^${AGY_MCP_SERVER_NAME}_`, "i"), "");
  return clean.trim();
}

export function isAgyMcpBridgedToolCall(input: {
  title?: string | null;
  toolCallId?: string | null;
  meta?: Record<string, unknown> | null;
}): boolean {
  const title = input.title ?? "";
  if (
    new RegExp(`\\bmcp_${AGY_MCP_SERVER_NAME}_`, "i").test(title) ||
    new RegExp(`^run\\s+mcp_${AGY_MCP_SERVER_NAME}_`, "i").test(title)
  ) {
    return true;
  }
  const serverName = input.meta?.mcpServerName ?? input.meta?.serverName;
  return serverName === AGY_MCP_SERVER_NAME;
}

/**
 * Removes Antigravity's injected `toolSummary` field unless the OpenCode tool's
 * JSON Schema explicitly declares `properties.toolSummary` (`#36138`).
 */
export function stripInjectedToolSummary(
  rawArgs: unknown,
  inputSchema?: Record<string, unknown>,
): Record<string, unknown> {
  if (!rawArgs || typeof rawArgs !== "object" || Array.isArray(rawArgs)) {
    return {};
  }

  const record = rawArgs as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(record, "toolSummary")) {
    return { ...record };
  }

  const props = inputSchema?.properties;
  if (
    props &&
    typeof props === "object" &&
    !Array.isArray(props) &&
    Object.prototype.hasOwnProperty.call(props, "toolSummary")
  ) {
    return { ...record };
  }

  const copy = { ...record };
  delete copy.toolSummary;
  return copy;
}

function stripDataUrlPrefix(data: string): string {
  const match = data.match(/^data:[^;]+;base64,(.+)$/s);
  return match?.[1] ? match[1] : data;
}

/**
 * Converts AI SDK `LanguageModelV3ToolResultOutput` into MCP `CallToolResult`,
 * preserving multimodal `image` and `resource` blocks (`#36144`).
 */
export function convertToolResultOutputToMcp(
  output: LanguageModelV3ToolResultOutput | unknown,
): McpCallToolResult {
  if (output === null || output === undefined) {
    return { content: [{ type: "text", text: "" }] };
  }
  if (typeof output === "string") {
    return { content: [{ type: "text", text: output }] };
  }
  if (typeof output !== "object") {
    return { content: [{ type: "text", text: String(output) }] };
  }

  const typed = output as LanguageModelV3ToolResultOutput;
  switch (typed.type) {
    case "text":
      return {
        content: [{ type: "text", text: typed.value ?? "" }],
      };
    case "json":
      return {
        content: [
          {
            type: "text",
            text:
              typeof typed.value === "string"
                ? typed.value
                : JSON.stringify(typed.value ?? null),
          },
        ],
      };
    case "error-text":
      return {
        content: [{ type: "text", text: typed.value ?? "Tool execution failed." }],
        isError: true,
      };
    case "error-json":
      return {
        content: [
          {
            type: "text",
            text:
              typeof typed.value === "string"
                ? typed.value
                : JSON.stringify(typed.value ?? null),
          },
        ],
        isError: true,
      };
    case "execution-denied":
      return {
        content: [
          {
            type: "text",
            text: typed.reason || "Tool execution was denied by the user.",
          },
        ],
        isError: true,
      };
    case "content": {
      const blocks: McpToolResultBlock[] = [];
      for (const item of typed.value ?? []) {
        if (!item || typeof item !== "object") continue;
        if (item.type === "text") {
          blocks.push({ type: "text", text: item.text });
        } else if (item.type === "image-data") {
          blocks.push({
            type: "image",
            data: stripDataUrlPrefix(item.data),
            mimeType: item.mediaType || "image/png",
          });
        } else if (item.type === "file-data") {
          if (item.mediaType?.startsWith("image/")) {
            blocks.push({
              type: "image",
              data: stripDataUrlPrefix(item.data),
              mimeType: item.mediaType,
            });
          } else {
            blocks.push({
              type: "resource",
              resource: {
                uri: item.filename
                  ? `file:///${item.filename.replace(/^\/+/, "")}`
                  : "attachment://file",
                mimeType: item.mediaType || "application/octet-stream",
                blob: stripDataUrlPrefix(item.data),
              },
            });
          }
        } else if (item.type === "image-url" || item.type === "file-url") {
          blocks.push({ type: "text", text: `[Attachment URL: ${item.url}]` });
        } else {
          blocks.push({ type: "text", text: JSON.stringify(item) });
        }
      }
      return {
        content: blocks.length > 0 ? blocks : [{ type: "text", text: "" }],
      };
    }
    default:
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
      };
  }
}

function encodeSafeMcpToolName(rawName: string, usedNames: Set<string>): string {
  if (/^[a-zA-Z0-9_-]{1,50}$/.test(rawName) && !usedNames.has(rawName)) {
    usedNames.add(rawName);
    return rawName;
  }
  const base =
    rawName
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "tool";
  let candidate = base;
  let suffix = 1;
  while (usedNames.has(candidate)) {
    candidate = `${base}_${suffix++}`;
  }
  usedNames.add(candidate);
  return candidate;
}

function normalizeInputSchema(schema: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!schema || typeof schema !== "object") {
    return { type: "object", properties: {} };
  }
  const copy = { ...schema };
  if (!copy.type) {
    copy.type = "object";
  }
  if (!copy.properties || typeof copy.properties !== "object") {
    copy.properties = {};
  }
  // Ensure `agy`'s injected `toolSummary` doesn't trip strict schema validators inside Cortex
  if (copy.additionalProperties === false) {
    delete copy.additionalProperties;
  }
  return copy;
}

/**
 * Per-session OpenCode MCP bridge server implementing the Pause-and-Yield state machine.
 */
export class OpenCodeMcpBridge {
  private server: Server | undefined;
  private port = 0;
  private readonly authToken = randomBytes(24).toString("hex");
  private readonly toolsByMcpName = new Map<string, RegisteredToolEntry>();
  private readonly parkedCalls = new Map<string, InternalParkedCall>();

  private batchWaiters: Array<(calls: ParkedOpenCodeToolCall[]) => void> = [];
  private coalesceTimer: ReturnType<typeof setTimeout> | undefined;
  private maxWaitTimer: ReturnType<typeof setTimeout> | undefined;
  private onActivityCallback: (() => void) | undefined;
  private acceptingCalls = true;
  private lastCancelReason = "Tool execution cancelled.";
  private closed = false;

  setOnActivity(cb: (() => void) | undefined): void {
    this.onActivityCallback = cb;
  }

  /**
   * Opens the turn gate so incoming MCP `tools/call` invocations are accepted
   * for the active `session/prompt` turn.
   */
  beginTurn(): void {
    if (this.closed) return;
    this.acceptingCalls = true;
  }

  /**
   * Closes the turn gate when a `session/prompt` turn settles or is aborted so
   * late/straggler `tools/call` HTTP requests cannot leak into `parkedCalls`
   * across turns or hang `session/cancel`.
   */
  endTurn(reason = "Tool execution cancelled."): void {
    this.acceptingCalls = false;
    this.lastCancelReason = reason;
    this.cancelParkedCalls(reason);
  }

  get hasParkedToolCalls(): boolean {
    return this.parkedCalls.size > 0;
  }

  get parkedCount(): number {
    return this.parkedCalls.size;
  }

  get batchWaiterCount(): number {
    return this.batchWaiters.length;
  }

  updateTools(
    tools: ReadonlyArray<LanguageModelV3FunctionTool | LanguageModelV3ProviderTool> | undefined,
    toolChoice?: LanguageModelV3ToolChoice,
    toolMode: AgyToolMode = "opencode",
  ): void {
    this.toolsByMcpName.clear();
    if (!tools || tools.length === 0 || toolChoice?.type === "none") {
      return;
    }

    const usedNames = new Set<string>();
    for (const tool of tools) {
      if (tool.type !== "function") continue;
      if (toolChoice?.type === "tool") {
        if (tool.name !== toolChoice.toolName) {
          continue;
        }
      } else if (
        toolMode === "hybrid" &&
        HYBRID_OVERLAPPING_OPENCODE_TOOLS.has(tool.name.trim().toLowerCase())
      ) {
        continue;
      }
      const mcpName = encodeSafeMcpToolName(tool.name, usedNames);
      this.toolsByMcpName.set(mcpName, {
        mcpName,
        openCodeName: tool.name,
        description: tool.description ?? `Execute OpenCode tool ${tool.name}`,
        inputSchema: normalizeInputSchema(tool.inputSchema),
      });
    }
  }

  async start(): Promise<void> {
    if (this.server) return;

    const srv = createServer((req, res) => {
      void this.handleHttpRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      srv.once("error", reject);
      srv.listen(0, "127.0.0.1", () => {
        srv.removeListener("error", reject);
        const addr = srv.address() as AddressInfo;
        this.port = addr.port;
        this.server = srv;
        resolve();
      });
    });
  }

  toAcpMcpServer(agentCapabilities?: AcpAgentCapabilities): AcpMcpServer {
    if (!this.server || this.port <= 0) {
      throw new Error("OpenCodeMcpBridge must be started before generating AcpMcpServer config.");
    }
    const endpointUrl = `http://127.0.0.1:${this.port}/mcp`;

    if (agentCapabilities?.mcpCapabilities?.http === true) {
      return {
        type: "http",
        name: AGY_MCP_SERVER_NAME,
        url: endpointUrl,
        headers: [
          {
            name: "Authorization",
            value: `Bearer ${this.authToken}`,
          },
        ],
      };
    }

    const env: Array<{ name: string; value: string }> = [
      { name: "OPENCODE_AGY_MCP_URL", value: endpointUrl },
      { name: "OPENCODE_AGY_MCP_TOKEN", value: this.authToken },
    ];
    if ((process.versions as Record<string, string | undefined>).bun) {
      env.unshift({ name: "BUN_BE_BUN", value: "1" });
    }

    return {
      name: AGY_MCP_SERVER_NAME,
      command: process.execPath,
      args: ["-e", STDIO_HTTP_RELAY_SCRIPT],
      env,
    };
  }

  /**
   * Resolves as soon as one or more un-emitted MCP `tools/call` invocations are
   * parked waiting for OpenCode tool execution (coalescing parallel tool calls).
   * Pass `signal` to unregister the waiter cleanly when the current step finishes
   * without tool calls or is aborted.
   */
  waitForNextToolBatch(signal?: AbortSignal): Promise<ParkedOpenCodeToolCall[]> {
    if (signal?.aborted) {
      return new Promise<ParkedOpenCodeToolCall[]>(() => {});
    }

    const readyNow = this.takeUnemittedCalls();
    if (readyNow.length > 0 && !this.coalesceTimer) {
      return Promise.resolve(readyNow);
    }

    return new Promise<ParkedOpenCodeToolCall[]>((resolve) => {
      const waiter = (calls: ParkedOpenCodeToolCall[]) => {
        signal?.removeEventListener("abort", onAbort);
        resolve(calls);
      };
      const onAbort = () => {
        const idx = this.batchWaiters.indexOf(waiter);
        if (idx >= 0) {
          this.batchWaiters.splice(idx, 1);
        }
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      this.batchWaiters.push(waiter);
    });
  }

  /**
   * Supplies OpenCode's `LanguageModelV3ToolResultPart` outputs to the parked
   * MCP `tools/call` promises so `agy acp` resumes its paused `session/prompt`.
   * Returns the number of matched parked calls resolved.
   */
  supplyToolResults(results: ReadonlyArray<LanguageModelV3ToolResultPart>): number {
    let resolvedCount = 0;
    for (const part of results) {
      const parked = this.parkedCalls.get(part.toolCallId);
      if (!parked) continue;
      this.parkedCalls.delete(part.toolCallId);
      resolvedCount += 1;
      this.onActivityCallback?.();
      parked.resolve(convertToolResultOutputToMcp(part.output));
    }
    return resolvedCount;
  }

  /**
   * Cancels any parked `tools/call` requests (e.g., on user abort, session rewind,
   * or worker teardown) so HTTP requests never hang, and clears stale batch waiters.
   */
  cancelParkedCalls(reason = "Tool execution cancelled."): void {
    this.lastCancelReason = reason;
    this.clearBatchTimers();
    this.batchWaiters.length = 0;
    for (const [id, call] of this.parkedCalls.entries()) {
      this.parkedCalls.delete(id);
      call.resolve({
        content: [{ type: "text", text: reason }],
        isError: true,
      });
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.cancelParkedCalls("MCP bridge closed.");
    const srv = this.server;
    this.server = undefined;
    if (srv) {
      await new Promise<void>((resolve) => {
        srv.close(() => resolve());
      });
    }
  }

  private takeUnemittedCalls(): ParkedOpenCodeToolCall[] {
    const out: ParkedOpenCodeToolCall[] = [];
    for (const call of this.parkedCalls.values()) {
      if (!call.emitted) {
        call.emitted = true;
        out.push({
          callId: call.callId,
          mcpToolName: call.mcpToolName,
          toolName: call.toolName,
          args: call.args,
          argsJson: call.argsJson,
        });
      }
    }
    return out;
  }

  private scheduleBatchFlush(): void {
    if (this.coalesceTimer) {
      clearTimeout(this.coalesceTimer);
    }
    this.coalesceTimer = setTimeout(() => {
      this.flushBatchWaiters();
    }, TOOL_BATCH_COALESCE_MS);
    this.coalesceTimer.unref?.();

    if (!this.maxWaitTimer) {
      this.maxWaitTimer = setTimeout(() => {
        this.flushBatchWaiters();
      }, TOOL_BATCH_MAX_WAIT_MS);
      this.maxWaitTimer.unref?.();
    }
  }

  private clearBatchTimers(): void {
    if (this.coalesceTimer) {
      clearTimeout(this.coalesceTimer);
      this.coalesceTimer = undefined;
    }
    if (this.maxWaitTimer) {
      clearTimeout(this.maxWaitTimer);
      this.maxWaitTimer = undefined;
    }
  }

  private flushBatchWaiters(): void {
    this.clearBatchTimers();
    if (this.batchWaiters.length === 0) return;

    const batch = this.takeUnemittedCalls();
    if (batch.length === 0) return;

    const waiters = this.batchWaiters.splice(0, this.batchWaiters.length);
    for (const waiter of waiters) {
      waiter(batch);
    }
  }

  private async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const authHeader = req.headers.authorization ?? "";
    if (authHeader !== `Bearer ${this.authToken}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    if (req.method === "GET") {
      res.writeHead(405, { Allow: "POST, DELETE" });
      res.end();
      return;
    }

    if (req.method === "DELETE") {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST, DELETE" });
      res.end();
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const rawText = Buffer.concat(chunks).toString("utf8").trim();
    if (!rawText) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Empty JSON-RPC payload" }));
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        }),
      );
      return;
    }

    if (Array.isArray(parsed)) {
      const responses = await Promise.all(
        parsed.map((item) => this.dispatchMcpRpc(item as Record<string, unknown>)),
      );
      const filtered = responses.filter((r) => r !== undefined);
      if (filtered.length === 0) {
        res.writeHead(202);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(filtered));
      return;
    }

    const singleResponse = await this.dispatchMcpRpc(parsed as Record<string, unknown>);
    if (singleResponse === undefined) {
      res.writeHead(202);
      res.end();
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(singleResponse));
  }

  private async dispatchMcpRpc(
    frame: Record<string, unknown>,
  ): Promise<Record<string, unknown> | undefined> {
    const id = frame.id;
    const method = typeof frame.method === "string" ? frame.method : "";
    const params = (frame.params ?? {}) as Record<string, unknown>;

    // JSON-RPC notifications have no `id`
    if (id === undefined || id === null) {
      return undefined;
    }

    this.onActivityCallback?.();

    switch (method) {
      case "initialize": {
        const requestedVersion =
          typeof params.protocolVersion === "string" && params.protocolVersion.trim()
            ? params.protocolVersion.trim()
            : "2024-11-05";
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: requestedVersion,
            capabilities: {
              tools: {
                listChanged: true,
              },
            },
            serverInfo: {
              name: AGY_MCP_SERVER_NAME,
              version: "1.0.0",
            },
          },
        };
      }

      case "ping":
        return { jsonrpc: "2.0", id, result: {} };

      case "tools/list": {
        const tools = [...this.toolsByMcpName.values()].map((t) => ({
          name: t.mcpName,
          description: t.description,
          inputSchema: t.inputSchema,
        }));
        return {
          jsonrpc: "2.0",
          id,
          result: { tools },
        };
      }

      case "tools/call": {
        if (this.closed || !this.acceptingCalls) {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: this.lastCancelReason,
                },
              ],
              isError: true,
            } satisfies McpCallToolResult,
          };
        }

        const rawName = typeof params.name === "string" ? params.name : "";
        const cleanLookupName = stripAgyMcpTitlePrefix(rawName);
        const toolEntry =
          this.toolsByMcpName.get(rawName) ??
          this.toolsByMcpName.get(cleanLookupName);

        if (!toolEntry) {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Unknown OpenCode tool: "${rawName}"`,
                },
              ],
              isError: true,
            } satisfies McpCallToolResult,
          };
        }

        const sanitizedArgs = stripInjectedToolSummary(
          params.arguments,
          toolEntry.inputSchema,
        );
        const callId = `agy_call_${randomUUID().replace(/-/g, "").slice(0, 20)}`;

        const result = await new Promise<McpCallToolResult>((resolve) => {
          this.parkedCalls.set(callId, {
            callId,
            mcpToolName: toolEntry.mcpName,
            toolName: toolEntry.openCodeName,
            args: sanitizedArgs,
            argsJson: JSON.stringify(sanitizedArgs),
            emitted: false,
            resolve,
          });
          this.scheduleBatchFlush();
        });

        return {
          jsonrpc: "2.0",
          id,
          result,
        };
      }

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        };
    }
  }
}
