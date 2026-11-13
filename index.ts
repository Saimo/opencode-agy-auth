import { AGY_PROVIDER_ID } from "./src/constants";
import {
  setupOpenCodeV2,
  v2PluginDefinition,
  createV2PluginDefinition,
  STATIC_MODELS_SIMPLE,
  TIER_MAPPING,
  resolveModelTier,
  resolveModelVariants,
} from "./src/plugin/v2";

export {
  AGY_PROVIDER_ID,
  setupOpenCodeV2,
  v2PluginDefinition,
  createV2PluginDefinition,
  STATIC_MODELS_SIMPLE,
  TIER_MAPPING,
  resolveModelTier,
  resolveModelVariants,
};
export * from "./src/plugin/types";

export default v2PluginDefinition;
