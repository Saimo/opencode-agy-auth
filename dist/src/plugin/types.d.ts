import type { LanguageModelV3 } from "../acp/types";
export type AgyToolMode = "opencode" | "hybrid";
export interface OpenCodeV2Registration {
    readonly dispose: () => Promise<void>;
}
export interface OpenCodeV2TransformRegistry<Editor = unknown> {
    readonly transform: (callback: (editor: Editor) => void) => Promise<OpenCodeV2Registration> | OpenCodeV2Registration | void;
    readonly reload?: () => Promise<void>;
}
export interface OpenCodeV2ProviderInfo {
    id: string;
    canonical?: string;
    integrationID?: string;
    name: string;
    activation: "auto" | "enabled" | "disabled";
    package: string;
    compatibility?: Record<string, unknown>;
    settings?: Record<string, unknown>;
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
}
export interface OpenCodeV2ModelVariant {
    id: string;
    settings?: Record<string, unknown>;
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
}
export interface OpenCodeV2ModelCost {
    tier?: {
        type: "context";
        size: number;
    };
    input: number;
    output: number;
    cache: {
        read: number;
        write: number;
    };
}
export interface OpenCodeV2ModelCapabilities {
    tools: boolean;
    input: string[];
    output: string[];
    temperature?: boolean;
}
export interface OpenCodeV2ModelInfo {
    id: string;
    modelID: string;
    providerID: string;
    canonical?: string;
    family?: string;
    name: string;
    compatibility?: Record<string, unknown>;
    package?: string;
    settings?: Record<string, unknown>;
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
    capabilities: OpenCodeV2ModelCapabilities;
    variants: OpenCodeV2ModelVariant[];
    time: {
        released: number;
    };
    cost: OpenCodeV2ModelCost[];
    status: "alpha" | "beta" | "deprecated" | "active";
    enabled: boolean;
    limit: {
        context: number;
        input?: number;
        output: number;
    };
}
export interface OpenCodeV2ProviderRecord {
    readonly provider: OpenCodeV2ProviderInfo;
    readonly models: ReadonlyMap<string, OpenCodeV2ModelInfo>;
    readonly sourceConnection?: OpenCodeV2ConnectionInfo;
}
export interface OpenCodeV2ProviderEditor {
    list?(): readonly OpenCodeV2ProviderRecord[];
    get?(providerID: string): OpenCodeV2ProviderRecord | undefined;
    add?(input: {
        info: OpenCodeV2ProviderInfo;
        models: readonly OpenCodeV2ModelInfo[];
        sourceConnection?: OpenCodeV2ConnectionInfo;
    }): void;
    update(providerID: string, update: (provider: OpenCodeV2ProviderInfo) => void): void;
    remove?(providerID: string): void;
    readonly models: {
        set?(providerID: string, models: readonly OpenCodeV2ModelInfo[]): void;
        update(providerID: string, modelID: string, update: (model: OpenCodeV2ModelInfo) => void): void;
        remove?(providerID: string, modelID: string): void;
    };
}
export interface OpenCodeV2ProviderDomain extends OpenCodeV2TransformRegistry<OpenCodeV2ProviderEditor> {
    readonly get?: (input: {
        providerID: string;
    }) => Promise<{
        data?: OpenCodeV2ProviderInfo;
    } | undefined>;
}
export interface OpenCodeV2ModelEditor {
    list(providerID?: string): readonly OpenCodeV2ModelInfo[];
    get(providerID: string, modelID: string): OpenCodeV2ModelInfo | undefined;
    update(providerID: string, modelID: string, update: (model: OpenCodeV2ModelInfo) => void): void;
    remove(providerID: string, modelID: string): void;
}
export interface OpenCodeV2ConnectionStatus {
    readonly status: "needs_auth";
    readonly message: string;
    readonly url?: string;
}
export interface OpenCodeV2ConnectionInfo {
    readonly id?: string;
    readonly type?: "credential" | "env" | string;
    readonly method?: string;
    readonly integrationID?: string;
    readonly label?: string;
    readonly status?: OpenCodeV2ConnectionStatus;
    readonly [key: string]: unknown;
}
export interface OpenCodeV2ExternalCredential {
    readonly type: "external";
    readonly methodID: string;
    readonly metadata?: Record<string, unknown>;
}
export interface OpenCodeV2KeyCredential {
    readonly type: "key";
    readonly key: string;
    readonly metadata?: Record<string, unknown>;
}
export interface OpenCodeV2OAuthCredential {
    readonly type: "oauth";
    readonly methodID: string;
    readonly refresh: string;
    readonly access: string;
    readonly expires: number;
    readonly metadata?: Record<string, unknown>;
}
export type OpenCodeV2CredentialValue = OpenCodeV2ExternalCredential | OpenCodeV2KeyCredential | OpenCodeV2OAuthCredential | {
    readonly type: string;
    readonly [key: string]: unknown;
};
export interface OpenCodeV2FormField {
    readonly key: string;
    readonly type: "string" | "boolean";
    readonly title: string;
    readonly description?: string;
    readonly required?: boolean;
    readonly placeholder?: string;
}
export interface OpenCodeV2IntegrationCommandMethod {
    readonly id: string;
    readonly type: "command";
    readonly label: string;
    readonly command: ReadonlyArray<string>;
}
export interface OpenCodeV2IntegrationExternalMethod {
    readonly id: string;
    readonly type: "external";
    readonly label: string;
    readonly form?: ReadonlyArray<OpenCodeV2FormField>;
}
export interface OpenCodeV2IntegrationEnvMethod {
    readonly type: "env";
    readonly names: ReadonlyArray<string>;
}
export type OpenCodeV2IntegrationMethod = OpenCodeV2IntegrationCommandMethod | OpenCodeV2IntegrationExternalMethod | OpenCodeV2IntegrationEnvMethod;
export type OpenCodeV2IntegrationMethodRegistration = {
    readonly integrationID: string;
    readonly method: OpenCodeV2IntegrationCommandMethod;
} | {
    readonly integrationID: string;
    readonly method: OpenCodeV2IntegrationExternalMethod;
} | {
    readonly integrationID: string;
    readonly method: OpenCodeV2IntegrationEnvMethod;
};
export interface OpenCodeV2IntegrationEditor {
    list?(): readonly {
        id: string;
        name: string;
    }[];
    get?(id: string): {
        id: string;
        name: string;
    } | undefined;
    update(id: string, update: (integration: {
        id: string;
        name: string;
    }) => void): void;
    remove?(id: string): void;
    readonly method: {
        list?(integrationID: string): readonly OpenCodeV2IntegrationMethod[];
        update(input: OpenCodeV2IntegrationMethodRegistration): void;
        remove?(integrationID: string, method: OpenCodeV2IntegrationMethod): void;
    };
}
export interface OpenCodeV2IntegrationDomain extends OpenCodeV2TransformRegistry<OpenCodeV2IntegrationEditor> {
    readonly connection?: {
        readonly active: (integrationID: string) => Promise<OpenCodeV2ConnectionInfo | undefined>;
        readonly resolve?: (connection: OpenCodeV2ConnectionInfo) => Promise<OpenCodeV2CredentialValue | undefined>;
        readonly status?: (input: {
            readonly integrationID: string;
            readonly connection: OpenCodeV2ConnectionInfo;
            readonly status: OpenCodeV2ConnectionStatus | undefined;
        }) => Promise<void>;
    };
}
export interface OpenCodeV2AISDKSdkHookEvent {
    readonly model: OpenCodeV2ModelInfo;
    readonly package: string;
    readonly options: Record<string, unknown>;
    sdk?: {
        languageModel: (modelId: string) => LanguageModelV3;
    };
}
export interface OpenCodeV2AISDKLanguageHookEvent {
    readonly model: OpenCodeV2ModelInfo;
    readonly sdk: unknown;
    readonly options: Record<string, unknown>;
    language?: LanguageModelV3;
}
export interface OpenCodeV2AISDKHooks {
    readonly sdk: OpenCodeV2AISDKSdkHookEvent;
    readonly language: OpenCodeV2AISDKLanguageHookEvent;
}
export interface OpenCodeV2AISDKDomain {
    readonly hook: <K extends keyof OpenCodeV2AISDKHooks>(name: K, handler: (event: OpenCodeV2AISDKHooks[K]) => Promise<void> | void, options?: {
        readonly providerID?: string;
    }) => Promise<OpenCodeV2Registration> | OpenCodeV2Registration | void;
}
export interface OpenCodeV2ModelRef {
    readonly id: string;
    readonly providerID: string;
    readonly variant?: string;
}
export type OpenCodeV2SessionRequestKind = "primary" | "compaction" | "title" | "generate";
export interface OpenCodeV2SystemPart {
    readonly type?: string;
    readonly text: string;
    readonly metadata?: Record<string, unknown>;
}
export interface OpenCodeV2SessionContextEvent {
    readonly sessionID: string;
    readonly agent?: string;
    readonly model: OpenCodeV2ModelRef;
    system: OpenCodeV2SystemPart[];
    messages: unknown[];
    options: Record<string, unknown>;
}
export interface OpenCodeV2SessionModelRequestEvent {
    readonly sessionID: string;
    readonly agent: string;
    readonly model: OpenCodeV2ModelRef;
    readonly kind: OpenCodeV2SessionRequestKind;
    baseURL?: string;
    headers: Record<string, string>;
}
export type OpenCodeV2SessionRetryDecision = {
    retry: false;
} | {
    retry: true;
    delay: number;
};
export interface OpenCodeV2StructuredError {
    readonly type: string;
    readonly message: string;
    readonly status?: number;
    readonly response?: {
        readonly body: string;
    };
    readonly retryAfterMs?: number;
}
export interface OpenCodeV2SessionRetryEvent {
    readonly sessionID: string;
    readonly agent: string;
    readonly model: OpenCodeV2ModelRef;
    readonly error: OpenCodeV2StructuredError;
    readonly attempt: number;
    decision: OpenCodeV2SessionRetryDecision;
}
export interface OpenCodeV2SessionHooks {
    readonly context: OpenCodeV2SessionContextEvent;
    readonly generate: OpenCodeV2SessionContextEvent;
    readonly compaction: OpenCodeV2SessionContextEvent;
    readonly "model.request": OpenCodeV2SessionModelRequestEvent;
    readonly retry: OpenCodeV2SessionRetryEvent;
}
export interface OpenCodeV2SessionInfo {
    readonly id?: string;
    readonly fork?: {
        readonly sessionID: string;
    };
    readonly [key: string]: unknown;
}
export interface OpenCodeV2SessionDomain {
    readonly get?: (input: {
        sessionID: string;
    }) => Promise<OpenCodeV2SessionInfo | {
        data?: OpenCodeV2SessionInfo;
    } | undefined>;
    readonly hook: <K extends keyof OpenCodeV2SessionHooks>(name: K, handler: (event: OpenCodeV2SessionHooks[K]) => Promise<void> | void, options?: {
        readonly providerID?: string;
        readonly modelID?: string;
    }) => Promise<OpenCodeV2Registration> | OpenCodeV2Registration | void;
}
export interface OpenCodeV2AgentDomain {
    readonly get?: (input: {
        agentID: string;
    }) => Promise<{
        data?: {
            system?: string;
        };
    } | undefined>;
}
export interface OpenCodeV2PermissionAssertInput {
    readonly sessionID: string;
    readonly agent?: string;
    readonly action: string;
    readonly resources: ReadonlyArray<string>;
    readonly save?: ReadonlyArray<string>;
    readonly metadata?: Record<string, unknown>;
    readonly source?: {
        readonly type: "tool";
        readonly messageID: string;
        readonly id: string;
    };
}
export interface OpenCodeV2PermissionDomain {
    readonly assert?: (input: OpenCodeV2PermissionAssertInput) => Promise<void>;
}
export interface OpenCodeV2StorageDomain {
    readonly get: (key: string) => Promise<unknown>;
    readonly set: (key: string, value: unknown) => Promise<void>;
    readonly remove: (key: string) => Promise<void>;
    readonly scan?: (options: {
        readonly prefix: string;
        readonly after?: string;
        readonly limit?: number;
    }) => Promise<{
        readonly entries: ReadonlyArray<{
            key: string;
            value: unknown;
        }>;
        readonly next?: string;
    }>;
}
export interface OpenCodeV2EventDomain {
    readonly subscribe: (options?: {
        readonly types?: ReadonlyArray<string>;
    }) => AsyncIterable<{
        readonly type: string;
        readonly data?: Record<string, unknown>;
    }>;
}
export interface OpenCodeV2PluginLocation {
    readonly directory?: string;
    readonly worktree?: string;
    readonly root?: string;
    readonly workspace?: string;
}
export interface OpenCodeV2WebSearchProviderInput {
    readonly query: string;
}
export interface OpenCodeV2WebSearchResult {
    readonly url: string;
    readonly title?: string;
    readonly content?: string;
    readonly time: {
        readonly published?: number;
    };
}
export interface OpenCodeV2WebSearchDefinition {
    readonly id: string;
    readonly name: string;
    readonly execute: (input: OpenCodeV2WebSearchProviderInput, context: {
        readonly signal: AbortSignal;
    }) => Promise<readonly OpenCodeV2WebSearchResult[]>;
}
export interface OpenCodeV2WebSearchEditor {
    add(definition: OpenCodeV2WebSearchDefinition): void;
    readonly default: {
        get(): string | false | undefined;
        set(selection: string | false): void;
    };
}
export interface OpenCodeV2WebSearchDomain extends OpenCodeV2TransformRegistry<OpenCodeV2WebSearchEditor> {
    readonly providers?: () => Promise<unknown>;
    readonly query?: (input: {
        query: string;
        providerID?: string;
    }) => Promise<unknown>;
}
export interface OpenCodeV2WebSearchOptions {
    readonly enabled?: boolean;
    readonly default?: boolean;
    readonly model?: string;
}
export interface OpenCodeV2PluginOptions {
    /** Optional custom path to the `agy` binary (defaults to `OPENCODE_AGY_PATH` or `agy` in PATH). */
    readonly binaryPath?: string;
    /** Optional isolated Gemini directory (`--gemini-dir`). When omitted, uses default `~/.gemini`. */
    readonly geminiDir?: string;
    /** Relative `--app-data-dir` name under `geminiDir` (must never be an absolute path). */
    readonly appDataDir?: string;
    /** Tool execution mode: `"opencode"` (default, bridges all OpenCode tools via MCP) or `"hybrid"`. */
    readonly toolMode?: AgyToolMode;
    /** Enable Application Default Credentials (`AGY_ADC_AUTH=true`) for Gemini Enterprise Agent Platform. */
    readonly adcAuth?: boolean;
    /** Optional explicit Google Cloud project ID (`GOOGLE_CLOUD_PROJECT` / `AGY_ACP_CCPA_PROJECT`). */
    readonly projectId?: string;
    /** Controls `AGY_CLI_AUTO_COMPACT_OVERRIDE` (defaults to `"off"` so OpenCode manages compaction). */
    readonly autoCompactOverride?: string;
    /** Whether to load `agy` default skills/customizations (`--include-default-customizations`). */
    readonly includeDefaultCustomizations?: boolean;
    /** Stream inactivity timeout in ms before SQLite `step_type = 17` stall check triggers. */
    readonly watchdogTimeoutMs?: number;
    /** Skip background startup probe (primarily for deterministic unit tests). */
    readonly skipInitialProbe?: boolean;
    /** Enabled by default. Set to `false` (or `{ enabled: false }`) to opt out of Antigravity web search. */
    readonly webSearch?: boolean | OpenCodeV2WebSearchOptions;
    readonly [key: string]: unknown;
}
export interface OpenCodeV2PluginContext {
    readonly provider?: OpenCodeV2ProviderDomain;
    readonly model?: OpenCodeV2TransformRegistry<OpenCodeV2ModelEditor>;
    readonly integration: OpenCodeV2IntegrationDomain;
    readonly session: OpenCodeV2SessionDomain;
    readonly aisdk?: OpenCodeV2AISDKDomain;
    readonly agent?: OpenCodeV2AgentDomain;
    readonly permission?: OpenCodeV2PermissionDomain;
    readonly storage?: OpenCodeV2StorageDomain;
    readonly event?: OpenCodeV2EventDomain;
    readonly websearch?: OpenCodeV2WebSearchDomain;
    readonly options?: OpenCodeV2PluginOptions;
    readonly location?: OpenCodeV2PluginLocation;
    readonly [key: string]: unknown;
}
export type OpenCodeV2Cleanup = () => Promise<void> | void;
export interface OpenCodeV2PluginDefinition {
    readonly id: string;
    readonly setup: (ctx: OpenCodeV2PluginContext) => Promise<OpenCodeV2Cleanup | void> | OpenCodeV2Cleanup | void;
}
export interface DualOpenCodePlugin extends OpenCodeV2PluginDefinition {
    readonly server?: (input: unknown) => Promise<unknown>;
    readonly [key: string]: unknown;
}
export declare function defineOpenCodeV2Plugin(def: OpenCodeV2PluginDefinition): OpenCodeV2PluginDefinition;
