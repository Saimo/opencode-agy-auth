export interface OAuthAuthDetails {
  type: "oauth";
  refresh: string;
  access: string;
  expires: number;
  metadata?: Record<string, unknown>;
}

export interface ApiKeyAuthDetails {
  type: "api" | "key";
  key?: string;
}

export type AuthDetails = OAuthAuthDetails | ApiKeyAuthDetails | { type: string; [key: string]: unknown };
export type GetAuth = () => Promise<AuthDetails>;

export interface Provider {
  id?: string;
  options?: {
    projectId?: string;
    thinkingConfig?: unknown;
    [key: string]: unknown;
  };
  settings?: {
    projectId?: string;
    thinkingConfig?: unknown;
    [key: string]: unknown;
  };
  models?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

export interface Config {
  provider?: Record<
    string,
    {
      options?: { projectId?: string; [key: string]: unknown };
      settings?: { projectId?: string; [key: string]: unknown };
      [key: string]: unknown;
    }
  >;
  [key: string]: unknown;
}

export interface PluginClient {
  auth: {
    set(input: { path: { id: string }; body: OAuthAuthDetails }): Promise<unknown>;
  };
  config?: {
    get?: () => Promise<{ data?: Config }>;
  };
}

export interface RefreshParts {
  refreshToken: string;
  projectId?: string;
  managedProjectId?: string;
}

export interface ProjectContextResult {
  auth: OAuthAuthDetails;
  effectiveProjectId: string;
}

// ============================================================================
// OpenCode v2 Native Promise Plugin Contracts (@opencode/plugin compatible)
// ============================================================================

export interface OpenCodeV2Registration {
  readonly dispose: () => Promise<void>;
}

export interface OpenCodeV2TransformRegistry<Editor = unknown> {
  readonly transform: (
    callback: (editor: Editor) => void,
  ) => Promise<OpenCodeV2Registration> | OpenCodeV2Registration | void;
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
  tier?: { type: "context"; size: number };
  input: number;
  output: number;
  cache: { read: number; write: number };
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
  time: { released: number };
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
  list(): readonly OpenCodeV2ProviderRecord[];
  get(providerID: string): OpenCodeV2ProviderRecord | undefined;
  add(input: {
    info: OpenCodeV2ProviderInfo;
    models: readonly OpenCodeV2ModelInfo[];
    sourceConnection?: OpenCodeV2ConnectionInfo;
  }): void;
  update(providerID: string, update: (provider: OpenCodeV2ProviderInfo) => void): void;
  remove(providerID: string): void;
  readonly models: {
    set(providerID: string, models: readonly OpenCodeV2ModelInfo[]): void;
    update(providerID: string, modelID: string, update: (model: OpenCodeV2ModelInfo) => void): void;
    remove(providerID: string, modelID: string): void;
  };
}

export interface OpenCodeV2ModelEditor {
  list(): readonly OpenCodeV2ModelInfo[];
  get(providerID: string, modelID: string): OpenCodeV2ModelInfo | undefined;
  update(providerID: string, modelID: string, update: (model: OpenCodeV2ModelInfo) => void): void;
  remove(providerID: string, modelID: string): void;
}

export interface OpenCodeV2OAuthCredential {
  type: "oauth";
  methodID: string;
  refresh: string;
  access: string;
  expires: number;
  metadata?: Record<string, unknown>;
}

export interface OpenCodeV2ConnectionInfo {
  readonly id: string;
  readonly integrationID?: string;
  readonly label?: string;
  readonly [key: string]: unknown;
}

export interface OpenCodeV2OAuthAuthorization {
  readonly url: string;
  readonly instructions: string;
  readonly expiresAt?: number;
  readonly mode: "code";
  readonly callback: (code: string) => Promise<OpenCodeV2OAuthCredential>;
}

export interface OpenCodeV2OAuthMethodRegistration {
  readonly integrationID: string;
  readonly method: {
    readonly id: string;
    readonly type: "oauth";
    readonly label: string;
  };
  readonly authorize: (answer?: Record<string, unknown>) => Promise<OpenCodeV2OAuthAuthorization>;
  readonly refresh?: (credential: OpenCodeV2OAuthCredential) => Promise<OpenCodeV2OAuthCredential>;
  readonly label?: (credential: OpenCodeV2OAuthCredential) => string | undefined;
}

export interface OpenCodeV2IntegrationEditor {
  update(id: string, update: (integration: { id: string; name: string }) => void): void;
  readonly method: {
    update(input: OpenCodeV2OAuthMethodRegistration): void;
  };
}

export interface OpenCodeV2IntegrationDomain extends OpenCodeV2TransformRegistry<OpenCodeV2IntegrationEditor> {
  readonly connection?: {
    readonly active: (integrationID: string) => Promise<OpenCodeV2ConnectionInfo | undefined>;
    readonly resolve: (
      connection: OpenCodeV2ConnectionInfo,
    ) => Promise<OpenCodeV2OAuthCredential | { type: string; [key: string]: unknown } | undefined>;
  };
}

export interface OpenCodeV2ModelRef {
  readonly id: string;
  readonly providerID: string;
  readonly variant?: string;
}

export type OpenCodeV2SessionRequestKind = "primary" | "compaction" | "title" | "generate";

export interface OpenCodeV2SessionHttpRequest {
  readonly sessionID: string;
  readonly agent: string;
  readonly model: OpenCodeV2ModelRef;
  readonly kind: OpenCodeV2SessionRequestKind;
  request: Request;
}

export interface OpenCodeV2SessionHttpResponse {
  readonly sessionID: string;
  readonly agent: string;
  readonly model: OpenCodeV2ModelRef;
  readonly kind: OpenCodeV2SessionRequestKind;
  readonly request: Request;
  response: Response;
}

export type OpenCodeV2SessionRetryDecision = { retry: false } | { retry: true; delay: number };

export interface OpenCodeV2StructuredError {
  readonly type: string;
  readonly message: string;
  readonly status?: number;
  readonly response?: { readonly body: string };
  readonly retryAfterMs?: number;
}

export interface OpenCodeV2SessionRetry {
  readonly sessionID: string;
  readonly agent: string;
  readonly model: OpenCodeV2ModelRef;
  readonly error: OpenCodeV2StructuredError;
  readonly attempt: number;
  decision: OpenCodeV2SessionRetryDecision;
}

export interface OpenCodeV2SessionHooks {
  readonly "http.request": OpenCodeV2SessionHttpRequest;
  readonly "http.response": OpenCodeV2SessionHttpResponse;
  readonly retry: OpenCodeV2SessionRetry;
}

export interface OpenCodeV2SessionDomain {
  readonly hook: <K extends keyof OpenCodeV2SessionHooks>(
    name: K,
    handler: (event: OpenCodeV2SessionHooks[K]) => Promise<void> | void,
    options?: { readonly providerID?: string; readonly modelID?: string },
  ) => Promise<OpenCodeV2Registration> | OpenCodeV2Registration | void;
}

export interface OpenCodeV2PluginLocation {
  readonly directory?: string;
  readonly worktree?: string;
  readonly root?: string;
  readonly workspace?: string;
}

export interface OpenCodeV2PluginOptions {
  readonly projectId?: string;
  readonly [key: string]: unknown;
}

export interface OpenCodeV2PluginContext {
  readonly provider: OpenCodeV2TransformRegistry<OpenCodeV2ProviderEditor>;
  readonly model?: OpenCodeV2TransformRegistry<OpenCodeV2ModelEditor>;
  readonly integration: OpenCodeV2IntegrationDomain;
  readonly session: OpenCodeV2SessionDomain;
  readonly options?: OpenCodeV2PluginOptions;
  readonly location?: OpenCodeV2PluginLocation;
}

export type OpenCodeV2Cleanup = () => Promise<void> | void;

export interface OpenCodeV2PluginDefinition {
  readonly id: string;
  readonly setup: (ctx: OpenCodeV2PluginContext) => Promise<OpenCodeV2Cleanup | void> | OpenCodeV2Cleanup | void;
}

export function defineOpenCodeV2Plugin(
  def: OpenCodeV2PluginDefinition,
): OpenCodeV2PluginDefinition {
  return def;
}
