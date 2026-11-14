export declare const AGY_PROVIDER_ID = "google-agy";
export declare const AGY_PROVIDER_NAME = "Antigravity CLI";
/**
 * OpenCode v2 requires the `aisdk:` prefix on `provider.package` / `model.package`
 * so `ModelResolver` routes resolution through `ctx.aisdk.hook("sdk")` (passing
 * the stripped `@opencode-agy/acp` package name to the hook).
 */
export declare const AGY_ACP_PACKAGE = "@opencode-agy/acp";
export declare const AGY_AISDK_PACKAGE = "aisdk:@opencode-agy/acp";
export declare const AGY_DEFAULT_BINARY = "agy";
export declare const AGY_DEFAULT_APP_DATA_DIR = "antigravity-cli";
export declare const AGY_ISOLATED_APP_DATA_DIR = "antigravity-acp";
export declare const AGY_LOGIN_METHOD_ID = "agy-login";
export declare const AGY_EXTERNAL_METHOD_ID = "agy-cli";
export declare const AGY_HEADER_REQUEST_KIND = "x-opencode-agy-kind";
export declare const AGY_HEADER_SESSION_ID = "x-opencode-session-id";
export declare const AGY_HEADER_FORK_SOURCE = "x-opencode-agy-fork-source";
export declare const AGY_OPTION_AGENT_SYSTEM = "agyAgentSystem";
export declare const AGY_OPTION_INSTRUCTIONS = "agySessionInstructions";
export declare const AGY_STORAGE_CATALOG_KEY = "agy-acp-catalog-v1";
export declare const AGY_STORAGE_AUTH_STATUS_KEY = "agy-acp-auth-v1";
export declare const AGY_STORAGE_SESSION_PREFIX = "sessions/";
