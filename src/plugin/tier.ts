import { getSafeHeader } from './headers';

export interface SimpleStaticModel {
  name: string;
  description: string;
  maxTokens: number;
  maxOutputTokens: number;
  toolCall: boolean;
  reasoning: boolean;
  attachment: boolean;
  cost?: {
    input: number;
    output: number;
    cache?: { read: number; write: number };
  };
}

export const STATIC_MODELS_SIMPLE: Record<string, SimpleStaticModel> = {
  'gemini-4-carbon': {
    name: 'Gemini 4 Carbon',
    description: 'Gemini 4 Carbon flagship reasoning model. Select tier at runtime.',
    maxTokens: 1048576,
    maxOutputTokens: 262144,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  'gemini-4-argon': {
    name: 'Gemini 4 Argon',
    description: 'Gemini 4 Argon base model. Select tier at runtime.',
    maxTokens: 1048576,
    maxOutputTokens: 65536,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  'gemini-4-hydrogen': {
    name: 'Gemini 4 Hydrogen',
    description: 'Gemini 4 Hydrogen base model. Select tier at runtime.',
    maxTokens: 1048576,
    maxOutputTokens: 262144,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  'gemini-pro-orchestrator': {
    name: 'Orchestrator (Carbon)',
    description: 'Antigravity multi-agent orchestrator powered by Gemini 4 Carbon.',
    maxTokens: 1048576,
    maxOutputTokens: 262144,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  'gemini-pro-orchestrator-argon': {
    name: 'Orchestrator (Argon)',
    description: 'Antigravity multi-agent orchestrator powered by Gemini 4 Argon.',
    maxTokens: 1048576,
    maxOutputTokens: 65536,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  'gemini-3.8-flash': {
    name: 'Gemini 3.8 Flash',
    description: 'Gemini 3.8 Flash base model. Select tier at runtime.',
    maxTokens: 1048576,
    maxOutputTokens: 65536,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  'gemini-3.5-flash-lite': {
    name: 'Gemini 3.5 Flash Lite',
    description: 'Fast, lightweight Gemini 3.5 Flash Lite model.',
    maxTokens: 1048576,
    maxOutputTokens: 65535,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  'gemini-3.1-flash-lite': {
    name: 'Gemini 3.1 Flash Lite',
    description: 'Fast, lightweight Gemini 3.1 Flash Lite model.',
    maxTokens: 1048576,
    maxOutputTokens: 65535,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  'gemini-3-flash': {
    name: 'Gemini 3 Flash',
    description: 'Gemini 3 Flash high-throughput multimodal model.',
    maxTokens: 1048576,
    maxOutputTokens: 65536,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  'gemini-2.5-pro': {
    name: 'Gemini 2.5 Pro',
    description: 'Gemini 2.5 Pro reasoning model.',
    maxTokens: 1048576,
    maxOutputTokens: 65535,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  'gemini-2.5-flash': {
    name: 'Gemini 2.5 Flash',
    description: 'Gemini 2.5 Flash fast multimodal model.',
    maxTokens: 1048576,
    maxOutputTokens: 65535,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  'gemini-2.5-flash-lite': {
    name: 'Gemini 2.5 Flash Lite',
    description: 'Gemini 2.5 Flash Lite lightweight chat model.',
    maxTokens: 1048576,
    maxOutputTokens: 65535,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  'claude-opus-5-5': {
    name: 'Claude Opus 5.5',
    description: 'Claude Opus 5.5 deep reasoning model. Select tier at runtime.',
    maxTokens: 1000000,
    maxOutputTokens: 128000,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  'claude-sonnet-5-5': {
    name: 'Claude Sonnet 5.5',
    description: 'Claude Sonnet 5.5 deep reasoning model. Select tier at runtime.',
    maxTokens: 1000000,
    maxOutputTokens: 128000,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  'gpt-oss-120b-medium': {
    name: 'GPT-OSS 120B (Medium)',
    description: 'GPT open-source 120B parameter medium tier model.',
    maxTokens: 131072,
    maxOutputTokens: 32768,
    toolCall: true,
    reasoning: true,
    attachment: false
  }
};

export const TIER_MAPPING: Record<string, { low?: string; high?: string; medium?: string; minimal?: string; xhigh?: string } & Record<string, string | undefined>> = {
  'gemini-4-carbon': {
    low: 'gemini-4-carbon-low',
    medium: 'gemini-4-carbon-medium',
    high: 'gemini-4-carbon-high'
  },
  'gemini-4-argon': {
    low: 'gemini-4-argon-low',
    medium: 'gemini-4-argon-medium',
    high: 'gemini-4-argon-high'
  },
  'gemini-4-hydrogen': {
    low: 'gemini-4-hydrogen-low',
    medium: 'gemini-4-hydrogen-medium',
    high: 'gemini-4-hydrogen-high',
    xhigh: 'gemini-4-hydrogen-xhigh'
  },
  'gemini-3.8-flash': {
    low: 'gemini-3.8-flash-low',
    medium: 'gemini-3.8-flash-medium',
    high: 'gemini-3.8-flash-high'
  },
  'claude-opus-5-5': {
    low: 'claude-opus-5-5-low',
    medium: 'claude-opus-5-5-medium',
    high: 'claude-opus-5-5-high'
  },
  'claude-sonnet-5-5': {
    low: 'claude-sonnet-5-5-low',
    medium: 'claude-sonnet-5-5-medium',
    high: 'claude-sonnet-5-5-high'
  }
};

const dynamicTierMapping: Record<string, Record<string, string | undefined>> = {};

export function registerDynamicTierVariant(baseModelId: string, tier: string, targetModelId: string): boolean {
  const existingStatic = TIER_MAPPING[baseModelId]?.[tier];
  if (existingStatic === targetModelId) {
    return false;
  }
  const bucket = dynamicTierMapping[baseModelId] ?? (dynamicTierMapping[baseModelId] = {});
  if (bucket[tier] === targetModelId) {
    return false;
  }
  bucket[tier] = targetModelId;
  return true;
}

export function getEffectiveTierMapping(baseModelId: string): Record<string, string | undefined> | undefined {
  const staticMap = TIER_MAPPING[baseModelId];
  const dynamicMap = dynamicTierMapping[baseModelId];
  if (!staticMap && !dynamicMap) {
    return undefined;
  }
  return dynamicMap ? { ...staticMap, ...dynamicMap } : staticMap;
}

export function resetDynamicTierMappingsForTesting(): void {
  for (const key of Object.keys(dynamicTierMapping)) {
    delete dynamicTierMapping[key];
  }
}

/**
 * Resolves a model ID and optional request headers or suffix into the appropriate tier variant.
 */
export function resolveModelTier(
  baseModelId: string,
  headersOrInit?: RequestInit | unknown
): string {
  const parts = baseModelId.split('@');
  const base = parts[0] || '';
  const suffixTier = parts[1]?.toLowerCase();

  const mapping = getEffectiveTierMapping(base);
  if (!mapping) {
    return baseModelId;
  }

  const rawHeaders =
    headersOrInit && typeof headersOrInit === 'object' && 'headers' in headersOrInit
      ? (headersOrInit as RequestInit).headers
      : headersOrInit;

  const headerTier = getSafeHeader(rawHeaders, 'x-agy-tier')?.toLowerCase() || null;
  const requestedTier = headerTier || suffixTier;

  if (requestedTier && Object.prototype.hasOwnProperty.call(mapping, requestedTier)) {
    return mapping[requestedTier] || baseModelId;
  }

  return mapping['medium'] ?? mapping['high'] ?? mapping['low'] ?? baseModelId;
}
