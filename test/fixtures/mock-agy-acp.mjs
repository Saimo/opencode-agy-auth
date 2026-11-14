#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const argv = process.argv.slice(2);

function readArgValue(flag) {
  const idx = argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < argv.length) {
    return argv[idx + 1];
  }
  return undefined;
}

const geminiDir = readArgValue("--gemini-dir") || join(homedir(), ".gemini");
const appDataDir = readArgValue("--app-data-dir") || "antigravity-cli";
const conversationsDir = join(geminiDir, appDataDir, "conversations");

const sessions = new Map();
const pendingClientRpcs = new Map();
let nextServerRpcId = 1000;
let websearch429Triggered = false;

const MODEL_THOUGHT_MAP =
  process.env.MOCK_AGY_158_CATALOG === "1"
    ? {
        "gemini-4-carbon": ["low", "medium", "high"],
        "gemini-4-argon": ["low", "medium", "high"],
        "gemini-4-hydrogen": ["low", "medium", "high", "xhigh"],
        "gemini-pro-orchestrator": [],
        "gemini-pro-orchestrator-argon": [],
        "gemini-3.8-flash": ["low", "medium", "high"],
        "claude-opus-5-5": ["low", "medium", "high"],
        "claude-sonnet-5-5": ["low", "medium", "high"],
        "gpt-oss-120b-medium": [],
      }
    : {
        "gemini-4-carbon": ["low", "medium", "high"],
        "gemini-4-hydrogen": ["low", "medium", "high", "xhigh"],
        "gemini-4-neon": ["minimal", "medium", "max"],
        "gemini-3-flash": [],
        "gemini-3.5-flash-lite": [],
        "gemini-3.1-flash-lite": [],
        "claude-sonnet-5-5": ["low", "medium", "high"],
      };

let setConfigCallCount = 0;
let cancelledSessionCount = 0;

function sendFrame(frame) {
  process.stdout.write(`${JSON.stringify(frame)}\n`);
}

function sendResult(id, result) {
  sendFrame({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message, data) {
  sendFrame({
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  });
}

function sendSessionUpdate(sessionId, update) {
  sendFrame({
    jsonrpc: "2.0",
    method: "session/update",
    params: { sessionId, update },
  });
}

function requestClient(method, params) {
  const id = nextServerRpcId++;
  return new Promise((resolve, reject) => {
    pendingClientRpcs.set(id, { resolve, reject });
    sendFrame({ jsonrpc: "2.0", id, method, params });
  });
}

function buildConfigOptionsForModel(modelId, thoughtLevel, modeId = "default") {
  const thoughts = MODEL_THOUGHT_MAP[modelId] ?? ["low", "medium", "high"];
  const selectedThought =
    thoughtLevel && thoughts.includes(thoughtLevel)
      ? thoughtLevel
      : thoughts.includes("medium")
        ? "medium"
        : thoughts[0] ?? "";

  const modelOptions =
    process.env.MOCK_AGY_158_CATALOG === "1"
      ? [
          {
            group: "gemini",
            name: "Gemini",
            options: [
              { value: "gemini-4-carbon", name: "Gemini 4 Carbon" },
              { value: "gemini-4-argon", name: "Gemini 4 Argon" },
              { value: "gemini-4-hydrogen", name: "Gemini 4 Hydrogen" },
              { value: "gemini-pro-orchestrator", name: "Gemini Pro Orchestrator" },
              { value: "gemini-pro-orchestrator-argon", name: "Gemini Pro Orchestrator Argon" },
              { value: "gemini-3.8-flash", name: "Gemini 3.8 Flash" },
            ],
          },
          {
            group: "other",
            name: "Other",
            options: [
              { value: "claude-opus-5-5", name: "Claude Opus 5.5" },
              { value: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" },
              { value: "gpt-oss-120b-medium", name: "GPT-OSS 120B (Medium)" },
            ],
          },
        ]
      : [
          {
            group: "gemini",
            name: "Gemini",
            options: [
              { value: "gemini-4-carbon", name: "Gemini 4 Carbon" },
              { value: "gemini-4-hydrogen", name: "Gemini 4 Hydrogen" },
              { value: "gemini-4-neon", name: "Gemini 4 Neon" },
              { value: "gemini-3-flash", name: "Gemini 3 Flash" },
              { value: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite" },
              { value: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite" },
            ],
          },
          {
            group: "claude",
            name: "Claude",
            options: [{ value: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" }],
          },
        ];

  const opts = [
    {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: modelId,
      options: modelOptions,
    },
    {
      id: "mode",
      name: "Mode",
      category: "mode",
      type: "select",
      currentValue: modeId,
      options: [
        { value: "default", name: "Default" },
        { value: "auto", name: "Auto" },
        { value: "plan", name: "Plan" },
      ],
    },
  ];

  if (thoughts.length > 0) {
    opts.push({
      id: "thought_level",
      name: "Thinking Effort",
      category: "thought_level",
      type: "select",
      currentValue: selectedThought,
      options: thoughts.map((lvl) => ({ value: lvl, name: lvl.toUpperCase() })),
    });
  }

  return opts;
}

function ensureSessionDb(sessionId) {
  mkdirSync(conversationsDir, { recursive: true });
  const dbPath = join(conversationsDir, `${sessionId}.db`);
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS steps (
      idx INTEGER PRIMARY KEY,
      step_type INTEGER NOT NULL,
      status INTEGER DEFAULT 0,
      step_payload BLOB,
      error_details BLOB
    );
  `);
  db.close();
  return dbPath;
}

function appendDbStep(dbPath, stepType, payload, errorDetails) {
  const db = new DatabaseSync(dbPath);
  try {
    const row = db.prepare("SELECT COALESCE(MAX(idx), -1) AS m FROM steps").get();
    const nextIdx = Number(row?.m ?? -1) + 1;
    db.prepare(
      "INSERT INTO steps (idx, step_type, status, step_payload, error_details) VALUES (?, ?, 1, ?, ?)",
    ).run(
      nextIdx,
      stepType,
      payload ? Buffer.from(payload) : null,
      errorDetails ? Buffer.from(errorDetails) : null,
    );
    return nextIdx;
  } finally {
    db.close();
  }
}

class McpClientConnection {
  constructor(serverCfg) {
    this.serverCfg = serverCfg;
    this.nextId = 1;
    this.pending = new Map();
    this.child = undefined;
    this.buf = "";
  }

  async connect() {
    if (this.serverCfg.type === "http") {
      await this.rpc("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "mock-agy", version: "1.5.8" },
      });
      return;
    }

    const childEnv = { ...process.env };
    for (const entry of this.serverCfg.env || []) {
      childEnv[entry.name] = entry.value;
    }
    this.child = spawn(this.serverCfg.command, this.serverCfg.args || [], {
      env: childEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => {
      this.buf += chunk;
      let nl;
      while ((nl = this.buf.indexOf("\n")) !== -1) {
        const line = this.buf.slice(0, nl).trim();
        this.buf = this.buf.slice(nl + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          const waiter = this.pending.get(msg.id);
          if (waiter) {
            this.pending.delete(msg.id);
            if (msg.error) waiter.reject(new Error(msg.error.message));
            else waiter.resolve(msg.result);
          }
        } catch {}
      }
    });

    await this.rpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "mock-agy", version: "1.5.8" },
    });
  }

  async rpc(method, params) {
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });

    if (this.serverCfg.type === "http") {
      const headers = { "Content-Type": "application/json" };
      for (const h of this.serverCfg.headers || []) {
        headers[h.name] = h.value;
      }
      const res = await fetch(this.serverCfg.url, {
        method: "POST",
        headers,
        body: payload,
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      return json.result;
    }

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(`${payload}\n`);
    });
  }

  close() {
    if (this.child) {
      try {
        this.child.stdin.end();
        this.child.kill("SIGTERM");
      } catch {}
      this.child = undefined;
    }
  }
}

async function handleRpcRequest(id, method, params = {}) {
  if (method === "initialize") {
    sendResult(id, {
      protocolVersion: 1,
      agentInfo: { name: "agy", version: "1.5.8" },
      authMethods: [{ id: "google-login", name: "Sign in with Google" }],
      agentCapabilities: {
        loadSession: true,
        promptCapabilities: { image: true, embeddedContext: true },
        sessionCapabilities: {
          resume: {},
          close: {},
          load: {},
          list: {},
          additionalDirectories: {},
        },
        ...(process.env.MOCK_AGY_HTTP_MCP === "1"
          ? { mcpCapabilities: { http: true } }
          : {}),
        _meta: {
          antigravity: {
            tier: true,
            systemPrompt: { append: true },
          },
        },
      },
    });
    return;
  }

  if (method === "session/new" || method === "session/resume") {
    const authMode = process.env.MOCK_AGY_AUTH_MODE || "";
    if (authMode === "rpc_32000") {
      sendError(id, -32000, "Authentication required");
      return;
    }
    if (authMode === "headless_32603") {
      sendError(
        id,
        -32603,
        "Internal error: No browser is available in this environment. Run `agy acp --login` to authenticate.",
      );
      return;
    }

    const isResume = method === "session/resume";
    const sessionId = isResume ? params.sessionId : `ses_${randomUUID().slice(0, 12)}`;
    const dbPath = ensureSessionDb(sessionId);

    let mcpClient;
    if (Array.isArray(params.mcpServers) && params.mcpServers.length > 0) {
      mcpClient = new McpClientConnection(params.mcpServers[0]);
      await mcpClient.connect();
    }

    const prev = sessions.get(sessionId);
    const modelId = prev?.modelId || "gemini-4-carbon";
    const thoughtLevel = prev?.thoughtLevel || "medium";
    const modeId = prev?.modeId || "default";
    const systemAppend = params?._meta?.antigravity?.systemPrompt?.append || "";
    const disableBuiltInTools = Boolean(params?._meta?.disableBuiltInTools);

    const session = {
      sessionId,
      dbPath,
      mcpClient,
      modelId,
      thoughtLevel,
      modeId,
      systemAppend,
      disableBuiltInTools,
      wasResumed: isResume,
      turnCount: prev?.turnCount ?? 0,
      cancelled: false,
      cancelWakeup: undefined,
    };
    sessions.set(sessionId, session);

    const configOptions = buildConfigOptionsForModel(modelId, thoughtLevel, modeId);
    const legacyModelsBlock =
      process.env.MOCK_AGY_158_CATALOG === "1"
        ? {
            models: {
              currentModelId: `${modelId}-${thoughtLevel || "medium"}`,
              availableModels: [
                { modelId: "gemini-4-carbon", name: "Gemini 4 Carbon" },
                { modelId: "gemini-4-carbon-low", name: "Gemini 4 Carbon (Low)" },
                { modelId: "gemini-4-carbon-medium", name: "Gemini 4 Carbon (Medium)" },
                { modelId: "gemini-4-carbon-high", name: "Gemini 4 Carbon (High)" },
                { modelId: "gemini-4-argon", name: "Gemini 4 Argon" },
                { modelId: "gemini-4-argon-low", name: "Gemini 4 Argon (Low)" },
                { modelId: "gemini-4-argon-medium", name: "Gemini 4 Argon (Medium)" },
                { modelId: "gemini-4-argon-high", name: "Gemini 4 Argon (High)" },
                { modelId: "gemini-4-hydrogen", name: "Gemini 4 Hydrogen" },
                { modelId: "gemini-4-hydrogen-low", name: "Gemini 4 Hydrogen (Low)" },
                { modelId: "gemini-4-hydrogen-medium", name: "Gemini 4 Hydrogen (Medium)" },
                { modelId: "gemini-4-hydrogen-high", name: "Gemini 4 Hydrogen (High)" },
                { modelId: "gemini-4-hydrogen-xhigh", name: "Gemini 4 Hydrogen (XHigh)" },
                { modelId: "gemini-pro-orchestrator", name: "Gemini Pro Orchestrator" },
                { modelId: "gemini-pro-orchestrator-argon", name: "Gemini Pro Orchestrator Argon" },
                { modelId: "gemini-3.8-flash", name: "Gemini 3.8 Flash" },
                { modelId: "gemini-3.8-flash-low", name: "Gemini 3.8 Flash (Low)" },
                { modelId: "gemini-3.8-flash-medium", name: "Gemini 3.8 Flash (Medium)" },
                { modelId: "gemini-3.8-flash-high", name: "Gemini 3.8 Flash (High)" },
                { modelId: "claude-opus-5-5", name: "Claude Opus 5.5" },
                { modelId: "claude-opus-5-5-low", name: "Claude Opus 5.5 (Low)" },
                { modelId: "claude-opus-5-5-medium", name: "Claude Opus 5.5 (Medium)" },
                { modelId: "claude-opus-5-5-high", name: "Claude Opus 5.5 (High)" },
                { modelId: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" },
                { modelId: "claude-sonnet-5-5-low", name: "Claude Sonnet 5.5 (Low)" },
                { modelId: "claude-sonnet-5-5-medium", name: "Claude Sonnet 5.5 (Medium)" },
                { modelId: "claude-sonnet-5-5-high", name: "Claude Sonnet 5.5 (High)" },
                { modelId: "gpt-oss-120b-medium", name: "GPT-OSS 120B (Medium)" },
              ],
            },
          }
        : {};
    sendResult(id, {
      sessionId,
      configOptions,
      ...legacyModelsBlock,
      modes: {
        currentModeId: modeId,
        availableModes: [
          { id: "default", name: "Default" },
          { id: "auto", name: "Auto" },
          { id: "plan", name: "Plan" },
        ],
      },
    });
    return;
  }

  if (method === "session/set_config_option") {
    setConfigCallCount += 1;
    const session = sessions.get(params.sessionId);
    if (!session) {
      sendError(id, -32602, "Session not found");
      return;
    }
    if (params.configId === "model") {
      session.modelId = String(params.value);
      const validThoughts = MODEL_THOUGHT_MAP[session.modelId] ?? [];
      if (!validThoughts.includes(session.thoughtLevel)) {
        session.thoughtLevel = validThoughts[0] || "";
      }
    } else if (params.configId === "thought_level") {
      session.thoughtLevel = String(params.value);
    } else if (params.configId === "mode") {
      session.modeId = String(params.value);
    }

    const fullOptions = buildConfigOptionsForModel(
      session.modelId,
      session.thoughtLevel,
      session.modeId,
    );

    // Emit partial config_option_update notification (`#28433` test coverage) when setting thought_level
    if (params.configId === "thought_level") {
      const onlyThought = fullOptions.filter((o) => o.id === "thought_level");
      sendSessionUpdate(session.sessionId, {
        sessionUpdate: "config_option_update",
        configOptions: onlyThought,
      });
    }

    sendResult(id, { configOptions: fullOptions });
    return;
  }

  if (method === "session/set_mode") {
    const session = sessions.get(params.sessionId);
    if (!session) {
      sendError(id, -32602, "Session not found");
      return;
    }
    const allowed = new Set(["default", "auto", "plan"]);
    if (!allowed.has(params.modeId)) {
      sendError(id, -32602, `Unsupported mode: ${params.modeId}`);
      return;
    }
    session.modeId = params.modeId;
    sendSessionUpdate(session.sessionId, {
      sessionUpdate: "current_mode_update",
      currentModeId: session.modeId,
    });
    sendResult(id, {});
    return;
  }

  if (method === "session/close") {
    const session = sessions.get(params.sessionId);
    if (session) {
      session.mcpClient?.close();
      sessions.delete(params.sessionId);
    }
    sendResult(id, {});
    return;
  }

  if (method === "session/prompt") {
    const session = sessions.get(params.sessionId);
    if (!session) {
      sendError(id, -32602, "Session not found");
      return;
    }
    session.cancelled = false;
    session.turnCount += 1;

    const promptText = (params.prompt || [])
      .map((b) => {
        if (b.type === "text") return b.text;
        if (b.type === "image") return `[IMAGE:${b.mimeType}]`;
        if (b.type === "resource") return `[RESOURCE:${b.resource?.mimeType}]`;
        return `[BLOCK:${b.type}]`;
      })
      .join("\n");

    // Scenario: echo env & CLI args for hygiene verification
    if (promptText.includes("[SCENARIO:echo_env]")) {
      appendDbStep(session.dbPath, 1, "ok", null);
      sendSessionUpdate(session.sessionId, {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: JSON.stringify({
            argv,
            GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? null,
            GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ?? null,
            AGY_CLI_AUTO_COMPACT_OVERRIDE:
              process.env.AGY_CLI_AUTO_COMPACT_OVERRIDE ?? null,
            AGY_ADC_AUTH: process.env.AGY_ADC_AUTH ?? null,
            GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT ?? null,
          }),
        },
      });
      sendResult(id, {
        stopReason: "end_turn",
        usage: { inputTokens: 10, outputTokens: 20 },
      });
      return;
    }

    // Scenario: silent 502 Bad Gateway hang (`#33596`)
    if (promptText.includes("[SCENARIO:silent_502_hang]")) {
      appendDbStep(
        session.dbPath,
        17,
        null,
        JSON.stringify({
          error: { code: 502, message: "HTTP 502 Bad Gateway from Cloud Code upstream" },
        }),
      );
      await new Promise((resolve) => {
        session.cancelWakeup = resolve;
      });
      sendResult(id, { stopReason: "cancelled" });
      return;
    }

    // Scenario: swallowed 429 empty turn
    if (promptText.includes("[SCENARIO:swallowed_429]")) {
      appendDbStep(
        session.dbPath,
        17,
        null,
        JSON.stringify({
          error: {
            code: 429,
            message: "RESOURCE_EXHAUSTED: Model capacity exhausted",
            quotaResetTimeStamp: "2099-01-01T00:00:05Z",
            retryDelay: "2s",
          },
        }),
      );
      sendResult(id, { stopReason: "end_turn" });
      return;
    }

    // Scenario: transient mid-turn 429 superseded by later step (`idx > errorIdx`)
    if (promptText.includes("[SCENARIO:superseded_429_then_ok]")) {
      appendDbStep(
        session.dbPath,
        17,
        null,
        JSON.stringify({ error: { code: 429, message: "Transient 429" } }),
      );
      appendDbStep(session.dbPath, 1, "recovered", null);
      sendSessionUpdate(session.sessionId, {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Recovered cleanly after internal retry." },
      });
      sendResult(id, {
        stopReason: "end_turn",
        usage: { inputTokens: 25, outputTokens: 12 },
      });
      return;
    }

    // Scenario: Claude 400 Invalid signature on resumed session (`#28889`)
    if (promptText.includes("[SCENARIO:invalid_signature_on_resume]")) {
      if (session.wasResumed) {
        appendDbStep(
          session.dbPath,
          17,
          null,
          JSON.stringify({
            error: {
              code: 400,
              message: "INVALID_ARGUMENT: Invalid signature in thinking block",
            },
          }),
        );
        sendResult(id, { stopReason: "end_turn" });
        return;
      }
      appendDbStep(session.dbPath, 1, "fresh_recovered", null);
      const hasCheckpoint = promptText.includes("<conversation-checkpoint>");
      sendSessionUpdate(session.sessionId, {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: `Recovered via fresh session (hasCheckpoint=${hasCheckpoint})`,
        },
      });
      sendResult(id, {
        stopReason: "end_turn",
        usage: { inputTokens: 40, outputTokens: 18 },
      });
      return;
    }

    // Scenario: WebSearch via built-in `search_web`
    if (
      !promptText.includes("[SCENARIO:slow_streaming_cancel]") &&
      (promptText.includes("Use the search_web tool") ||
        promptText.includes("[SCENARIO:websearch]"))
    ) {
      if (
        process.env.MOCK_AGY_WEBSEARCH_429_FIRST === "1" &&
        !websearch429Triggered &&
        (session.modelId === "gemini-3-flash" || session.modelId === "gemini-3.8-flash")
      ) {
        websearch429Triggered = true;
        appendDbStep(
          session.dbPath,
          17,
          null,
          JSON.stringify({
            error: { code: 429, message: `429 Quota exhausted on ${session.modelId}` },
          }),
        );
        sendResult(id, { stopReason: "end_turn" });
        return;
      }

      // First attempt a forbidden `run_command` to verify `v2-websearch` rejects it!
      const shellPerm = await requestClient("session/request_permission", {
        sessionId: session.sessionId,
        toolCall: {
          toolCallId: "ws_shell_1",
          title: "run_command",
          kind: "execute",
          rawInput: { command: "whoami" },
        },
        options: [
          { optionId: "allow_once", name: "Allow", kind: "allow_once" },
          { optionId: "reject_once", name: "Reject", kind: "reject_once" },
        ],
      });

      if (shellPerm?.outcome?.optionId === "allow_once") {
        sendSessionUpdate(session.sessionId, {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "SECURITY_VIOLATION_SHELL_ALLOWED" },
        });
        sendResult(id, { stopReason: "end_turn" });
        return;
      }

      // Now request `search_web` which MUST be approved
      const searchPerm = await requestClient("session/request_permission", {
        sessionId: session.sessionId,
        toolCall: {
          toolCallId: "ws_search_1",
          title: "search_web",
          kind: "search",
          rawInput: { query: promptText },
        },
        options: [
          { optionId: "allow_once", name: "Allow", kind: "allow_once" },
          { optionId: "reject_once", name: "Reject", kind: "reject_once" },
        ],
      });

      if (searchPerm?.outcome?.optionId !== "allow_once") {
        sendError(id, -32603, "search_web was unexpectedly denied");
        return;
      }

      sendSessionUpdate(session.sessionId, {
        sessionUpdate: "tool_call_update",
        toolCallId: "ws_search_1",
        title: "search_web",
        kind: "search",
        status: "completed",
        rawOutput: {
          results: [
            {
              url: "https://opencode.ai/docs/acp",
              title: "OpenCode ACP Docs",
              snippet: "OpenCode v2 supports Antigravity ACP natively.",
            },
          ],
        },
      });

      appendDbStep(session.dbPath, 1, "websearch_ok", null);
      sendSessionUpdate(session.sessionId, {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: JSON.stringify({
            summary: `Grounded answer from ${session.modelId} (thought=${session.thoughtLevel},promptHasDomain=${promptText.includes("Prioritize authoritative results from domain:")})`,
            sources: [
              {
                url: "https://opencode.ai/docs/acp",
                title: "OpenCode ACP Docs",
                snippet: "OpenCode v2 supports Antigravity ACP natively.",
              },
              {
                url: "https://antigravity.google/cli",
                title: "Antigravity CLI",
                snippet: "Official agy acp documentation.",
              },
            ],
          }),
        },
      });
      sendResult(id, {
        stopReason: "end_turn",
        usage: { inputTokens: 30, outputTokens: 50 },
      });
      return;
    }

    // Scenario: Stateless `LLM.generateObject` forced MCP tool call
    if (promptText.includes("[SCENARIO:generate_object]")) {
      if (!session.mcpClient) {
        sendError(id, -32603, "Missing MCP client on stateless generate_object session");
        return;
      }
      const listRes = await session.mcpClient.rpc("tools/list", {});
      const toolNames = (listRes.tools || []).map((t) => t.name);
      const genTool = (listRes.tools || []).find((t) => t.name === "generate_object");
      if (!genTool) {
        sendError(id, -32603, `Expected generate_object tool, got [${toolNames.join(",")}]`);
        return;
      }
      await session.mcpClient.rpc("tools/call", {
        name: genTool.name,
        arguments: {
          title: "ACP Migration Verified",
          hasForcedDirective: session.systemAppend.includes('invoke the tool "generate_object"'),
          exposedToolCount: toolNames.length,
        },
      });
      sendResult(id, { stopReason: "end_turn" });
      return;
    }

    // Scenario: Echo MCP tools + built-in tool state + setConfigCallCount
    if (promptText.includes("[SCENARIO:echo_mcp_tools]")) {
      let mcpTools = [];
      if (session.mcpClient) {
        const listRes = await session.mcpClient.rpc("tools/list", {});
        mcpTools = (listRes.tools || []).map((t) => t.name);
      }
      sendSessionUpdate(session.sessionId, {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: JSON.stringify({
            mcpTools,
            disableBuiltInTools: session.disableBuiltInTools,
            systemAppend: session.systemAppend,
            wasResumed: session.wasResumed,
            setConfigCallCount,
            cancelledSessionCount,
            argv,
          }),
        },
      });
      sendResult(id, { stopReason: "end_turn" });
      return;
    }

    // Scenario: Slow streaming turn that waits for `session/cancel` and emits a late post-cancel chunk
    if (promptText.includes("[SCENARIO:slow_streaming_cancel]")) {
      sendSessionUpdate(session.sessionId, {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "first_stream_chunk" },
      });
      await new Promise((resolve) => {
        session.cancelWakeup = resolve;
      });
      // Emit a late racing chunk after cancellation to exercise closed-controller guards
      sendSessionUpdate(session.sessionId, {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "late_chunk_after_cancel" },
      });
      sendResult(id, { stopReason: "cancelled" });
      return;
    }

    // Scenario: Multi-byte UTF-8 frame split across separate stdout byte chunks
    if (promptText.includes("[SCENARIO:split_utf8_stream]")) {
      const frameJson =
        JSON.stringify({
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId: session.sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: {
                type: "text",
                text: "UTF8_OK: 🚀─日本語─äöü─🎉",
              },
            },
          },
        }) + "\n";
      const fullBuf = Buffer.from(frameJson, "utf8");
      // Split right inside the 4-byte rocket emoji `🚀` (0xF0 0x9F 0x9A 0x80) and 3-byte `日`
      const rocketIdx = fullBuf.indexOf(Buffer.from("🚀", "utf8"));
      const kanjiIdx = fullBuf.indexOf(Buffer.from("日", "utf8"));
      process.stdout.write(fullBuf.subarray(0, rocketIdx + 2));
      await new Promise((r) => setTimeout(r, 8));
      process.stdout.write(fullBuf.subarray(rocketIdx + 2, kanjiIdx + 1));
      await new Promise((r) => setTimeout(r, 8));
      process.stdout.write(fullBuf.subarray(kanjiIdx + 1));
      sendResult(id, { stopReason: "end_turn" });
      return;
    }

    // Scenario: Mid-stream abort during 25ms MCP batch coalescer + late straggler `tools/call`
    if (promptText.includes("[SCENARIO:abort_race_parallel_mcp]")) {
      const firstCall = session.mcpClient.rpc("tools/call", {
        name: "alpha",
        arguments: { key: "first" },
      });
      // Straggler arrives 25ms later (after client aborts at ~8ms)
      await new Promise((r) => setTimeout(r, 25));
      const stragglerCall = session.mcpClient.rpc("tools/call", {
        name: "beta",
        arguments: { key: "straggler" },
      });
      await Promise.allSettled([firstCall, stragglerCall]);
      sendResult(id, { stopReason: "cancelled" });
      return;
    }

    // Scenario: Single OpenCode MCP tool call (`providerExecuted: false`, `#36138`, `#36144`)
    if (promptText.includes("[SCENARIO:single_mcp_tool]")) {
      if (!session.mcpClient) {
        sendError(id, -32603, "Missing MCP client");
        return;
      }
      const listRes = await session.mcpClient.rpc("tools/list", {});
      const firstTool = listRes.tools?.[0];
      if (!firstTool) {
        sendError(id, -32603, "No tools exposed by OpenCode MCP bridge");
        return;
      }

      // Request permission for mcp_opencode_<tool>
      await requestClient("session/request_permission", {
        sessionId: session.sessionId,
        toolCall: {
          toolCallId: "acp_mcp_1",
          title: `Run mcp_opencode_${firstTool.name}`,
          kind: "other",
        },
        options: [
          { optionId: "allow_once", name: "Allow", kind: "allow_once" },
          { optionId: "reject_once", name: "Reject", kind: "reject_once" },
        ],
      });

      sendSessionUpdate(session.sessionId, {
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: "Calling OpenCode tool..." },
      });

      // Inject `toolSummary` (`#36138`) to verify `mcp-bridge` strips it!
      const toolRes = await session.mcpClient.rpc("tools/call", {
        name: firstTool.name,
        arguments: {
          path: "README.md",
          toolSummary: "Injected summary that should be stripped",
        },
      });

      appendDbStep(session.dbPath, 1, "mcp_tool_done", null);
      const blockTypes = (toolRes.content || []).map((b) => b.type).join(",");
      const firstText =
        (toolRes.content || []).find((b) => b.type === "text")?.text ?? "";
      sendSessionUpdate(session.sessionId, {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: `Tool completed: blocks=[${blockTypes}] text=${firstText}`,
        },
      });
      sendResult(id, {
        stopReason: "end_turn",
        usage: { inputTokens: 80, outputTokens: 35, thoughtTokens: 10 },
      });
      return;
    }

    // Scenario: Parallel OpenCode MCP tool calls
    if (promptText.includes("[SCENARIO:parallel_mcp_tools]")) {
      const [resA, resB] = await Promise.all([
        session.mcpClient.rpc("tools/call", {
          name: "alpha",
          arguments: { key: "A", toolSummary: "Alpha call" },
        }),
        session.mcpClient.rpc("tools/call", {
          name: "beta",
          arguments: { key: "B", toolSummary: "Beta call" },
        }),
      ]);

      appendDbStep(session.dbPath, 1, "parallel_done", null);
      const textA = resA.content?.[0]?.text ?? "";
      const textB = resB.content?.[0]?.text ?? "";
      sendSessionUpdate(session.sessionId, {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: `Parallel results: A=${textA}, B=${textB}`,
        },
      });
      sendResult(id, {
        stopReason: "end_turn",
        usage: { inputTokens: 60, outputTokens: 30 },
      });
      return;
    }

    // Scenario: `"hybrid"` mode native tools (`ctx.permission.assert`, `#36138` rawOutput synthesis, `#28450` unsettled settlement)
    if (promptText.includes("[SCENARIO:hybrid_native_tools]")) {
      const permShell = await requestClient("session/request_permission", {
        sessionId: session.sessionId,
        toolCall: {
          toolCallId: "native_cmd_1",
          title: "run_command",
          kind: "execute",
          rawInput: { CommandLine: "echo hybrid" },
        },
        options: [
          { optionId: "allow_once", name: "Allow", kind: "allow_once" },
          { optionId: "reject_once", name: "Reject", kind: "reject_once" },
        ],
      });

      const shellAllowed = permShell?.outcome?.optionId === "allow_once";

      // Emit native diff tool with `rawOutput: undefined` (`#36138`)
      sendSessionUpdate(session.sessionId, {
        sessionUpdate: "tool_call",
        toolCallId: "native_edit_1",
        title: "edit_file",
        kind: "edit",
        status: "in_progress",
        rawInput: { path: "src/demo.ts" },
      });
      sendSessionUpdate(session.sessionId, {
        sessionUpdate: "tool_call_update",
        toolCallId: "native_edit_1",
        title: "edit_file",
        kind: "edit",
        status: "completed",
        content: [
          {
            type: "diff",
            path: "src/demo.ts",
            oldText: "const a = 1;",
            newText: "const a = 2;",
          },
        ],
      });

      // Emit unsettled native tool that never sends `completed` (`#28450`)
      sendSessionUpdate(session.sessionId, {
        sessionUpdate: "tool_call",
        toolCallId: "native_unsettled_1",
        title: "view_file",
        kind: "read",
        status: "in_progress",
        rawInput: { path: "README.md" },
        locations: [{ path: "README.md", line: 1 }],
      });

      appendDbStep(session.dbPath, 1, "hybrid_done", null);
      sendSessionUpdate(session.sessionId, {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: `Hybrid finished (shellAllowed=${shellAllowed})`,
        },
      });
      sendResult(id, {
        stopReason: "end_turn",
        usage: { inputTokens: 50, outputTokens: 25 },
      });
      return;
    }

    // Scenario: crash worker shortly after completing Turn 1 (`#36181`)
    const shouldCrashAfter = promptText.includes("[SCENARIO:crash_after_turn_1]");

    appendDbStep(session.dbPath, 1, "normal_ok", null);
    sendSessionUpdate(session.sessionId, {
      sessionUpdate: "agent_thought_chunk",
      content: { type: "text", text: `Thinking on ${session.modelId}...` },
    });
    sendSessionUpdate(session.sessionId, {
      sessionUpdate: "agent_message_chunk",
      content: {
        type: "text",
        text: `Reply(model=${session.modelId},thought=${session.thoughtLevel},mode=${session.modeId},resumed=${session.wasResumed},turn=${session.turnCount},sys=${session.systemAppend},prompt=${JSON.stringify(promptText)})`,
      },
    });
    sendResult(id, {
      stopReason: "end_turn",
      usage: {
        inputTokens: 100,
        outputTokens: 40,
        cachedReadTokens: 25,
        thoughtTokens: 12,
      },
    });

    if (shouldCrashAfter) {
      setTimeout(() => {
        process.exit(1);
      }, 25);
    }
    return;
  }

  sendError(id, -32601, `Unknown method: ${method}`);
}

function handleNotification(method, params = {}) {
  if (method === "session/cancel") {
    cancelledSessionCount += 1;
    const session = sessions.get(params.sessionId);
    if (session) {
      session.cancelled = true;
      session.cancelWakeup?.();
    }
  }
}

let stdinBuf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  stdinBuf += chunk;
  let nl;
  while ((nl = stdinBuf.indexOf("\n")) !== -1) {
    const line = stdinBuf.slice(0, nl).trim();
    stdinBuf = stdinBuf.slice(nl + 1);
    if (!line) continue;
    let frame;
    try {
      frame = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof frame.method === "string" && frame.id !== undefined && frame.id !== null) {
      void handleRpcRequest(frame.id, frame.method, frame.params);
    } else if (typeof frame.method === "string") {
      handleNotification(frame.method, frame.params);
    } else if (frame.id !== undefined && frame.id !== null) {
      const pending = pendingClientRpcs.get(frame.id);
      if (pending) {
        pendingClientRpcs.delete(frame.id);
        if (frame.error) pending.reject(new Error(frame.error.message));
        else pending.resolve(frame.result);
      }
    }
  }
});
