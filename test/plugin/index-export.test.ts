import { describe, it, expect, vi } from "vitest";
import pluginDefault, {
  AGY_PROVIDER_ID,
  STATIC_MODELS_SIMPLE,
  TIER_MAPPING,
  createV2PluginDefinition,
  resolveModelTier,
  resolveModelVariants,
  setupOpenCodeV2,
  v2PluginDefinition,
} from "../../index";
import type { OpenCodeV2PluginContext } from "../../src/plugin/types";

describe("index entrypoint pure OpenCode v2 export", () => {
  it("exports pure OpenCode v2 plugin object as default export", () => {
    expect(pluginDefault).toBeDefined();
    expect(pluginDefault.id).toBe(AGY_PROVIDER_ID);
    expect(pluginDefault.setup).toBe(setupOpenCodeV2);
    expect(pluginDefault).toBe(v2PluginDefinition);
    expect(createV2PluginDefinition()).toBe(v2PluginDefinition);
  });

  it("exports model catalog and tier resolution helpers without v1 or quota bloat", () => {
    expect(Object.keys(STATIC_MODELS_SIMPLE)).toContain("gemini-3.8-flash");
    expect(TIER_MAPPING["gemini-4-hydrogen"]?.xhigh).toBeDefined();
    expect(resolveModelTier("gemini-4-hydrogen", { headers: { "x-agy-tier": "xhigh" } })).toBe(
      "gemini-4-hydrogen-xhigh",
    );
    expect(resolveModelVariants("gemini-3.8-flash")).toEqual([
      { id: "low", headers: { "x-agy-tier": "low" } },
      { id: "medium", headers: { "x-agy-tier": "medium" } },
      { id: "high", headers: { "x-agy-tier": "high" } },
    ]);
  });

  it("invokes setupOpenCodeV2 and returns cleanup callback", async () => {
    const mockCtx: OpenCodeV2PluginContext = {
      integration: {
        transform: vi.fn(async () => {}),
      },
      provider: {
        transform: vi.fn(async () => {}),
      },
      session: {
        hook: vi.fn(async () => {}),
      },
      location: {
        root: "/test",
        workspace: "/test/workspace",
      },
    };

    const cleanup = await pluginDefault.setup(mockCtx);
    expect(typeof cleanup).toBe("function");
    expect(mockCtx.integration.transform).toHaveBeenCalledTimes(1);
    expect(mockCtx.provider.transform).toHaveBeenCalledTimes(1);
    expect(mockCtx.session.hook).toHaveBeenCalledTimes(3);
    await cleanup();
  });
});
