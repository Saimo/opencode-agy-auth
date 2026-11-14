export const AGY_PROVIDER_ID = "google-agy";
export const AGY_PROVIDER_NAME = "Antigravity CLI";

/**
 * OpenCode v2 requires the `aisdk:` prefix on `provider.package` / `model.package`
 * so `ModelResolver` routes resolution through `ctx.aisdk.hook("sdk")` (passing
 * the stripped `@opencode-agy/acp` package name to the hook).
 */
export const AGY_ACP_PACKAGE = "@opencode-agy/acp";
export const AGY_AISDK_PACKAGE = `aisdk:${AGY_ACP_PACKAGE}`;

export const AGY_DEFAULT_BINARY = "agy";
export const AGY_DEFAULT_APP_DATA_DIR = "antigravity-cli";
export const AGY_ISOLATED_APP_DATA_DIR = "antigravity-acp";

export const AGY_LOGIN_METHOD_ID = "agy-login";
export const AGY_EXTERNAL_METHOD_ID = "agy-cli";

export const AGY_HEADER_REQUEST_KIND = "x-opencode-agy-kind";
export const AGY_HEADER_SESSION_ID = "x-opencode-session-id";
export const AGY_HEADER_FORK_SOURCE = "x-opencode-agy-fork-source";

export const AGY_OPTION_AGENT_SYSTEM = "agyAgentSystem";
export const AGY_OPTION_INSTRUCTIONS = "agySessionInstructions";

export const AGY_STORAGE_CATALOG_KEY = "agy-acp-catalog-v1";
export const AGY_STORAGE_AUTH_STATUS_KEY = "agy-acp-auth-v1";
export const AGY_STORAGE_SESSION_PREFIX = "sessions/";
