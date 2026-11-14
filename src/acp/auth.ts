import { closeSync, existsSync, mkdtempSync, openSync, readSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  AGY_DEFAULT_APP_DATA_DIR,
  AGY_DEFAULT_BINARY,
  AGY_EXTERNAL_METHOD_ID,
  AGY_ISOLATED_APP_DATA_DIR,
  AGY_LOGIN_METHOD_ID,
  AGY_PROVIDER_ID,
  AGY_PROVIDER_NAME,
  AGY_STORAGE_AUTH_STATUS_KEY,
} from "../constants";
import type {
  OpenCodeV2PluginContext,
  OpenCodeV2PluginOptions,
  OpenCodeV2Registration,
  OpenCodeV2StorageDomain,
} from "../plugin/types";
import { discoverCatalogFromSession, type DiscoveredAgyCatalog } from "./catalog";
import {
  cleanupSessionDbFiles,
  expandHomePath,
  resolveAgyBinaryPath,
  resolveEffectiveGeminiDir,
  validateRelativeAppDataDir,
  type AcpClientPool,
  type AgySpawnConfig,
} from "./client";
import { AcpRpcError } from "./types";

export type AgyAuthReadinessState = "unknown" | "ready" | "needs_auth" | "missing" | "failed";

export interface ClassifiedAgyAuthError {
  readonly state: "needs_auth" | "missing" | "failed";
  readonly message: string;
}

export interface AgyProbeOutcome {
  readonly state: AgyAuthReadinessState;
  readonly message?: string;
  readonly agentVersion?: string;
  readonly catalog?: DiscoveredAgyCatalog;
  readonly error?: unknown;
}

/**
 * Classifies ACP startup / `session/new` errors, explicitly catching both standard
 * `-32000` (`auth_required`) and `agy`'s headless `-32603` browser error (`#36037`).
 */
export function classifyAcpAuthError(error: unknown): ClassifiedAgyAuthError {
  const errCode = (error as NodeJS.ErrnoException | undefined)?.code;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error ?? "Unknown Antigravity ACP error");

  if (errCode === "ENOENT" || /not found in PATH|ENOENT/i.test(message)) {
    return {
      state: "missing",
      message:
        "Antigravity CLI (`agy`) was not found in PATH. Install `agy` 1.5.8+ or set `OPENCODE_AGY_PATH`.",
    };
  }

  if (error instanceof AcpRpcError) {
    if (error.code === -32000) {
      return {
        state: "needs_auth",
        message:
          "Antigravity CLI authentication is required. Run `agy acp --login` to sign in.",
      };
    }

    if (
      error.code === -32603 &&
      /no browser is available|agy acp --login|authentication required|auth_required|not signed in|sign in|unauthenticated/i.test(
        message,
      )
    ) {
      return {
        state: "needs_auth",
        message:
          "Antigravity CLI is not signed in (headless environment detected). Run `agy acp --login` to authenticate via URL paste.",
      };
    }
  }

  if (
    /no browser is available|agy acp --login|authentication required|auth_required|not signed in|unauthenticated/i.test(
      message,
    )
  ) {
    return {
      state: "needs_auth",
      message:
        "Antigravity CLI authentication is required. Run `agy acp --login` to sign in.",
    };
  }

  return {
    state: "failed",
    message,
  };
}

export function buildAgyLoginCommand(config?: AgySpawnConfig): string[] {
  const env = config?.env ?? process.env;
  const binary =
    resolveAgyBinaryPath({
      binaryPath: config?.binaryPath,
      env,
    }) ??
    config?.binaryPath?.trim() ??
    env.OPENCODE_AGY_PATH?.trim() ??
    AGY_DEFAULT_BINARY;

  const cmd = [binary, "acp", "--login"];
  const geminiDir = resolveEffectiveGeminiDir(config);
  if (geminiDir) {
    const appDataDir = validateRelativeAppDataDir(
      config?.appDataDir ?? AGY_ISOLATED_APP_DATA_DIR,
    );
    cmd.push("--gemini-dir", geminiDir, "--app-data-dir", appDataDir);
  } else if (config?.appDataDir) {
    cmd.push("--app-data-dir", validateRelativeAppDataDir(config.appDataDir));
  }
  return cmd;
}

function readBoundedFileUtf8(filePath: string, maxBytes = 16_384): string {
  const fd = openSync(filePath, "r");
  try {
    const buf = Buffer.allocUnsafe(maxBytes);
    const bytesRead = readSync(fd, buf, 0, maxBytes, 0);
    return buf.subarray(0, bytesRead).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

function isNonEmptyAuthHintFile(
  filePath: string,
  kind: "json" | "pbtxt" | "token",
): boolean {
  try {
    if (!existsSync(filePath)) return false;
    const st = statSync(filePath);
    if (!st.isFile() || st.size === 0) return false;

    const trimmed = readBoundedFileUtf8(filePath).trim();
    if (!trimmed) return false;

    if (kind === "json") {
      if (trimmed.length <= 2 || trimmed === "{}" || trimmed === "[]" || trimmed === "null") {
        return false;
      }
      if (st.size <= 16_384) {
        try {
          const parsed = JSON.parse(trimmed) as unknown;
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return false;
          }
          const rec = parsed as Record<string, unknown>;
          if (Object.keys(rec).length === 0 || rec.signedIn === false) {
            return false;
          }
        } catch {
          // Non-trivial file that didn't parse completely within head window; treat as present
        }
      }
      return true;
    }

    if (kind === "token") {
      return trimmed !== "{}" && trimmed !== "null" && trimmed.length > 2;
    }

    // `pbtxt`: OS-keyring-backed `agy 1.5.8` stores `JetskiState` protobuf text here
    // while keeping the OAuth token itself in the OS keyring (`probeAgyAuthAndCatalog`
    // remains authoritative once the async `session/new` probe completes).
    return /^[a-zA-Z0-9_]+\s*[:{]/m.test(trimmed);
  } catch {
    return false;
  }
}

function isAdcEnabledInConfig(config?: AgySpawnConfig): boolean {
  const env = config?.env ?? process.env;
  return (
    config?.adcAuth === true ||
    env.AGY_ADC_AUTH?.trim().toLowerCase() === "true" ||
    env.AGY_ADC_AUTH?.trim() === "1"
  );
}

function resolveAgyProfilePaths(config?: AgySpawnConfig): {
  explicitGeminiDir: string | undefined;
  baseGeminiDir: string;
  appDataDir: string;
  appDataPath: string;
} {
  const explicitGeminiDir = resolveEffectiveGeminiDir(config);
  const baseGeminiDir = explicitGeminiDir ?? join(homedir(), ".gemini");
  const appDataDir = explicitGeminiDir
    ? validateRelativeAppDataDir(config?.appDataDir ?? AGY_ISOLATED_APP_DATA_DIR)
    : config?.appDataDir
      ? validateRelativeAppDataDir(config.appDataDir)
      : AGY_DEFAULT_APP_DATA_DIR;
  return {
    explicitGeminiDir,
    baseGeminiDir,
    appDataDir,
    appDataPath: join(baseGeminiDir, appDataDir),
  };
}

function hasExplicitDiskCredentialHint(config?: AgySpawnConfig): boolean {
  if (isAdcEnabledInConfig(config)) {
    return true;
  }
  const env = config?.env ?? process.env;
  const binary = resolveAgyBinaryPath({
    binaryPath: config?.binaryPath,
    env,
  });
  if (!binary) {
    return false;
  }
  try {
    const { explicitGeminiDir, baseGeminiDir, appDataDir, appDataPath } =
      resolveAgyProfilePaths(config);
    if (isNonEmptyAuthHintFile(join(appDataPath, "auth.json"), "json")) {
      return true;
    }
    if (isNonEmptyAuthHintFile(join(appDataPath, "jetski-standalone-oauth-token"), "token")) {
      return true;
    }
    const canCheckSharedStandaloneToken =
      Boolean(explicitGeminiDir) || !config?.appDataDir || appDataDir === AGY_DEFAULT_APP_DATA_DIR;
    if (
      canCheckSharedStandaloneToken &&
      isNonEmptyAuthHintFile(join(baseGeminiDir, "jetski-standalone-oauth-token"), "token")
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Instant synchronous hint used ONLY at `t = 0ms` cold-start before the live
 * `session/new` probe completes. Supports `auth.json`, OS-keyring-backed
 * `jetski_state.pbtxt`, and standalone `jetski-standalone-oauth-token`.
 * Authoritative readiness always comes from `probeAgyAuthAndCatalog()` (`#34389`).
 */
export function hasLocalAgyAuthHint(config?: AgySpawnConfig): boolean {
  if (isAdcEnabledInConfig(config)) {
    return true;
  }

  const env = config?.env ?? process.env;
  const binary = resolveAgyBinaryPath({
    binaryPath: config?.binaryPath,
    env,
  });
  if (!binary) {
    return false;
  }

  try {
    const { explicitGeminiDir, baseGeminiDir, appDataDir, appDataPath } =
      resolveAgyProfilePaths(config);

    if (isNonEmptyAuthHintFile(join(appDataPath, "auth.json"), "json")) {
      return true;
    }
    if (isNonEmptyAuthHintFile(join(appDataPath, "jetski_state.pbtxt"), "pbtxt")) {
      return true;
    }
    if (isNonEmptyAuthHintFile(join(appDataPath, "jetski-standalone-oauth-token"), "token")) {
      return true;
    }

    const canCheckSharedStandaloneToken =
      Boolean(explicitGeminiDir) || !config?.appDataDir || appDataDir === AGY_DEFAULT_APP_DATA_DIR;
    if (
      canCheckSharedStandaloneToken &&
      isNonEmptyAuthHintFile(join(baseGeminiDir, "jetski-standalone-oauth-token"), "token")
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export async function resolveEffectiveSpawnConfig(
  ctx: Pick<OpenCodeV2PluginContext, "options" | "integration" | "location">,
  overrides?: Partial<AgySpawnConfig>,
): Promise<AgySpawnConfig> {
  const opts: OpenCodeV2PluginOptions = ctx.options ?? {};
  const env = overrides?.env ?? process.env;
  let connectionGeminiDir: string | undefined;

  try {
    const activeConn = await ctx.integration.connection?.active(AGY_PROVIDER_ID);
    if (activeConn && ctx.integration.connection?.resolve) {
      const cred = await ctx.integration.connection.resolve(activeConn);
      const meta =
        cred?.metadata && typeof cred.metadata === "object"
          ? (cred.metadata as Record<string, unknown>)
          : undefined;
      const rawDir = meta?.geminiDir;
      if (typeof rawDir === "string" && rawDir.trim()) {
        connectionGeminiDir = expandHomePath(rawDir);
      }
    }
  } catch {
    // Ignore integration lookup errors during early boot
  }

  const rawGeminiDir =
    overrides?.geminiDir ??
    connectionGeminiDir ??
    opts.geminiDir ??
    env.OPENCODE_AGY_GEMINI_DIR;
  const geminiDir = rawGeminiDir?.trim() ? expandHomePath(rawGeminiDir) : undefined;

  const includeDefaultCustomizations =
    overrides?.includeDefaultCustomizations ?? opts.includeDefaultCustomizations;

  const cwd =
    overrides?.cwd ??
    ctx.location?.directory ??
    ctx.location?.worktree ??
    ctx.location?.root ??
    ctx.location?.workspace ??
    process.cwd();

  return {
    binaryPath: overrides?.binaryPath ?? opts.binaryPath,
    ...(geminiDir ? { geminiDir } : {}),
    ...(overrides?.appDataDir ?? opts.appDataDir
      ? { appDataDir: overrides?.appDataDir ?? opts.appDataDir }
      : {}),
    adcAuth: overrides?.adcAuth ?? opts.adcAuth,
    projectId: overrides?.projectId ?? opts.projectId,
    autoCompactOverride: overrides?.autoCompactOverride ?? opts.autoCompactOverride,
    ...(includeDefaultCustomizations !== undefined
      ? { includeDefaultCustomizations }
      : {}),
    cwd,
    ...(overrides?.env ? { env: overrides.env } : {}),
    ...(overrides?.extraArgs ? { extraArgs: overrides.extraArgs } : {}),
  };
}

/**
 * Probes authoritative `agy acp` auth readiness and discovers the full live model
 * + `thought_level` catalog via an ephemeral `initialize` + `session/new` session.
 * Never calls `authenticate` (which blocks waiting for an interactive browser).
 */
export async function probeAgyAuthAndCatalog(
  pool: AcpClientPool,
  config: AgySpawnConfig,
  options?: {
    probeThoughtLevels?: boolean;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<AgyProbeOutcome> {
  const tempCwd = mkdtempSync(join(tmpdir(), "opencode-agy-probe-"));
  let sessionId: string | undefined;
  let connection: Awaited<ReturnType<AcpClientPool["spawnEphemeral"]>> | undefined;
  let probeState: AgyAuthReadinessState | undefined;
  let preExistingStatePbtxt = true;
  let statePbtxtPath: string | undefined;

  try {
    const paths = resolveAgyProfilePaths(config);
    statePbtxtPath = join(paths.appDataPath, "jetski_state.pbtxt");
    preExistingStatePbtxt = existsSync(statePbtxtPath);
  } catch {
    // Invalid appDataDir will surface from spawnEphemeral below
  }

  try {
    connection = await pool.spawnEphemeral(
      {
        ...config,
        cwd: tempCwd,
        includeDefaultCustomizations: false,
      },
      {
        signal: options?.signal,
        timeoutMs: options?.timeoutMs ?? 20_000,
      },
    );

    const setup = await connection.createSession(
      {
        cwd: tempCwd,
        mcpServers: [],
        _meta: {
          disableBuiltInTools: true,
        },
      },
      {
        signal: options?.signal,
        timeoutMs: options?.timeoutMs ?? 25_000,
      },
    );
    sessionId = setup.sessionId;

    const catalog = await discoverCatalogFromSession(connection, setup, {
      probeThoughtLevels: options?.probeThoughtLevels !== false,
      signal: options?.signal,
    });

    probeState = "ready";
    return {
      state: "ready",
      agentVersion: connection.initializeResult?.agentInfo?.version,
      catalog,
    };
  } catch (error) {
    const classified = classifyAcpAuthError(error);
    probeState = classified.state;
    return {
      state: classified.state,
      message: classified.message,
      error,
    };
  } finally {
    if (connection && sessionId) {
      await connection.closeSession(sessionId).catch(() => {});
    }
    if (connection) {
      await connection.close().catch(() => {});
    }
    if (sessionId) {
      cleanupSessionDbFiles(sessionId, {
        geminiDir: config.geminiDir,
        appDataDir: config.appDataDir,
        env: config.env,
      });
    }
    // `agy 1.5.8` writes onboarding metadata to `jetski_state.pbtxt` during `session/new`
    // before checking auth; remove it if this probe itself created it on an unauthenticated dir.
    if (probeState === "needs_auth" && !preExistingStatePbtxt && statePbtxtPath) {
      try {
        rmSync(statePbtxtPath, { force: true });
      } catch {
        // Ignore cleanup failure
      }
    }
    try {
      rmSync(tempCwd, { recursive: true, force: true });
    } catch {
      // Ignore temp directory cleanup failures
    }
  }
}

interface PersistedAgyAuthProfileEntry {
  readonly state: "ready" | "needs_auth";
  readonly message?: string;
  readonly updatedAt: number;
}

interface PersistedAgyAuthStore {
  readonly version: 1;
  readonly profiles: Record<string, PersistedAgyAuthProfileEntry>;
}

function buildAuthProfileStorageKey(config?: AgySpawnConfig): string | undefined {
  try {
    const paths = resolveAgyProfilePaths(config);
    return JSON.stringify({
      appDataPath: paths.appDataPath,
      adcAuth: isAdcEnabledInConfig(config),
    });
  } catch {
    return undefined;
  }
}

export class AgyAuthController {
  private readiness: AgyAuthReadinessState = "unknown";
  private lastMessage: string | undefined;
  private disposed = false;

  constructor(private readonly initialConfig: AgySpawnConfig) {
    if (hasLocalAgyAuthHint(initialConfig)) {
      this.readiness = "ready";
    }
  }

  get state(): AgyAuthReadinessState {
    return this.readiness;
  }

  get message(): string | undefined {
    return this.lastMessage;
  }

  get shouldActivateProvider(): boolean {
    return this.readiness === "ready";
  }

  async hydrateFromStorage(
    storage?: OpenCodeV2StorageDomain,
    config?: AgySpawnConfig,
  ): Promise<void> {
    if (!storage) return;
    const effectiveConfig = config ?? this.initialConfig;
    const profileKey = buildAuthProfileStorageKey(effectiveConfig);
    if (!profileKey) return;

    try {
      const raw = (await storage.get(AGY_STORAGE_AUTH_STATUS_KEY)) as
        | Partial<PersistedAgyAuthStore>
        | undefined;
      if (!raw || typeof raw !== "object" || raw.version !== 1 || !raw.profiles) {
        return;
      }
      const entry = raw.profiles[profileKey];
      if (!entry) return;

      // If the previous authoritative probe determined `needs_auth` and no explicit disk
      // credential (`auth.json`, `jetski-standalone-oauth-token`, or `adcAuth`) exists,
      // prevent bare `jetski_state.pbtxt` metadata from falsely activating `t = 0ms`.
      if (entry.state === "needs_auth" && !hasExplicitDiskCredentialHint(effectiveConfig)) {
        this.readiness = "needs_auth";
        this.lastMessage = entry.message;
      }
    } catch {
      // Ignore storage read errors during cold start
    }
  }

  async persistToStorage(
    storage?: OpenCodeV2StorageDomain,
    config?: AgySpawnConfig,
  ): Promise<void> {
    if (!storage) return;
    if (this.readiness !== "ready" && this.readiness !== "needs_auth") {
      return;
    }
    const effectiveConfig = config ?? this.initialConfig;
    const profileKey = buildAuthProfileStorageKey(effectiveConfig);
    if (!profileKey) return;

    try {
      const existing = (await storage
        .get(AGY_STORAGE_AUTH_STATUS_KEY)
        .catch(() => undefined)) as Partial<PersistedAgyAuthStore> | undefined;
      const prevProfiles =
        existing && typeof existing === "object" && existing.version === 1 && existing.profiles
          ? existing.profiles
          : {};
      const next: PersistedAgyAuthStore = {
        version: 1,
        profiles: {
          ...prevProfiles,
          [profileKey]: {
            state: this.readiness,
            ...(this.lastMessage ? { message: this.lastMessage } : {}),
            updatedAt: Date.now(),
          },
        },
      };
      await storage.set(AGY_STORAGE_AUTH_STATUS_KEY, next);
    } catch {
      // Non-fatal storage persistence error
    }
  }

  updateFromOutcome(outcome: Pick<AgyProbeOutcome, "state" | "message">): boolean {
    const prevState = this.readiness;
    const prevMsg = this.lastMessage;
    this.readiness = outcome.state;
    this.lastMessage = outcome.message;
    return prevState !== this.readiness || prevMsg !== this.lastMessage;
  }

  markDisposed(): void {
    this.disposed = true;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }
}

export async function syncIntegrationConnectionStatus(
  ctx: Pick<OpenCodeV2PluginContext, "integration">,
  auth: AgyAuthController,
): Promise<void> {
  if (!ctx.integration.connection?.active || !ctx.integration.connection?.status) {
    return;
  }
  try {
    const active = await ctx.integration.connection.active(AGY_PROVIDER_ID);
    if (!active) return;

    if (auth.state === "needs_auth" || auth.state === "missing") {
      await ctx.integration.connection.status({
        integrationID: AGY_PROVIDER_ID,
        connection: active,
        status: {
          status: "needs_auth",
          message:
            auth.message ??
            "Antigravity CLI authentication is required. Run `agy acp --login`.",
        },
      });
    } else if (auth.state === "ready") {
      await ctx.integration.connection.status({
        integrationID: AGY_PROVIDER_ID,
        connection: active,
        status: undefined,
      });
    }
  } catch {
    // Ignore status reporting failures on hosts that do not persist external connection status
  }
}

export async function registerAgyIntegration(
  ctx: OpenCodeV2PluginContext,
  deps: {
    auth: AgyAuthController;
    getSpawnConfig: () => AgySpawnConfig;
    onCredentialsChanged: () => Promise<void>;
    cleanups: Array<() => Promise<void> | void>;
  },
): Promise<void> {
  const reg = await ctx.integration.transform((editor) => {
    editor.update(AGY_PROVIDER_ID, (info) => {
      info.name = AGY_PROVIDER_NAME;
    });

    const cfg = deps.getSpawnConfig();

    editor.method.update({
      integrationID: AGY_PROVIDER_ID,
      method: {
        id: AGY_LOGIN_METHOD_ID,
        type: "command",
        label: "Sign in with Antigravity CLI (agy acp --login)",
        command: buildAgyLoginCommand(cfg),
      },
    });

    editor.method.update({
      integrationID: AGY_PROVIDER_ID,
      method: {
        id: AGY_EXTERNAL_METHOD_ID,
        type: "external",
        label: "Use existing Antigravity CLI login (~/.gemini)",
        form: [
          {
            key: "geminiDir",
            type: "string",
            title: "Custom Gemini directory (optional)",
            description:
              "Leave blank to share ~/.gemini/antigravity-cli, or provide an isolated --gemini-dir path.",
            required: false,
            placeholder: "~/.gemini",
          },
        ],
      },
    });
  });

  if (reg && typeof (reg as OpenCodeV2Registration).dispose === "function") {
    deps.cleanups.push(() => (reg as OpenCodeV2Registration).dispose());
  }

  if (ctx.event?.subscribe) {
    let stopped = false;
    deps.cleanups.push(() => {
      stopped = true;
    });

    const subscription = ctx.event.subscribe({
      types: ["credential.updated", "credential.switched"],
    });

    void (async () => {
      try {
        for await (const evt of subscription) {
          if (stopped || deps.auth.isDisposed) break;
          const integrationId =
            typeof evt.data?.integrationID === "string"
              ? evt.data.integrationID
              : typeof evt.data?.providerID === "string"
                ? evt.data.providerID
                : undefined;
          if (integrationId && integrationId !== AGY_PROVIDER_ID) {
            continue;
          }
          await deps.onCredentialsChanged().catch(() => {});
        }
      } catch {
        // Event stream ended
      }
    })();
  }
}
