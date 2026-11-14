import { type AcpInitializeResult, type AcpNewSessionParams, type AcpPromptParams, type AcpPromptResult, type AcpRequestPermissionParams, type AcpRequestPermissionResult, type AcpResumeSessionParams, type AcpSessionNotification, type AcpSessionSetupResult, type AcpSetConfigOptionResult } from "./types";
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
export declare function validateRelativeAppDataDir(appDataDir: string): string;
/**
 * Resolves the `agy` binary path without calling `realpath()`, preserving shim `argv[0]`
 * for version managers (`mise`, `aqua`, `volta`).
 */
export declare function resolveAgyBinaryPath(options?: {
    binaryPath?: string;
    env?: NodeJS.ProcessEnv;
}): string | undefined;
export declare function buildSanitizedAgyEnv(config?: AgySpawnConfig): NodeJS.ProcessEnv;
export declare function expandHomePath(rawPath: string): string;
export declare function resolveEffectiveGeminiDir(config?: {
    geminiDir?: string;
    env?: NodeJS.ProcessEnv;
}): string | undefined;
export declare function buildAgyAcpArgs(config?: AgySpawnConfig): string[];
export declare function resolveConversationsDir(config?: {
    geminiDir?: string;
    appDataDir?: string;
    env?: NodeJS.ProcessEnv;
}): string;
export declare function resolveSessionDbPath(sessionId: string, config?: {
    geminiDir?: string;
    appDataDir?: string;
    env?: NodeJS.ProcessEnv;
}): string;
export declare function cleanupSessionDbFiles(sessionId: string, config?: {
    geminiDir?: string;
    appDataDir?: string;
    env?: NodeJS.ProcessEnv;
}): void;
export type SessionUpdateListener = (notification: AcpSessionNotification) => void;
export type PermissionRequestHandler = (params: AcpRequestPermissionParams) => Promise<AcpRequestPermissionResult>;
export declare class AcpConnection {
    readonly binaryPath: string;
    readonly args: ReadonlyArray<string>;
    readonly config: AgySpawnConfig;
    private readonly child;
    private readonly pending;
    private readonly sessionUpdateListeners;
    private readonly globalUpdateListeners;
    private readonly permissionHandlers;
    private readonly cancelledSessions;
    private readonly inFlightPermissionResolvers;
    private nextId;
    private stdoutBuffer;
    private stderrTail;
    private closed;
    private exitError;
    private initPromise;
    private initResultValue;
    constructor(binaryPath: string, args: ReadonlyArray<string>, config?: AgySpawnConfig);
    get alive(): boolean;
    get initializeResult(): AcpInitializeResult | undefined;
    get stderr(): string;
    get pid(): number | undefined;
    private appendStderr;
    private formatStderrSuffix;
    private failConnection;
    private onStdoutData;
    private dispatchFrame;
    private handleServerRequest;
    private writeFrame;
    request<T = unknown>(method: string, params?: unknown, options?: {
        timeoutMs?: number;
        signal?: AbortSignal;
    }): Promise<T>;
    notify(method: string, params?: unknown): void;
    initialize(options?: {
        timeoutMs?: number;
        signal?: AbortSignal;
    }): Promise<AcpInitializeResult>;
    createSession(params: AcpNewSessionParams, options?: {
        timeoutMs?: number;
        signal?: AbortSignal;
    }): Promise<AcpSessionSetupResult>;
    resumeSession(params: AcpResumeSessionParams, options?: {
        timeoutMs?: number;
        signal?: AbortSignal;
    }): Promise<AcpSessionSetupResult>;
    closeSession(sessionId: string): Promise<void>;
    setConfigOption(sessionId: string, configId: string, value: string | boolean, options?: {
        timeoutMs?: number;
        signal?: AbortSignal;
    }): Promise<AcpSetConfigOptionResult>;
    setMode(sessionId: string, modeId: string, options?: {
        timeoutMs?: number;
        signal?: AbortSignal;
    }): Promise<unknown>;
    prompt(params: AcpPromptParams, options?: {
        signal?: AbortSignal;
    }): Promise<AcpPromptResult>;
    cancelSession(sessionId: string): void;
    onSessionUpdate(sessionId: string, listener: SessionUpdateListener): () => void;
    onAnySessionUpdate(listener: SessionUpdateListener): () => void;
    setPermissionHandler(sessionId: string, handler: PermissionRequestHandler | undefined): () => void;
    close(): Promise<void>;
}
export declare class AsyncLock {
    private tail;
    run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}
/**
 * Manages pooled `agy acp` stdio worker processes with 5-minute idle eviction
 * and automatic crash self-resume (`#36181`).
 */
export declare class AcpClientPool {
    private readonly workers;
    private readonly locks;
    private readonly idleTimeoutMs;
    private disposed;
    constructor(options?: {
        idleTimeoutMs?: number;
    });
    private computePoolKey;
    private getLock;
    acquire(config: AgySpawnConfig, options?: {
        signal?: AbortSignal;
        timeoutMs?: number;
    }): Promise<{
        connection: AcpConnection;
        release: () => void;
    }>;
    spawnEphemeral(config: AgySpawnConfig, options?: {
        signal?: AbortSignal;
        timeoutMs?: number;
    }): Promise<AcpConnection>;
    private scheduleIdleEviction;
    evictAll(): Promise<void>;
    dispose(): Promise<void>;
}
