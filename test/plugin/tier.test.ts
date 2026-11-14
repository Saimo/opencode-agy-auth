import { afterEach, describe, expect, it } from "vitest";
import {
  STATIC_MODELS_SIMPLE,
  TIER_MAPPING,
  getStaticModelEfforts,
  registerDynamicTierVariant,
  resetDynamicTierMappingsForTesting,
  resolveModelTier,
} from "../../src/plugin/tier";

describe("plugin/tier", () => {
  afterEach(() => {
    resetDynamicTierMappingsForTesting();
  });

  it("exports STATIC_MODELS_SIMPLE and TIER_MAPPING with all cold-start agy models", () => {
    expect(STATIC_MODELS_SIMPLE["gemini-4-carbon"]).toBeDefined();
    expect(STATIC_MODELS_SIMPLE["gemini-4-argon"]).toBeDefined();
    expect(STATIC_MODELS_SIMPLE["gemini-4-hydrogen"]).toBeDefined();
    expect(STATIC_MODELS_SIMPLE["gemini-pro-orchestrator"]).toBeDefined();
    expect(STATIC_MODELS_SIMPLE["gemini-pro-orchestrator-argon"]).toBeDefined();
    expect(STATIC_MODELS_SIMPLE["gemini-3.8-flash"]).toBeDefined();
    expect(STATIC_MODELS_SIMPLE["gemini-3.5-flash-lite"]).toBeDefined();
    expect(STATIC_MODELS_SIMPLE["gemini-3.1-flash-lite"]).toBeDefined();
    expect(STATIC_MODELS_SIMPLE["gemini-3-flash"]).toBeDefined();
    expect(STATIC_MODELS_SIMPLE["gemini-2.5-pro"]).toBeDefined();
    expect(STATIC_MODELS_SIMPLE["gemini-2.5-flash"]).toBeDefined();
    expect(STATIC_MODELS_SIMPLE["gemini-2.5-flash-lite"]).toBeDefined();
    expect(STATIC_MODELS_SIMPLE["claude-opus-5-5"]).toBeDefined();
    expect(STATIC_MODELS_SIMPLE["claude-sonnet-5-5"]).toBeDefined();
    expect(STATIC_MODELS_SIMPLE["gpt-oss-120b-medium"]).toBeDefined();

    expect(TIER_MAPPING["gemini-4-carbon"]).toEqual({
      low: "gemini-4-carbon-low",
      medium: "gemini-4-carbon-medium",
      high: "gemini-4-carbon-high",
    });
    expect(getStaticModelEfforts("gemini-4-hydrogen")).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
  });

  it("returns unmapped model unchanged", () => {
    expect(resolveModelTier("claude-3-5-sonnet")).toBe("claude-3-5-sonnet");
    expect(resolveModelTier("gemini-pro-orchestrator")).toBe("gemini-pro-orchestrator");
  });

  it("defaults to medium when no tier requested", () => {
    expect(resolveModelTier("gemini-4-carbon")).toBe("gemini-4-carbon-medium");
    expect(resolveModelTier("gemini-3.8-flash")).toBe("gemini-3.8-flash-medium");
    expect(resolveModelTier("gemini-4-argon")).toBe("gemini-4-argon-medium");
  });

  it("resolves tier from model suffix (@low, @high, @xhigh) and headers", () => {
    expect(resolveModelTier("gemini-4-carbon@low")).toBe("gemini-4-carbon-low");
    expect(resolveModelTier("gemini-4-carbon@high")).toBe("gemini-4-carbon-high");
    expect(resolveModelTier("gemini-4-hydrogen@xhigh")).toBe("gemini-4-hydrogen-xhigh");
    expect(
      resolveModelTier("gemini-3.8-flash", { headers: { "x-agy-tier": "low" } }),
    ).toBe("gemini-3.8-flash-low");
    expect(
      resolveModelTier("gemini-3.8-flash@low", new Headers({ "x-agy-tier": "high" })),
    ).toBe("gemini-3.8-flash-high");
    expect(resolveModelTier("gemini-3.8-flash@ultra")).toBe("gemini-3.8-flash-medium");
  });

  it("registers dynamic tier variants discovered from agy acp", () => {
    expect(
      registerDynamicTierVariant("gemini-4-neon", "max", "gemini-4-neon-max"),
    ).toBe(true);
    expect(
      resolveModelTier("gemini-4-neon", { headers: { "x-agy-tier": "max" } }),
    ).toBe("gemini-4-neon-max");
  });
});
