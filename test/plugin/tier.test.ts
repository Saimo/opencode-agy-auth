import { describe, expect, it } from 'vitest';
import { resolveModelTier, STATIC_MODELS_SIMPLE, TIER_MAPPING } from '../../src/plugin/tier';
import { getModelEnum } from '../../src/sdk/request/prepare';

describe('plugin/tier', () => {
  it('exports STATIC_MODELS_SIMPLE and TIER_MAPPING with all agy models including Carbon and Orchestrator', () => {
    expect(STATIC_MODELS_SIMPLE['gemini-4-carbon']).toBeDefined();
    expect(STATIC_MODELS_SIMPLE['gemini-pro-orchestrator']).toBeDefined();
    expect(STATIC_MODELS_SIMPLE['gemini-pro-orchestrator-argon']).toBeDefined();
    expect(STATIC_MODELS_SIMPLE['gemini-3.5-flash-lite']).toBeDefined();
    expect(STATIC_MODELS_SIMPLE['gemini-3.1-flash-lite']).toBeDefined();
    expect(STATIC_MODELS_SIMPLE['gemini-3-flash']).toBeDefined();
    expect(STATIC_MODELS_SIMPLE['gemini-2.5-pro']).toBeDefined();
    expect(STATIC_MODELS_SIMPLE['gemini-2.5-flash']).toBeDefined();
    expect(STATIC_MODELS_SIMPLE['gemini-2.5-flash-lite']).toBeDefined();

    expect(TIER_MAPPING['gemini-4-carbon']).toEqual({
      low: 'gemini-4-carbon-low',
      medium: 'gemini-4-carbon-medium',
      high: 'gemini-4-carbon-high',
    });
    expect(getModelEnum('gemini-4-carbon-low')).toBe('MODEL_PLACEHOLDER_M438');
    expect(getModelEnum('gemini-4-carbon-medium')).toBe('MODEL_PLACEHOLDER_M437');
    expect(getModelEnum('gemini-4-carbon-high')).toBe('MODEL_PLACEHOLDER_M427');
    expect(getModelEnum('gemini-pro-orchestrator')).toBe('MODEL_PLACEHOLDER_M667');
    expect(getModelEnum('gemini-pro-orchestrator-argon')).toBe('MODEL_PLACEHOLDER_M668');

    expect(TIER_MAPPING['gemini-3.8-flash']).toBeDefined();
    expect(TIER_MAPPING['gemini-3.8-flash'].low).toBe('gemini-3.8-flash-low');
    expect(TIER_MAPPING['gemini-3.8-flash'].medium).toBe('gemini-3.8-flash-medium');
    expect(TIER_MAPPING['gemini-3.8-flash'].high).toBe('gemini-3.8-flash-high');
    expect(TIER_MAPPING['gemini-4-argon']).toBeDefined();
    expect(TIER_MAPPING['gemini-4-argon'].low).toBe('gemini-4-argon-low');
    expect(TIER_MAPPING['gemini-4-argon'].medium).toBe('gemini-4-argon-medium');
    expect(TIER_MAPPING['gemini-4-argon'].high).toBe('gemini-4-argon-high');
    expect(TIER_MAPPING['gemini-4-hydrogen']).toBeDefined();
    expect(TIER_MAPPING['gemini-4-hydrogen'].low).toBe('gemini-4-hydrogen-low');
    expect(TIER_MAPPING['gemini-4-hydrogen'].medium).toBe('gemini-4-hydrogen-medium');
    expect(TIER_MAPPING['gemini-4-hydrogen'].high).toBe('gemini-4-hydrogen-high');
    expect(TIER_MAPPING['gemini-4-hydrogen'].xhigh).toBe('gemini-4-hydrogen-xhigh');
  });

  it('returns unmapped model unchanged', () => {
    expect(resolveModelTier('claude-3-5-sonnet')).toBe('claude-3-5-sonnet');
    expect(resolveModelTier('gemini-pro-orchestrator')).toBe('gemini-pro-orchestrator');
  });

  it('defaults to medium when no tier requested', () => {
    expect(resolveModelTier('gemini-4-carbon')).toBe('gemini-4-carbon-medium');
    expect(resolveModelTier('gemini-3.8-flash')).toBe('gemini-3.8-flash-medium');
    expect(resolveModelTier('gemini-4-argon')).toBe('gemini-4-argon-medium');
  });

  it('resolves tier from model suffix (@low, @high)', () => {
    expect(resolveModelTier('gemini-4-carbon@low')).toBe('gemini-4-carbon-low');
    expect(resolveModelTier('gemini-4-carbon@high')).toBe('gemini-4-carbon-high');
    expect(resolveModelTier('gemini-3.8-flash@low')).toBe('gemini-3.8-flash-low');
    expect(resolveModelTier('gemini-3.8-flash@high')).toBe('gemini-3.8-flash-high');
    expect(resolveModelTier('gemini-3.8-flash@medium')).toBe('gemini-3.8-flash-medium');
    expect(resolveModelTier('gemini-4-hydrogen@xhigh')).toBe('gemini-4-hydrogen-xhigh');
  });

  it('resolves tier from RequestInit headers', () => {
    const init: RequestInit = {
      headers: { 'x-agy-tier': 'low' },
    };
    expect(resolveModelTier('gemini-3.8-flash', init)).toBe('gemini-3.8-flash-low');
  });

  it('resolves tier from direct Headers object', () => {
    const headers = new Headers({ 'x-agy-tier': 'high' });
    expect(resolveModelTier('gemini-3.8-flash', headers)).toBe('gemini-3.8-flash-high');
  });

  it('prefers header tier over suffix tier', () => {
    const init: RequestInit = {
      headers: { 'x-agy-tier': 'high' },
    };
    expect(resolveModelTier('gemini-3.8-flash@low', init)).toBe('gemini-3.8-flash-high');
  });

  it('defaults to medium if unknown tier requested', () => {
    expect(resolveModelTier('gemini-3.8-flash@ultra')).toBe('gemini-3.8-flash-medium');
  });
});
