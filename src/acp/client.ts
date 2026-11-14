import { spawn, type ChildProcessByStdio } from "node:child_process";
import { accessSync, constants as fsConstants, existsSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import type { Readable, Writable } from "node:stream";
import {
  AGY_DEFAULT_APP_DATA_DIR,
  AGY_DEFAULT_BINARY,
  AGY_ISOLATED_APP_DATA_DIR,
} from "../constants";
import {
  AcpRpcError,
  type AcpInitializeParams,
  type AcpInitializeResult,
  type AcpNewSessionParams,
  type AcpPromptParams,
  type AcpPromptResult,
  type AcpRequestPermissionParams,
  type AcpRequestPermissionResult,
  type AcpResumeSessionParams,
  type AcpSessionNotification,
  type AcpSessionSetupResult,
  type AcpSetConfigOptionResult,
  type JsonRpcErrorObject,
} from "./types";

const STRIPPED_AMBIENT_ENV_KEYS = [
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_CLOUD_PROJECT",
  "GOOGLE_CLOUD_PROJECT_ID",
  "GOOGLE_CLOUD_LOCATION",
  "GEMINI_HOME",
  "AGY_ACP_CCPA_PROJECT",
  "ANTIGRAVITY_HARNESS_PATH",
  "ELECTRON_RUN_AS_NODE",
] as const;

const MAX_STDERR_TAIL_CHARS = 8192;
const DEFAULT_RPC_TIMEOUT_MS = 60_000;
const DEFAULT_POOL_IDLE_MS = 5 * 60_000;

export interface AgySpawnConfig {
  readonly binaryPath?: string;
  readonly geminiDir?: string;
  readonly appDataDir?: string;
  readonly adcAuth?: boolean;
  readonly projectId?: string;
  readonly autoCompactOverride?: string;
  readonly includeDefaultCustomizations?: boolean;
  readonly extraArgs?: ReadonlyArray<string>;
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly clientVersion?: string;
}

export function validateRelativeAppDataDir(appDataDir: string): string {
  const trimmed = appDataDir.trim();
  if (
    !trimmed ||
    trimmed === "." ||
    trimmed === ".." ||
    isAbsolute(trimmed) ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    /^[a-zA-Z]:/.test(trimmed)
  ) {
    throw new Error(
      `Invalid Antigravity --app-data-dir "${appDataDir}": must be a single relative directory name, never an absolute or nested path.`,
    );
  }
  return trimmed;
}

function isExecutableFile(candidate: string): boolean {
  try {
    const st = statSync(candidate);
    if (!st.isFile() && !st.isSymbolicLink()) return false;
    accessSync(
      candidate,
      process.platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves the `agy` binary path without calling `realpath()`, preserving shim `argv[0]`
 * for version managers (`mise`, `aqua`, `volta`).
 */
export function resolveAgyBinaryPath(options?: {
  binaryPath?: string;
  env?: NodeJS.ProcessEnv;
}): string | undefined {
  const env = options?.env ?? process.env;
  const explicit = options?.binaryPath?.trim() || env.OPENCODE_AGY_PATH?.trim();
  if (explicit) {
    if (explicit.startsWith("~/") || explicit.startsWith("~\\")) {
      const expanded = join(homedir(), explicit.slice(2));
      return isExecutableFile(expanded) ? expanded : undefined;
    }
    if (explicit.includes("/") || explicit.includes("\\") || isAbsolute(explicit)) {
      const absCandidate = isAbsolute(explicit) ? explicit : resolve(explicit);
      return isExecutableFile(absCandidate) ? absCandidate : undefined;
    }
    return findOnPath(explicit, env);
  }

  return findOnPath(AGY_DEFAULT_BINARY, env);
}

function findOnPath(binaryName: string, env: NodeJS.ProcessEnv): string | undefined {
  const pathVar = env.PATH ?? env.Path ?? "";
  const searchDirs = pathVar.split(delimiter).filter(Boolean);

  if (process.platform !== "win32") {
    const localBin = join(homedir(), ".local", "bin");
    if (!searchDirs.includes(localBin)) {
      searchDirs.push(localBin);
    }
  }

  const extensions =
    process.platform === "win32"
      ? (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM")
          .split(";")
          .filter(Boolean)
      : [""];

  for (const dir of searchDirs) {
    for (const ext of extensions) {
      const candidate =
        ext && !binaryName.toLowerCase().endsWith(ext.toLowerCase())
          ? join(dir, `${binaryName}${ext}`)
          : join(dir, binaryName);
      if (isExecutableFile(candidate)) {
        return candidate;
      }
    }
    if (process.platform === "win32" && isExecutableFile(join(dir, binaryName))) {
      return join(dir, binaryName);
    }
  }

  return undefined;
}

export function buildSanitizedAgyEnv(config?: AgySpawnConfig): NodeJS.ProcessEnv {
  const sourceEnv = config?.env ?? process.env;
  const env: NodeJS.ProcessEnv = { ...sourceEnv };

  const adcEnabled =
    config?.adcAuth === true ||
    sourceEnv.AGY_ADC_AUTH?.trim().toLowerCase() === "true" ||
    sourceEnv.AGY_ADC_AUTH?.trim() === "1";

  const savedLocation = sourceEnv.GOOGLE_CLOUD_LOCATION;

  for (const key of STRIPPED_AMBIENT_ENV_KEYS) {
    delete env[key];
  }

  const autoCompact =
    config?.autoCompactOverride?.trim() ||
    sourceEnv.AGY_CLI_AUTO_COMPACT_OVERRIDE?.trim() ||
    "off";
  env.AGY_CLI_AUTO_COMPACT_OVERRIDE = autoCompact;

  if (adcEnabled) {
    env.AGY_ADC_AUTH = "true";
    if (savedLocation?.trim()) {
      env.GOOGLE_CLOUD_LOCATION = savedLocation.trim();
    }
  }

  const explicitProject =
    config?.projectId?.trim() || sourceEnv.OPENCODE_AGY_PROJECT_ID?.trim();
  if (explicitProject) {
    env.GOOGLE_CLOUD_PROJECT = explicitProject;
    env.AGY_ACP_CCPA_PROJECT = explicitProject;
  }

  return env;
}

export function expandHomePath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (trimmed === "~") {
    return homedir();
  }
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return join(homedir(), trimmed.slice(2));
  }
  return trimmed;
}

export function resolveEffectiveGeminiDir(config?: {
  geminiDir?: string;
  env?: NodeJS.ProcessEnv;
}): string | undefined {
  const env = config?.env ?? process.env;
  const raw = config?.geminiDir?.trim() || env.OPENCODE_AGY_GEMINI_DIR?.trim();
  return raw ? expandHomePath(raw) : undefined;
}

export function buildAgyAcpArgs(config?: AgySpawnConfig): string[] {
  const args = ["acp", "--disable-telemetry"];

  if (config?.includeDefaultCustomizations === false) {
    args.push("--include-default-customizations=false");
  }

  const geminiDir = resolveEffectiveGeminiDir(config);
  if (geminiDir) {
    const appDataDir = validateRelativeAppDataDir(
      config?.appDataDir ?? AGY_ISOLATED_APP_DATA_DIR,
    );
    args.push("--gemini-dir", geminiDir, "--app-data-dir", appDataDir);
  } else if (config?.appDataDir) {
    const appDataDir = validateRelativeAppDataDir(config.appDataDir);
    args.push("--app-data-dir", appDataDir);
  }

  if (config?.extraArgs?.length) {
    args.push(...config.extraArgs);
  }

  return args;
}

export function resolveConversationsDir(config?: {
  geminiDir?: string;
  appDataDir?: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const geminiDir = resolveEffectiveGeminiDir(config);
  if (geminiDir) {
    const appDataDir = validateRelativeAppDataDir(
      config?.appDataDir ?? AGY_ISOLATED_APP_DATA_DIR,
    );
    return join(geminiDir, appDataDir, "conversations");
  }
  const appDataDir = config?.appDataDir
    ? validateRelativeAppDataDir(config.appDataDir)
    : AGY_DEFAULT_APP_DATA_DIR;
  return join(homedir(), ".gemini", appDataDir, "conversations");
}

export function resolveSessionDbPath(
  sessionId: string,
  config?: { geminiDir?: string; appDataDir?: string; env?: NodeJS.ProcessEnv },
): string {
  return join(resolveConversationsDir(config), `${sessionId}.db`);
}

export function cleanupSessionDbFiles(
  sessionId: string,
  config?: { geminiDir?: string; appDataDir?: string; env?: NodeJS.ProcessEnv },
): void {
  if (!sessionId || sessionId.includes("/") || sessionId.includes("\\")) return;
  const base = resolveSessionDbPath(sessionId, config);
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const target = `${base}${suffix}`;
    try {
      if (existsSync(target)) {
        rmSync(target, { force: true });
      }
    } catch {
      // Best-effort cleanup of temporary conversation DB artifacts
    }
  }
}

export type SessionUpdateListener = (notification: AcpSessionNotification) => void;
export type PermissionRequestHandler = (
  params: AcpRequestPermissionParams,
) => Promise<AcpRequestPermissionResult>;

interface PendingRpcCall {
  readonly method: string;
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
  readonly timer?: ReturnType<typeof setTimeout>;
  readonly cleanupAbort?: () => void;
}

export class AcpConnection {
  private readonly child: ChildProcessByStdio<Writable, Readable, Readable>;
  private readonly pending = new Map<number | string, PendingRpcCall>();
  private readonly sessionUpdateListeners = new Map<string, Set<SessionUpdateListener>>();
  private readonly globalUpdateListeners = new Set<SessionUpdateListener>();
  private readonly permissionHandlers = new Map<string, PermissionRequestHandler>();
  private readonly cancelledSessions = new Set<string>();
  private readonly inFlightPermissionResolvers = new Map<
    string,
    Set<(result: AcpRequestPermissionResult) => void>
  >();

  private nextId = 1;
  private stdoutBuffer = "";
  private stderrTail = "";
  private closed = false;
  private exitError: Error | undefined;
  private initPromise: Promise<AcpInitializeResult> | undefined;
  private initResultValue: AcpInitializeResult | undefined;

  constructor(
    readonly binaryPath: string,
    readonly args: ReadonlyArray<string>,
    readonly config: AgySpawnConfig = {},
  ) {
    const useShell =
      process.platform === "win32" && /\.(cmd|bat)$/i.test(binaryPath);

    this.child = spawn(binaryPath, [...args], {
      cwd: config.cwd ?? process.cwd(),
      env: buildSanitizedAgyEnv(config),
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
      shell: useShell,
    });

    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => {
      this.onStdoutData(chunk);
    });

    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk: string) => {
      this.appendStderr(chunk);
    });

    this.child.on("error", (err) => {
      this.failConnection(
        new Error(
          `Failed to spawn Antigravity ACP (${binaryPath}): ${err.message}${this.formatStderrSuffix()}`,
          { cause: err },
        ),
      );
    });

    this.child.on("close", (code, signal) => {
      const detail =
        signal !== null
          ? `killed by signal ${signal}`
          : `exited with code ${code ?? "unknown"}`;
      this.failConnection(
        new Error(
          `Antigravity ACP worker ${detail}${this.formatStderrSuffix()}`,
        ),
      );
    });
  }

  get alive(): boolean {
    return !this.closed && this.child.exitCode === null && !this.child.killed;
  }

  get initializeResult(): AcpInitializeResult | undefined {
    return this.initResultValue;
  }

  get stderr(): string {
    return this.stderrTail;
  }

  get pid(): number | undefined {
    return this.child.pid;
  }

  private appendStderr(text: string): void {
    if (!text) return;
    this.stderrTail = (this.stderrTail + text).slice(-MAX_STDERR_TAIL_CHARS);
  }

  private formatStderrSuffix(): string {
    const trimmed = this.stderrTail.trim();
    if (!trimmed) return "";
    const compact = trimmed.split("\n").slice(-6).join("\n").trim();
    return compact ? `\n${compact}` : "";
  }

  private failConnection(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.exitError = error;
    for (const [id, entry] of this.pending.entries()) {
      this.pending.delete(id);
      if (entry.timer) clearTimeout(entry.timer);
      entry.cleanupAbort?.();
      entry.reject(error);
    }
  }

  private onStdoutData(chunk: string): void {
    this.stdoutBuffer += chunk;
    let nlIndex: number;
    while ((nlIndex = this.stdoutBuffer.indexOf("\n")) !== -1) {
      const rawLine = this.stdoutBuffer.slice(0, nlIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(nlIndex + 1);
      if (!rawLine) continue;

      let frame: Record<string, unknown>;
      try {
        frame = JSON.parse(rawLine) as Record<string, unknown>;
      } catch {
        continue;
      }

      this.dispatchFrame(frame);
    }
  }

  private dispatchFrame(frame: Record<string, unknown>): void {
    const hasMethod = typeof frame.method === "string";
    const hasId = frame.id !== undefined && frame.id !== null;

    if (!hasMethod && hasId) {
      const id = frame.id as number | string;
      const entry = this.pending.get(id);
      if (!entry) return;
      this.pending.delete(id);
      if (entry.timer) clearTimeout(entry.timer);
      entry.cleanupAbort?.();

      if (frame.error && typeof frame.error === "object") {
        const errObj = frame.error as JsonRpcErrorObject;
        entry.reject(
          new AcpRpcError({
            code: typeof errObj.code === "number" ? errObj.code : -32603,
            message:
              typeof errObj.message === "string"
                ? errObj.message
                : `ACP RPC ${entry.method} failed`,
            data: errObj.data,
          }),
        );
      } else {
        entry.resolve(frame.result);
      }
      return;
    }

    if (hasMethod && !hasId) {
      const method = frame.method as string;
      if (method === "session/update" && frame.params && typeof frame.params === "object") {
        const notification = frame.params as AcpSessionNotification;
        const listeners = this.sessionUpdateListeners.get(notification.sessionId);
        if (listeners) {
          for (const listener of listeners) {
            try {
              listener(notification);
            } catch {
              // Listener errors must never crash JSON-RPC frame processing
            }
          }
        }
        for (const listener of this.globalUpdateListeners) {
          try {
            listener(notification);
          } catch {
            // Ignore
          }
        }
      }
      return;
    }

    if (hasMethod && hasId) {
      const id = frame.id as number | string;
      const method = frame.method as string;
      void this.handleServerRequest(id, method, frame.params);
    }
  }

  private async handleServerRequest(
    id: number | string,
    method: string,
    params: unknown,
  ): Promise<void> {
    if (method === "session/request_permission") {
      const permParams = (params ?? {}) as AcpRequestPermissionParams;
      const sessionId = permParams.sessionId;
      if (sessionId && this.cancelledSessions.has(sessionId)) {
        this.writeFrame({
          jsonrpc: "2.0",
          id,
          result: { outcome: { outcome: "cancelled" } } satisfies AcpRequestPermissionResult,
        });
        return;
      }

      const handler = sessionId ? this.permissionHandlers.get(sessionId) : undefined;
      if (!handler) {
        const rejectOpt = permParams.options?.find((o) => o.kind.startsWith("reject"));
        const result: AcpRequestPermissionResult = rejectOpt
          ? { outcome: { outcome: "selected", optionId: rejectOpt.optionId } }
          : { outcome: { outcome: "cancelled" } };
        this.writeFrame({ jsonrpc: "2.0", id, result });
        return;
      }

      let cancelEarly: ((res: AcpRequestPermissionResult) => void) | undefined;
      const cancelPromise = new Promise<AcpRequestPermissionResult>((resolve) => {
        cancelEarly = resolve;
      });
      let bucket = this.inFlightPermissionResolvers.get(sessionId);
      if (!bucket) {
        bucket = new Set();
        this.inFlightPermissionResolvers.set(sessionId, bucket);
      }
      if (cancelEarly) bucket.add(cancelEarly);

      try {
        const result = await Promise.race([handler(permParams), cancelPromise]);
        this.writeFrame({ jsonrpc: "2.0", id, result });
      } catch {
        this.writeFrame({
          jsonrpc: "2.0",
          id,
          result: { outcome: { outcome: "cancelled" } } satisfies AcpRequestPermissionResult,
        });
      } finally {
        if (cancelEarly) {
          bucket.delete(cancelEarly);
          if (bucket.size === 0) {
            this.inFlightPermissionResolvers.delete(sessionId);
          }
        }
      }
      return;
    }

    this.writeFrame({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `Client method not supported: ${method}`,
      },
    });
  }

  private writeFrame(frame: Record<string, unknown>): void {
    if (this.closed || !this.child.stdin.writable) return;
    try {
      this.child.stdin.write(`${JSON.stringify(frame)}\n`);
    } catch {
      // Handled via child error/close listeners
    }
  }

  request<T = unknown>(
    method: string,
    params?: unknown,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<T> {
    if (this.closed) {
      return Promise.reject(
        this.exitError ?? new Error(`Antigravity ACP connection is closed (${method})`),
      );
    }
    if (options?.signal?.aborted) {
      return Promise.reject(
        options.signal.reason instanceof Error
          ? options.signal.reason
          : new DOMException("The operation was aborted.", "AbortError"),
      );
    }

    const id = this.nextId++;
    const timeoutMs = options?.timeoutMs;

    return new Promise<T>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      if (timeoutMs !== undefined && timeoutMs > 0) {
        timer = setTimeout(() => {
          this.pending.delete(id);
          cleanupAbort?.();
          reject(
            new AcpRpcError({
              code: -32001,
              message: `Antigravity ACP ${method} timed out after ${timeoutMs}ms${this.formatStderrSuffix()}`,
            }),
          );
        }, timeoutMs);
        timer.unref?.();
      }

      let cleanupAbort: (() => void) | undefined;
      if (options?.signal) {
        const onAbort = () => {
          this.pending.delete(id);
          if (timer) clearTimeout(timer);
          reject(
            options.signal?.reason instanceof Error
              ? options.signal.reason
              : new DOMException("The operation was aborted.", "AbortError"),
          );
        };
        options.signal.addEventListener("abort", onAbort, { once: true });
        cleanupAbort = () => options.signal?.removeEventListener("abort", onAbort);
      }

      this.pending.set(id, {
        method,
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
        cleanupAbort,
      });

      this.writeFrame({
        jsonrpc: "2.0",
        id,
        method,
        ...(params !== undefined ? { params } : {}),
      });
    });
  }

  notify(method: string, params?: unknown): void {
    this.writeFrame({
      jsonrpc: "2.0",
      method,
      ...(params !== undefined ? { params } : {}),
    });
  }

  async initialize(options?: {
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<AcpInitializeResult> {
    if (this.initPromise) {
      return this.initPromise;
    }

    const payload: AcpInitializeParams = {
      protocolVersion: 1,
      clientCapabilities: {
        fs: {
          readTextFile: false,
          writeTextFile: false,
        },
        terminal: false,
      },
      clientInfo: {
        name: "opencode",
        title: "OpenCode",
        version: this.config.clientVersion ?? "2.0.0",
      },
    };

    this.initPromise = this.request<AcpInitializeResult>("initialize", payload, {
      timeoutMs: options?.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS,
      signal: options?.signal,
    }).then(
      (res) => {
        this.initResultValue = res;
        return res;
      },
      (err) => {
        this.initPromise = undefined;
        throw err;
      },
    );

    return this.initPromise;
  }

  createSession(
    params: AcpNewSessionParams,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<AcpSessionSetupResult> {
    return this.request<AcpSessionSetupResult>("session/new", params, {
      timeoutMs: options?.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS,
      signal: options?.signal,
    });
  }

  resumeSession(
    params: AcpResumeSessionParams,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<AcpSessionSetupResult> {
    return this.request<AcpSessionSetupResult>("session/resume", params, {
      timeoutMs: options?.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS,
      signal: options?.signal,
    });
  }

  async closeSession(sessionId: string): Promise<void> {
    this.cancelledSessions.delete(sessionId);
    this.sessionUpdateListeners.delete(sessionId);
    this.permissionHandlers.delete(sessionId);
    if (!this.alive) return;
    if (this.initResultValue?.agentCapabilities?.sessionCapabilities?.close === undefined) {
      return;
    }
    try {
      await this.request("session/close", { sessionId }, { timeoutMs: 5_000 });
    } catch {
      // Best-effort session/close
    }
  }

  setConfigOption(
    sessionId: string,
    configId: string,
    value: string | boolean,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<AcpSetConfigOptionResult> {
    const payload =
      typeof value === "boolean"
        ? { sessionId, configId, type: "boolean", value }
        : { sessionId, configId, value: String(value) };
    return this.request<AcpSetConfigOptionResult>("session/set_config_option", payload, {
      timeoutMs: options?.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS,
      signal: options?.signal,
    });
  }

  setMode(
    sessionId: string,
    modeId: string,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<unknown> {
    return this.request(
      "session/set_mode",
      { sessionId, modeId },
      { timeoutMs: options?.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS, signal: options?.signal },
    );
  }

  prompt(
    params: AcpPromptParams,
    options?: { signal?: AbortSignal },
  ): Promise<AcpPromptResult> {
    this.cancelledSessions.delete(params.sessionId);
    return this.request<AcpPromptResult>("session/prompt", params, {
      signal: options?.signal,
    });
  }

  cancelSession(sessionId: string): void {
    this.cancelledSessions.add(sessionId);
    const inFlight = this.inFlightPermissionResolvers.get(sessionId);
    if (inFlight) {
      for (const resolve of inFlight) {
        resolve({ outcome: { outcome: "cancelled" } });
      }
      this.inFlightPermissionResolvers.delete(sessionId);
    }
    this.notify("session/cancel", { sessionId });
  }

  onSessionUpdate(sessionId: string, listener: SessionUpdateListener): () => void {
    let set = this.sessionUpdateListeners.get(sessionId);
    if (!set) {
      set = new Set();
      this.sessionUpdateListeners.set(sessionId, set);
    }
    set.add(listener);
    return () => {
      const current = this.sessionUpdateListeners.get(sessionId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        this.sessionUpdateListeners.delete(sessionId);
      }
    };
  }

  onAnySessionUpdate(listener: SessionUpdateListener): () => void {
    this.globalUpdateListeners.add(listener);
    return () => {
      this.globalUpdateListeners.delete(listener);
    };
  }

  setPermissionHandler(
    sessionId: string,
    handler: PermissionRequestHandler | undefined,
  ): () => void {
    if (!handler) {
      this.permissionHandlers.delete(sessionId);
      return () => {};
    }
    this.permissionHandlers.set(sessionId, handler);
    return () => {
      if (this.permissionHandlers.get(sessionId) === handler) {
        this.permissionHandlers.delete(sessionId);
      }
    };
  }

  async close(): Promise<void> {
    if (this.closed && this.child.exitCode !== null) {
      return;
    }
    this.failConnection(new Error("Antigravity ACP connection closed"));

    try {
      this.child.stdin.end();
    } catch {
      // Ignore
    }

    const pid = this.child.pid;
    const killGroup = (sig: NodeJS.Signals) => {
      if (pid && process.platform !== "win32") {
        try {
          process.kill(-pid, sig);
          return;
        } catch {
          // Fallback to direct child signal
        }
      }
      try {
        this.child.kill(sig);
      } catch {
        // Already exited
      }
    };

    if (this.child.exitCode === null) {
      const exited = new Promise<void>((resolve) => {
        this.child.once("close", () => resolve());
      });
      killGroup("SIGTERM");

      let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
      const graceTimeout = new Promise<void>((resolve) => {
        forceKillTimer = setTimeout(() => {
          killGroup("SIGKILL");
          resolve();
        }, 500);
        forceKillTimer.unref?.();
      });

      await Promise.race([exited, graceTimeout]);
      if (forceKillTimer) clearTimeout(forceKillTimer);
    }
  }
}

export class AsyncLock {
  private tail: Promise<void> = Promise.resolve();

  async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) {
      throw signal.reason instanceof Error
        ? signal.reason
        : new DOMException("The operation was aborted.", "AbortError");
    }

    const prev = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    if (signal) {
      let abortedWhileWaiting = false;
      let cleanupAbort: (() => void) | undefined;
      const abortWait = new Promise<never>((_, reject) => {
        const onAbort = () => {
          abortedWhileWaiting = true;
          reject(
            signal.reason instanceof Error
              ? signal.reason
              : new DOMException("The operation was aborted.", "AbortError"),
          );
        };
        signal.addEventListener("abort", onAbort, { once: true });
        cleanupAbort = () => signal.removeEventListener("abort", onAbort);
      });

      try {
        await Promise.race([prev, abortWait]);
      } catch (err) {
        void prev.finally(() => release());
        throw err;
      } finally {
        cleanupAbort?.();
      }

      if (abortedWhileWaiting || signal.aborted) {
        release();
        throw signal.reason instanceof Error
          ? signal.reason
          : new DOMException("The operation was aborted.", "AbortError");
      }
    } else {
      await prev;
    }

    try {
      return await fn();
    } finally {
      release();
    }
  }
}

interface PooledWorkerEntry {
  connection: AcpConnection;
  activeLeases: number;
  idleTimer?: ReturnType<typeof setTimeout>;
}

/**
 * Manages pooled `agy acp` stdio worker processes with 5-minute idle eviction
 * and automatic crash self-resume (`#36181`).
 */
export class AcpClientPool {
  private readonly workers = new Map<string, PooledWorkerEntry>();
  private readonly locks = new Map<string, AsyncLock>();
  private readonly idleTimeoutMs: number;
  private disposed = false;

  constructor(options?: { idleTimeoutMs?: number }) {
    this.idleTimeoutMs = options?.idleTimeoutMs ?? DEFAULT_POOL_IDLE_MS;
  }

  private computePoolKey(binaryPath: string, args: ReadonlyArray<string>, config: AgySpawnConfig): string {
    const sanitizedEnv = buildSanitizedAgyEnv(config);
    return JSON.stringify({
      binaryPath,
      args,
      adcAuth: sanitizedEnv.AGY_ADC_AUTH === "true",
      location: sanitizedEnv.GOOGLE_CLOUD_LOCATION ?? "",
      projectId: sanitizedEnv.GOOGLE_CLOUD_PROJECT ?? "",
      autoCompactOverride: sanitizedEnv.AGY_CLI_AUTO_COMPACT_OVERRIDE ?? "off",
    });
  }

  private getLock(key: string): AsyncLock {
    let lock = this.locks.get(key);
    if (!lock) {
      lock = new AsyncLock();
      this.locks.set(key, lock);
    }
    return lock;
  }

  async acquire(
    config: AgySpawnConfig,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<{ connection: AcpConnection; release: () => void }> {
    if (this.disposed) {
      throw new Error("Antigravity ACP client pool has been disposed.");
    }

    const binaryPath = resolveAgyBinaryPath({
      binaryPath: config.binaryPath,
      env: config.env,
    });
    if (!binaryPath) {
      const err = new Error(
        "Antigravity CLI (`agy`) was not found in PATH. Install `agy` 1.5.8+ or set OPENCODE_AGY_PATH.",
      );
      (err as NodeJS.ErrnoException).code = "ENOENT";
      throw err;
    }

    const args = buildAgyAcpArgs(config);
    const key = this.computePoolKey(binaryPath, args, config);

    return this.getLock(key).run(async () => {
      if (this.disposed) {
        throw new Error("Antigravity ACP client pool has been disposed.");
      }

      let entry = this.workers.get(key);
      if (entry && !entry.connection.alive) {
        if (entry.idleTimer) clearTimeout(entry.idleTimer);
        this.workers.delete(key);
        await entry.connection.close().catch(() => {});
        entry = undefined;
      }

      if (!entry) {
        const connection = new AcpConnection(binaryPath, args, config);
        try {
          await connection.initialize({
            timeoutMs: options?.timeoutMs,
            signal: options?.signal,
          });
        } catch (err) {
          await connection.close().catch(() => {});
          throw err;
        }
        entry = { connection, activeLeases: 0 };
        this.workers.set(key, entry);
      }

      if (entry.idleTimer) {
        clearTimeout(entry.idleTimer);
        entry.idleTimer = undefined;
      }
      entry.activeLeases += 1;

      let released = false;
      const capturedEntry = entry;
      const release = () => {
        if (released) return;
        released = true;
        capturedEntry.activeLeases = Math.max(0, capturedEntry.activeLeases - 1);
        if (capturedEntry.activeLeases === 0 && !this.disposed) {
          this.scheduleIdleEviction(key, capturedEntry);
        }
      };

      return { connection: entry.connection, release };
    }, options?.signal);
  }

  async spawnEphemeral(
    config: AgySpawnConfig,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<AcpConnection> {
    const binaryPath = resolveAgyBinaryPath({
      binaryPath: config.binaryPath,
      env: config.env,
    });
    if (!binaryPath) {
      const err = new Error(
        "Antigravity CLI (`agy`) was not found in PATH. Install `agy` 1.5.8+ or set OPENCODE_AGY_PATH.",
      );
      (err as NodeJS.ErrnoException).code = "ENOENT";
      throw err;
    }

    const args = buildAgyAcpArgs(config);
    const connection = new AcpConnection(binaryPath, args, config);
    try {
      await connection.initialize({
        timeoutMs: options?.timeoutMs,
        signal: options?.signal,
      });
      return connection;
    } catch (err) {
      await connection.close().catch(() => {});
      throw err;
    }
  }

  private scheduleIdleEviction(key: string, entry: PooledWorkerEntry): void {
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    if (this.idleTimeoutMs <= 0) return;

    const timer = setTimeout(() => {
      if (entry.activeLeases > 0) return;
      if (this.workers.get(key) === entry) {
        this.workers.delete(key);
        void entry.connection.close().catch(() => {});
      }
    }, this.idleTimeoutMs);
    timer.unref?.();
    entry.idleTimer = timer;
  }

  async evictAll(): Promise<void> {
    const closing: Array<Promise<void>> = [];
    for (const [key, entry] of this.workers.entries()) {
      this.workers.delete(key);
      if (entry.idleTimer) clearTimeout(entry.idleTimer);
      closing.push(entry.connection.close().catch(() => {}));
    }
    await Promise.all(closing);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await this.evictAll();
  }
}
