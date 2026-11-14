import {
  AGY_ACP_PACKAGE,
  AGY_AISDK_PACKAGE,
  AGY_PROVIDER_ID,
  AGY_PROVIDER_NAME,
} from "./src/constants";
import {
  AGY_WEBSEARCH_PROVIDER_ID,
  AGY_WEBSEARCH_PROVIDER_NAME,
  STATIC_MODELS_SIMPLE,
  TIER_MAPPING,
  buildWebSearchPrompt,
  createV2PluginDefinition,
  executeAgyWebSearch,
  parseAgyWebSearchOutput,
  registerV2WebSearch,
  resolveModelTier,
  resolveModelVariants,
  resolveWebSearchConfig,
  setupOpenCodeV2,
  v2PluginDefinition,
} from "./src/plugin/v2";

export {
  AGY_ACP_PACKAGE,
  AGY_AISDK_PACKAGE,
  AGY_PROVIDER_ID,
  AGY_PROVIDER_NAME,
  AGY_WEBSEARCH_PROVIDER_ID,
  AGY_WEBSEARCH_PROVIDER_NAME,
  STATIC_MODELS_SIMPLE,
  TIER_MAPPING,
  buildWebSearchPrompt,
  createV2PluginDefinition,
  executeAgyWebSearch,
  parseAgyWebSearchOutput,
  registerV2WebSearch,
  resolveModelTier,
  resolveModelVariants,
  resolveWebSearchConfig,
  setupOpenCodeV2,
  v2PluginDefinition,
};

export * from "./src/acp/auth";
export * from "./src/acp/catalog";
export * from "./src/acp/client";
export * from "./src/acp/language-model";
export * from "./src/acp/mcp-bridge";
export * from "./src/acp/sessions";
export * from "./src/acp/turn-outcome";
export * from "./src/acp/types";
export * from "./src/plugin/types";

export default v2PluginDefinition;
