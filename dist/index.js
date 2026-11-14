// src/constants.ts
var AGY_PROVIDER_ID = "google-agy";
var AGY_PROVIDER_NAME = "Antigravity CLI";
var AGY_ACP_PACKAGE = "@opencode-agy/acp";
var AGY_AISDK_PACKAGE = `aisdk:${AGY_ACP_PACKAGE}`;
var AGY_DEFAULT_BINARY = "agy";
var AGY_DEFAULT_APP_DATA_DIR = "antigravity-cli";
var AGY_ISOLATED_APP_DATA_DIR = "antigravity-acp";
var AGY_LOGIN_METHOD_ID = "agy-login";
var AGY_EXTERNAL_METHOD_ID = "agy-cli";
var AGY_HEADER_REQUEST_KIND = "x-opencode-agy-kind";
var AGY_HEADER_SESSION_ID = "x-opencode-session-id";
var AGY_HEADER_FORK_SOURCE = "x-opencode-agy-fork-source";
var AGY_OPTION_AGENT_SYSTEM = "agyAgentSystem";
var AGY_OPTION_INSTRUCTIONS = "agySessionInstructions";
var AGY_STORAGE_CATALOG_KEY = "agy-acp-catalog-v1";
var AGY_STORAGE_AUTH_STATUS_KEY = "agy-acp-auth-v1";
var AGY_STORAGE_SESSION_PREFIX = "sessions/";

// src/acp/auth.ts
import { closeSync, existsSync as existsSync3, mkdtempSync, openSync, readSync, rmSync as rmSync2, statSync as statSync2 } from "fs";
import { homedir as homedir3, tmpdir } from "os";
import { join as join4 } from "path";

// src/acp/catalog.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join as join2 } from "path";

// src/plugin/tier.ts
var ORDERED_EFFORT_LEVELS = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max"
];
var STATIC_MODELS_SIMPLE = {
  "gemini-4-carbon": {
    name: "Gemini 4 Carbon",
    description: "Gemini 4 Carbon flagship reasoning model via Antigravity ACP.",
    maxTokens: 1048576,
    maxOutputTokens: 262144,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  "gemini-4-argon": {
    name: "Gemini 4 Argon",
    description: "Gemini 4 Argon model via Antigravity ACP.",
    maxTokens: 1048576,
    maxOutputTokens: 65536,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  "gemini-4-hydrogen": {
    name: "Gemini 4 Hydrogen",
    description: "Gemini 4 Hydrogen model via Antigravity ACP.",
    maxTokens: 1048576,
    maxOutputTokens: 262144,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  "gemini-pro-orchestrator": {
    name: "Orchestrator (Carbon)",
    description: "Antigravity multi-agent orchestrator powered by Gemini 4 Carbon.",
    maxTokens: 1048576,
    maxOutputTokens: 262144,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  "gemini-pro-orchestrator-argon": {
    name: "Orchestrator (Argon)",
    description: "Antigravity multi-agent orchestrator powered by Gemini 4 Argon.",
    maxTokens: 1048576,
    maxOutputTokens: 65536,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  "gemini-3.8-flash": {
    name: "Gemini 3.8 Flash",
    description: "Gemini 3.8 Flash model via Antigravity ACP.",
    maxTokens: 1048576,
    maxOutputTokens: 65536,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  "gemini-3.5-flash-lite": {
    name: "Gemini 3.5 Flash Lite",
    description: "Fast, lightweight Gemini 3.5 Flash Lite model.",
    maxTokens: 1048576,
    maxOutputTokens: 65535,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  "gemini-3.1-flash-lite": {
    name: "Gemini 3.1 Flash Lite",
    description: "Fast, lightweight Gemini 3.1 Flash Lite model.",
    maxTokens: 1048576,
    maxOutputTokens: 65535,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  "gemini-3-flash": {
    name: "Gemini 3 Flash",
    description: "Gemini 3 Flash high-throughput multimodal model.",
    maxTokens: 1048576,
    maxOutputTokens: 65536,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  "gemini-2.5-pro": {
    name: "Gemini 2.5 Pro",
    description: "Gemini 2.5 Pro reasoning model.",
    maxTokens: 1048576,
    maxOutputTokens: 65535,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  "gemini-2.5-flash": {
    name: "Gemini 2.5 Flash",
    description: "Gemini 2.5 Flash fast multimodal model.",
    maxTokens: 1048576,
    maxOutputTokens: 65535,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  "gemini-2.5-flash-lite": {
    name: "Gemini 2.5 Flash Lite",
    description: "Gemini 2.5 Flash Lite lightweight chat model.",
    maxTokens: 1048576,
    maxOutputTokens: 65535,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  "claude-opus-5-5": {
    name: "Claude Opus 5.5",
    description: "Claude Opus 5.5 deep reasoning model via Antigravity ACP.",
    maxTokens: 1e6,
    maxOutputTokens: 128e3,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  "claude-sonnet-5-5": {
    name: "Claude Sonnet 5.5",
    description: "Claude Sonnet 5.5 deep reasoning model via Antigravity ACP.",
    maxTokens: 1e6,
    maxOutputTokens: 128e3,
    toolCall: true,
    reasoning: true,
    attachment: true
  },
  "gpt-oss-120b-medium": {
    name: "GPT-OSS 120B (Medium)",
    description: "GPT open-source 120B parameter medium tier model.",
    maxTokens: 131072,
    maxOutputTokens: 32768,
    toolCall: true,
    reasoning: true,
    attachment: false
  }
};
var TIER_MAPPING = {
  "gemini-4-carbon": {
    low: "gemini-4-carbon-low",
    medium: "gemini-4-carbon-medium",
    high: "gemini-4-carbon-high"
  },
  "gemini-4-argon": {
    low: "gemini-4-argon-low",
    medium: "gemini-4-argon-medium",
    high: "gemini-4-argon-high"
  },
  "gemini-4-hydrogen": {
    low: "gemini-4-hydrogen-low",
    medium: "gemini-4-hydrogen-medium",
    high: "gemini-4-hydrogen-high",
    xhigh: "gemini-4-hydrogen-xhigh"
  },
  "gemini-3.8-flash": {
    low: "gemini-3.8-flash-low",
    medium: "gemini-3.8-flash-medium",
    high: "gemini-3.8-flash-high"
  },
  "claude-opus-5-5": {
    low: "claude-opus-5-5-low",
    medium: "claude-opus-5-5-medium",
    high: "claude-opus-5-5-high"
  },
  "claude-sonnet-5-5": {
    low: "claude-sonnet-5-5-low",
    medium: "claude-sonnet-5-5-medium",
    high: "claude-sonnet-5-5-high"
  }
};
var dynamicTierMapping = {};
function registerDynamicTierVariant(baseModelId, tier, targetModelId) {
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
function getEffectiveTierMapping(baseModelId) {
  const staticMap = TIER_MAPPING[baseModelId];
  const dynamicMap = dynamicTierMapping[baseModelId];
  if (!staticMap && !dynamicMap) {
    return void 0;
  }
  return dynamicMap ? { ...staticMap, ...dynamicMap } : staticMap;
}
function getStaticModelEfforts(modelId) {
  const mapping = getEffectiveTierMapping(modelId);
  if (!mapping) return [];
  const efforts = [];
  for (const level of ORDERED_EFFORT_LEVELS) {
    if (mapping[level] !== void 0) {
      efforts.push(level);
    }
  }
  for (const key of Object.keys(mapping)) {
    if (mapping[key] !== void 0 && !efforts.includes(key)) {
      efforts.push(key);
    }
  }
  return efforts;
}
function readHeaderCaseInsensitive(headers, name) {
  if (!headers || typeof headers !== "object") return void 0;
  const target = name.toLowerCase();
  if (typeof headers.get === "function") {
    const val = headers.get(name) ?? headers.get(target);
    return val ?? void 0;
  }
  if (Array.isArray(headers)) {
    for (const pair of headers) {
      if (Array.isArray(pair) && typeof pair[0] === "string" && pair[0].toLowerCase() === target) {
        return typeof pair[1] === "string" ? pair[1] : void 0;
      }
    }
    return void 0;
  }
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target && typeof v === "string") {
      return v;
    }
  }
  return void 0;
}
function resolveModelTier(baseModelId, headersOrInit) {
  const parts = baseModelId.split("@");
  const base = parts[0] || "";
  const suffixTier = parts[1]?.toLowerCase();
  const mapping = getEffectiveTierMapping(base);
  if (!mapping) {
    return baseModelId;
  }
  const rawHeaders = headersOrInit && typeof headersOrInit === "object" && "headers" in headersOrInit ? headersOrInit.headers : headersOrInit;
  const headerTier = readHeaderCaseInsensitive(rawHeaders, "x-agy-tier")?.toLowerCase() || null;
  const requestedTier = headerTier || suffixTier;
  if (requestedTier && Object.prototype.hasOwnProperty.call(mapping, requestedTier)) {
    return mapping[requestedTier] || baseModelId;
  }
  return mapping["medium"] ?? mapping["high"] ?? mapping["low"] ?? baseModelId;
}

// src/sdk/cache-dir.ts
import { homedir } from "os";
import { join } from "path";
function getAgyCacheDir() {
  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA || process.env.APPDATA || join(homedir(), "AppData", "Local");
    return join(base, "opencode");
  }
  const xdgCache = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(xdgCache, "opencode");
}

// src/acp/catalog.ts
var DISK_CATALOG_FILENAME = "agy-acp-catalog.json";
function isSelectGroup(item) {
  return typeof item.group === "string" && Array.isArray(item.options);
}
function flattenSelectOptions(option) {
  if (!option || option.type !== "select" || !Array.isArray(option.options)) {
    return [];
  }
  const flat = [];
  for (const item of option.options) {
    if (isSelectGroup(item)) {
      for (const nested of item.options) {
        if (nested && typeof nested.value === "string") {
          flat.push(nested);
        }
      }
    } else if (item && typeof item.value === "string") {
      flat.push(item);
    }
  }
  return flat;
}
function findConfigOption(configOptions, categoryOrId) {
  if (!Array.isArray(configOptions)) return void 0;
  for (const opt of configOptions) {
    if (opt.type === "select" && (opt.category === categoryOrId || opt.id === categoryOrId)) {
      return opt;
    }
  }
  return void 0;
}
function mergeSessionConfigOptions(previous, incoming) {
  if (!incoming || incoming.length === 0) {
    return previous ? [...previous] : [];
  }
  if (!previous || previous.length === 0) {
    return [...incoming];
  }
  const incomingHasModel = incoming.some(
    (opt) => opt.category === "model" || opt.id === "model"
  );
  const incomingHasThought = incoming.some(
    (opt) => opt.category === "thought_level" || opt.id === "thought_level"
  );
  const filteredPrev = incomingHasModel && !incomingHasThought ? previous.filter(
    (opt) => opt.category !== "thought_level" && opt.id !== "thought_level"
  ) : [...previous];
  for (const nextOpt of incoming) {
    const idx = filteredPrev.findIndex((existing) => existing.id === nextOpt.id);
    if (idx >= 0) {
      filteredPrev[idx] = nextOpt;
    } else {
      filteredPrev.push(nextOpt);
    }
  }
  return filteredPrev;
}
function orderEfforts(levels) {
  const unique = /* @__PURE__ */ new Set();
  for (const lvl of levels) {
    const clean = lvl.trim();
    if (clean) unique.add(clean);
  }
  const ordered = [];
  for (const canonical of ORDERED_EFFORT_LEVELS) {
    if (unique.has(canonical)) {
      ordered.push(canonical);
      unique.delete(canonical);
    }
  }
  for (const rest of unique) {
    ordered.push(rest);
  }
  return ordered;
}
function extractThoughtLevelsFromConfig(configOptions) {
  const thoughtOpt = findConfigOption(configOptions, "thought_level");
  if (!thoughtOpt) {
    return { levels: [] };
  }
  const flat = flattenSelectOptions(thoughtOpt);
  const levels = orderEfforts(flat.map((o) => o.value));
  return {
    levels,
    current: thoughtOpt.currentValue || void 0,
    configId: thoughtOpt.id
  };
}
var KNOWN_TIER_SUFFIXES = ["minimal", "low", "medium", "high", "xhigh", "max"];
function matchTierSuffixOfBase(id, baseIds) {
  const lower = id.toLowerCase();
  for (const suffix of KNOWN_TIER_SUFFIXES) {
    if (lower.endsWith(`-${suffix}`)) {
      const candidateBase = id.slice(0, -(suffix.length + 1));
      if (candidateBase && baseIds.has(candidateBase)) {
        return { baseId: candidateBase, tier: suffix };
      }
    }
  }
  return void 0;
}
function extractModelsFromSessionSetup(setup) {
  const modelOpt = findConfigOption(setup.configOptions, "model");
  const seen = /* @__PURE__ */ new Map();
  if (modelOpt) {
    for (const item of flattenSelectOptions(modelOpt)) {
      const id = item.value.trim();
      if (!id) continue;
      seen.set(id, {
        id,
        name: item.name?.trim() || id,
        ...item.description ? { description: item.description.trim() } : {}
      });
    }
  }
  if (seen.size === 0 && Array.isArray(setup.models?.availableModels)) {
    const rawAvailable = [];
    for (const m of setup.models.availableModels) {
      const id = m.modelId?.trim();
      if (!id) continue;
      rawAvailable.push({
        id,
        name: m.name?.trim() || id,
        ...m.description ? { description: m.description.trim() } : {}
      });
    }
    const allIds = new Set(rawAvailable.map((m) => m.id));
    const inferredTiersByBase = /* @__PURE__ */ new Map();
    for (const item of rawAvailable) {
      const tierMatch = matchTierSuffixOfBase(item.id, allIds);
      if (tierMatch) {
        let bucket = inferredTiersByBase.get(tierMatch.baseId);
        if (!bucket) {
          bucket = /* @__PURE__ */ new Set();
          inferredTiersByBase.set(tierMatch.baseId, bucket);
        }
        bucket.add(tierMatch.tier);
        continue;
      }
      if (!seen.has(item.id)) {
        seen.set(item.id, item);
      }
    }
    for (const [baseId, tiers] of inferredTiersByBase.entries()) {
      const baseEntry = seen.get(baseId);
      if (baseEntry) {
        baseEntry.inferredTiers = orderEfforts([...tiers]);
      }
    }
  }
  const baseIdSet = new Set(seen.keys());
  const rawCurrent = (modelOpt?.currentValue || setup.models?.currentModelId || "").trim();
  const normalizedCurrent = rawCurrent ? matchTierSuffixOfBase(rawCurrent, baseIdSet)?.baseId ?? rawCurrent : void 0;
  return {
    modelConfigId: modelOpt?.id,
    currentModelId: normalizedCurrent,
    models: [...seen.values()]
  };
}
async function discoverCatalogFromSession(connection, sessionSetup, options) {
  const extracted = extractModelsFromSessionSetup(sessionSetup);
  const initialThought = extractThoughtLevelsFromConfig(sessionSetup.configOptions);
  const probeThought = options?.probeThoughtLevels !== false;
  const thoughtByModel = /* @__PURE__ */ new Map();
  if (extracted.currentModelId) {
    thoughtByModel.set(extracted.currentModelId, {
      levels: initialThought.levels,
      defaultLevel: initialThought.current
    });
  }
  if (probeThought && extracted.modelConfigId && extracted.models.length > 0) {
    for (const model of extracted.models) {
      if (options?.signal?.aborted) break;
      if (thoughtByModel.has(model.id)) continue;
      try {
        const res = await connection.setConfigOption(
          sessionSetup.sessionId,
          extracted.modelConfigId,
          model.id,
          { timeoutMs: 15e3, signal: options?.signal }
        );
        const mergedCfg = mergeSessionConfigOptions(
          sessionSetup.configOptions,
          res.configOptions
        );
        const tl = extractThoughtLevelsFromConfig(mergedCfg);
        thoughtByModel.set(model.id, {
          levels: tl.levels,
          defaultLevel: tl.current
        });
      } catch {
        thoughtByModel.set(model.id, {
          levels: getStaticModelEfforts(model.id)
        });
      }
    }
    if (options?.restoreInitialModel && extracted.currentModelId && !options?.signal?.aborted) {
      await connection.setConfigOption(
        sessionSetup.sessionId,
        extracted.modelConfigId,
        extracted.currentModelId,
        { timeoutMs: 1e4, signal: options?.signal }
      ).catch(() => {
      });
    }
  }
  return {
    defaultModelId: extracted.currentModelId,
    models: extracted.models.map((m) => {
      const thought = thoughtByModel.get(m.id);
      const levels = thought ? thought.levels : m.inferredTiers ?? getStaticModelEfforts(m.id);
      return {
        id: m.id,
        name: m.name,
        ...m.description ? { description: m.description } : {},
        thoughtLevels: levels,
        ...thought?.defaultLevel ? { defaultThoughtLevel: thought.defaultLevel } : {}
      };
    })
  };
}
function inferModelMetadata(id, name, description, thoughtLevels, defaultThoughtLevel, source) {
  const staticEntry = STATIC_MODELS_SIMPLE[id];
  if (staticEntry) {
    return {
      id,
      name: name || staticEntry.name,
      description: description ?? staticEntry.description,
      thoughtLevels,
      ...defaultThoughtLevel ? { defaultThoughtLevel } : {},
      maxTokens: staticEntry.maxTokens,
      maxOutputTokens: staticEntry.maxOutputTokens,
      toolCall: staticEntry.toolCall,
      reasoning: thoughtLevels.length > 0 || staticEntry.reasoning,
      attachment: staticEntry.attachment,
      source
    };
  }
  const lower = id.toLowerCase();
  const isClaude = lower.startsWith("claude-");
  const isGptOss = lower.startsWith("gpt-oss-");
  const isLargeOutput = lower.includes("carbon") || lower.includes("hydrogen") || lower.includes("orchestrator");
  return {
    id,
    name: name || id,
    ...description ? { description } : {},
    thoughtLevels,
    ...defaultThoughtLevel ? { defaultThoughtLevel } : {},
    maxTokens: isClaude ? 1e6 : isGptOss ? 131072 : 1048576,
    maxOutputTokens: isClaude ? 128e3 : isGptOss ? 32768 : isLargeOutput ? 262144 : 65536,
    toolCall: true,
    reasoning: thoughtLevels.length > 0 || !lower.includes("2.5-flash-lite"),
    attachment: !isGptOss,
    source
  };
}
function inferModelFamily(modelId) {
  const lower = modelId.toLowerCase();
  if (lower.startsWith("claude-")) return "claude";
  if (lower.startsWith("gpt-")) return "gpt";
  if (lower.startsWith("gemini-")) return "gemini";
  return "antigravity";
}
function toOpenCodeModelInfo(entry) {
  const variants = entry.thoughtLevels.map((level) => ({
    id: level,
    settings: {
      effort: level,
      thoughtLevel: level
    },
    headers: {
      "x-agy-tier": level
    }
  }));
  return {
    id: entry.id,
    modelID: entry.id,
    providerID: AGY_PROVIDER_ID,
    family: inferModelFamily(entry.id),
    name: entry.name,
    package: AGY_AISDK_PACKAGE,
    capabilities: {
      tools: entry.toolCall,
      input: entry.attachment ? ["text", "image", "pdf"] : ["text"],
      output: entry.reasoning ? ["text", "reasoning"] : ["text"],
      temperature: true
    },
    variants,
    time: { released: 0 },
    cost: [
      {
        input: 0,
        output: 0,
        cache: { read: 0, write: 0 }
      }
    ],
    status: "active",
    enabled: true,
    limit: {
      context: entry.maxTokens,
      output: entry.maxOutputTokens
    }
  };
}
function splitTierFormattedModelId(rawModelId, knownBaseModels) {
  const trimmed = rawModelId.trim();
  if (trimmed.includes("@")) {
    const [base, tier] = trimmed.split("@");
    if (base && tier) {
      return { baseModelId: base, suffixEffort: tier.toLowerCase() };
    }
  }
  const baseTierMatch = matchTierSuffixOfBase(trimmed, knownBaseModels);
  if (baseTierMatch) {
    return { baseModelId: baseTierMatch.baseId, suffixEffort: baseTierMatch.tier };
  }
  if (knownBaseModels.has(trimmed)) {
    return { baseModelId: trimmed };
  }
  for (const [baseId, tiers] of Object.entries(TIER_MAPPING)) {
    for (const [tier, target] of Object.entries(tiers)) {
      if (target === trimmed) {
        return { baseModelId: baseId, suffixEffort: tier };
      }
    }
  }
  for (const suffix of KNOWN_TIER_SUFFIXES) {
    if (trimmed.toLowerCase().endsWith(`-${suffix}`)) {
      const candidateBase = trimmed.slice(0, -(suffix.length + 1));
      if (knownBaseModels.has(candidateBase) || STATIC_MODELS_SIMPLE[candidateBase]) {
        return { baseModelId: candidateBase, suffixEffort: suffix };
      }
    }
  }
  return { baseModelId: trimmed };
}
function isAutomatedTestProcess() {
  return Boolean(process.env.VITEST || process.env.NODE_ENV === "test");
}
var AgyCatalogStore = class {
  models = /* @__PURE__ */ new Map();
  defaultModelId;
  hasLive = false;
  explicitCacheDir;
  constructor(options) {
    this.explicitCacheDir = options?.cacheDir;
    this.seedStaticFallback();
    this.tryLoadDiskCache();
  }
  get hasLiveCatalog() {
    return this.hasLive;
  }
  get defaultModel() {
    return this.defaultModelId;
  }
  seedStaticFallback() {
    this.models.clear();
    for (const [id, meta] of Object.entries(STATIC_MODELS_SIMPLE)) {
      const efforts = getStaticModelEfforts(id);
      this.models.set(
        id,
        inferModelMetadata(id, meta.name, meta.description, efforts, void 0, "static")
      );
    }
  }
  getDiskCacheFilePath() {
    if (!this.explicitCacheDir && isAutomatedTestProcess()) {
      return void 0;
    }
    const dir = this.explicitCacheDir ?? getAgyCacheDir();
    return join2(dir, DISK_CATALOG_FILENAME);
  }
  buildPersistedSnapshot() {
    return {
      version: 1,
      updatedAt: Date.now(),
      ...this.defaultModelId ? { defaultModelId: this.defaultModelId } : {},
      models: [...this.models.values()].map((m) => ({
        id: m.id,
        name: m.name,
        ...m.description ? { description: m.description } : {},
        thoughtLevels: [...m.thoughtLevels],
        ...m.defaultThoughtLevel ? { defaultThoughtLevel: m.defaultThoughtLevel } : {}
      }))
    };
  }
  tryLoadDiskCache() {
    const filePath = this.getDiskCacheFilePath();
    if (!filePath || !existsSync(filePath)) return;
    try {
      const raw = JSON.parse(readFileSync(filePath, "utf8"));
      const res = this.applyPersistedPayload(raw, "cache");
      if (res.applied && res.wasSanitized) {
        try {
          writeFileSync(filePath, JSON.stringify(this.buildPersistedSnapshot(), null, 2), "utf8");
        } catch {
        }
      }
    } catch {
    }
  }
  async hydrateFromStorage(storage) {
    if (!storage || this.hasLive) return false;
    try {
      const raw = await storage.get(AGY_STORAGE_CATALOG_KEY);
      if (raw && typeof raw === "object") {
        const res = this.applyPersistedPayload(raw, "cache");
        if (res.applied && res.wasSanitized) {
          await storage.set(AGY_STORAGE_CATALOG_KEY, this.buildPersistedSnapshot()).catch(() => {
          });
        }
        return res.applied;
      }
    } catch {
    }
    return false;
  }
  applyPersistedPayload(payload, source) {
    if (!Array.isArray(payload.models) || payload.models.length === 0) {
      return { applied: false, wasSanitized: false };
    }
    const validItems = payload.models.filter(
      (item) => Boolean(item && typeof item.id === "string" && item.id.trim())
    );
    const rawIdSet = new Set(validItems.map((item) => item.id.trim()));
    const mergedTiersFromDuplicates = /* @__PURE__ */ new Map();
    let wasSanitized = false;
    for (const item of validItems) {
      const id = item.id.trim();
      const dupMatch = matchTierSuffixOfBase(id, rawIdSet);
      if (dupMatch) {
        wasSanitized = true;
        let bucket = mergedTiersFromDuplicates.get(dupMatch.baseId);
        if (!bucket) {
          bucket = /* @__PURE__ */ new Set();
          mergedTiersFromDuplicates.set(dupMatch.baseId, bucket);
        }
        bucket.add(dupMatch.tier);
      }
    }
    const nextModels = /* @__PURE__ */ new Map();
    for (const item of validItems) {
      const id = item.id.trim();
      if (matchTierSuffixOfBase(id, rawIdSet)) {
        continue;
      }
      const rawLevels = Array.isArray(item.thoughtLevels) ? item.thoughtLevels.filter(
        (v) => typeof v === "string"
      ) : getStaticModelEfforts(id);
      const extraTiers = mergedTiersFromDuplicates.get(id);
      const levels = orderEfforts(
        extraTiers ? [...rawLevels, ...extraTiers] : rawLevels
      );
      for (const lvl of levels) {
        registerDynamicTierVariant(id, lvl, `${id}-${lvl}`);
      }
      nextModels.set(
        id,
        inferModelMetadata(
          id,
          typeof item.name === "string" ? item.name : id,
          typeof item.description === "string" ? item.description : void 0,
          levels,
          typeof item.defaultThoughtLevel === "string" ? item.defaultThoughtLevel : void 0,
          source
        )
      );
    }
    if (nextModels.size === 0) return { applied: false, wasSanitized: false };
    this.models.clear();
    for (const [id, entry] of nextModels.entries()) {
      this.models.set(id, entry);
    }
    if (typeof payload.defaultModelId === "string" && payload.defaultModelId.trim()) {
      const trimmedDefault = payload.defaultModelId.trim();
      const baseSet = new Set(nextModels.keys());
      this.defaultModelId = matchTierSuffixOfBase(trimmedDefault, baseSet)?.baseId ?? trimmedDefault;
    }
    if (source === "live") {
      this.hasLive = true;
    }
    return { applied: true, wasSanitized };
  }
  async applyDiscoveredCatalog(discovered, storage) {
    if (!discovered.models.length) {
      return false;
    }
    const persisted = {
      version: 1,
      updatedAt: Date.now(),
      ...discovered.defaultModelId ? { defaultModelId: discovered.defaultModelId } : {},
      models: discovered.models
    };
    const res = this.applyPersistedPayload(persisted, "live");
    if (!res.applied) return false;
    const cleanSnapshot = res.wasSanitized ? this.buildPersistedSnapshot() : persisted;
    if (storage) {
      await storage.set(AGY_STORAGE_CATALOG_KEY, cleanSnapshot).catch(() => {
      });
    }
    const diskPath = this.getDiskCacheFilePath();
    if (diskPath) {
      try {
        const dir = this.explicitCacheDir ?? getAgyCacheDir();
        mkdirSync(dir, { recursive: true });
        writeFileSync(diskPath, JSON.stringify(cleanSnapshot, null, 2), "utf8");
      } catch {
      }
    }
    return true;
  }
  /**
   * Updates session-observed configOptions incrementally without dropping any
   * previously known catalog models (`#28433`).
   */
  applyIncrementalConfigOptions(configOptions) {
    if (!Array.isArray(configOptions) || configOptions.length === 0) return;
    const modelOpt = findConfigOption(configOptions, "model");
    const thought = extractThoughtLevelsFromConfig(configOptions);
    if (modelOpt) {
      for (const opt of flattenSelectOptions(modelOpt)) {
        const id = opt.value.trim();
        if (!id) continue;
        const existing = this.models.get(id);
        const levels = modelOpt.currentValue === id && thought.levels.length > 0 ? thought.levels : existing?.thoughtLevels ?? getStaticModelEfforts(id);
        this.models.set(
          id,
          inferModelMetadata(
            id,
            opt.name?.trim() || existing?.name || id,
            opt.description?.trim() ?? existing?.description,
            levels,
            modelOpt.currentValue === id ? thought.current : existing?.defaultThoughtLevel,
            "live"
          )
        );
      }
    } else if (thought.levels.length > 0 && this.defaultModelId) {
      const existing = this.models.get(this.defaultModelId);
      if (existing) {
        this.models.set(this.defaultModelId, {
          ...existing,
          thoughtLevels: thought.levels,
          ...thought.current ? { defaultThoughtLevel: thought.current } : {}
        });
      }
    }
  }
  listEntries() {
    return [...this.models.values()];
  }
  listOpenCodeModels() {
    return this.listEntries().map(toOpenCodeModelInfo);
  }
  getEntry(modelId) {
    return this.models.get(modelId);
  }
  /**
   * Resolves an OpenCode model ID + requested effort/tier into the target ACP
   * `model` config option value and validated `thought_level` value.
   */
  resolveAcpModelAndThoughtLevel(requestedModelId, requestedEffort, sessionConfigOptions) {
    const modelOpt = findConfigOption(sessionConfigOptions, "model");
    const liveModelIds = new Set(
      flattenSelectOptions(modelOpt).map((o) => o.value.trim()).filter(Boolean)
    );
    const knownModels = /* @__PURE__ */ new Set([
      ...this.models.keys(),
      ...liveModelIds
    ]);
    const { baseModelId, suffixEffort } = splitTierFormattedModelId(
      requestedModelId,
      knownModels
    );
    const targetModelId = liveModelIds.size === 0 || liveModelIds.has(baseModelId) ? baseModelId : liveModelIds.has(requestedModelId) ? requestedModelId : baseModelId;
    const desiredEffort = (requestedEffort?.trim() || suffixEffort || "").toLowerCase() || void 0;
    const thoughtOpt = findConfigOption(sessionConfigOptions, "thought_level");
    const liveThoughtValues = flattenSelectOptions(thoughtOpt).map((o) => o.value);
    const catalogEntry = this.models.get(targetModelId);
    const allowedThoughts = liveThoughtValues.length > 0 ? liveThoughtValues : catalogEntry?.thoughtLevels ?? [];
    let selectedThought;
    if (desiredEffort) {
      const exactMatch = allowedThoughts.find(
        (lvl) => lvl.toLowerCase() === desiredEffort
      );
      if (exactMatch) {
        selectedThought = exactMatch;
      } else if (allowedThoughts.length === 0) {
        selectedThought = desiredEffort;
      }
    }
    return {
      modelId: targetModelId,
      ...selectedThought ? { thoughtLevel: selectedThought } : {},
      ...modelOpt?.id ? { modelConfigId: modelOpt.id } : {},
      ...thoughtOpt?.id ? { thoughtConfigId: thoughtOpt.id } : {}
    };
  }
};

// src/acp/client.ts
import { spawn } from "child_process";
import { accessSync, constants as fsConstants, existsSync as existsSync2, rmSync, statSync } from "fs";
import { homedir as homedir2 } from "os";
import { delimiter, isAbsolute, join as join3, resolve } from "path";

// src/acp/types.ts
var AI_SDK_ERROR_SYMBOL = /* @__PURE__ */ Symbol.for("vercel.ai.error");
var AI_SDK_API_CALL_ERROR_SYMBOL = /* @__PURE__ */ Symbol.for("vercel.ai.error.AI_APICallError");
var AcpRpcError = class extends Error {
  [AI_SDK_ERROR_SYMBOL] = true;
  [AI_SDK_API_CALL_ERROR_SYMBOL] = true;
  url = "acp://agy";
  requestBodyValues = {};
  code;
  data;
  status;
  statusCode;
  retryAfterMs;
  isRetryable;
  responseHeaders;
  responseBody;
  constructor(input) {
    super(input.message, input.cause !== void 0 ? { cause: input.cause } : void 0);
    this.name = "AcpRpcError";
    this.code = input.code;
    this.data = input.data;
    const isAuthRpcFailure = input.code === -32e3 || input.code === -32603 && /no browser is available|authentication required|not logged in|failed to authenticate|unauthenticated|sign[\s-]*in required/i.test(
      input.message
    );
    const inferredStatus = input.status ?? (isAuthRpcFailure ? 401 : void 0);
    this.status = inferredStatus;
    this.statusCode = inferredStatus;
    this.retryAfterMs = input.retryAfterMs;
    this.isRetryable = input.isRetryable ?? (inferredStatus !== void 0 && (inferredStatus === 429 || inferredStatus >= 500));
    if (input.retryAfterMs !== void 0 && input.retryAfterMs > 0) {
      this.responseHeaders = {
        "retry-after": String(Math.max(1, Math.ceil(input.retryAfterMs / 1e3))),
        "retry-after-ms": String(input.retryAfterMs)
      };
    }
    this.responseBody = JSON.stringify({
      error: {
        code: inferredStatus ?? input.code,
        rpcCode: input.code,
        message: input.message,
        ...input.retryAfterMs !== void 0 ? { retryAfterMs: input.retryAfterMs } : {}
      }
    });
  }
};

// src/acp/client.ts
var STRIPPED_AMBIENT_ENV_KEYS = [
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_CLOUD_PROJECT",
  "GOOGLE_CLOUD_PROJECT_ID",
  "GOOGLE_CLOUD_LOCATION",
  "GEMINI_HOME",
  "AGY_ACP_CCPA_PROJECT",
  "ANTIGRAVITY_HARNESS_PATH",
  "ELECTRON_RUN_AS_NODE"
];
var MAX_STDERR_TAIL_CHARS = 8192;
var DEFAULT_RPC_TIMEOUT_MS = 6e4;
var DEFAULT_POOL_IDLE_MS = 5 * 6e4;
function validateRelativeAppDataDir(appDataDir) {
  const trimmed = appDataDir.trim();
  if (!trimmed || trimmed === "." || trimmed === ".." || isAbsolute(trimmed) || trimmed.includes("/") || trimmed.includes("\\") || /^[a-zA-Z]:/.test(trimmed)) {
    throw new Error(
      `Invalid Antigravity --app-data-dir "${appDataDir}": must be a single relative directory name, never an absolute or nested path.`
    );
  }
  return trimmed;
}
function isExecutableFile(candidate) {
  try {
    const st = statSync(candidate);
    if (!st.isFile() && !st.isSymbolicLink()) return false;
    accessSync(
      candidate,
      process.platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK
    );
    return true;
  } catch {
    return false;
  }
}
function resolveAgyBinaryPath(options) {
  const env = options?.env ?? process.env;
  const explicit = options?.binaryPath?.trim() || env.OPENCODE_AGY_PATH?.trim();
  if (explicit) {
    if (explicit.startsWith("~/") || explicit.startsWith("~\\")) {
      const expanded = join3(homedir2(), explicit.slice(2));
      return isExecutableFile(expanded) ? expanded : void 0;
    }
    if (explicit.includes("/") || explicit.includes("\\") || isAbsolute(explicit)) {
      const absCandidate = isAbsolute(explicit) ? explicit : resolve(explicit);
      return isExecutableFile(absCandidate) ? absCandidate : void 0;
    }
    return findOnPath(explicit, env);
  }
  return findOnPath(AGY_DEFAULT_BINARY, env);
}
function findOnPath(binaryName, env) {
  const pathVar = env.PATH ?? env.Path ?? "";
  const searchDirs = pathVar.split(delimiter).filter(Boolean);
  if (process.platform !== "win32") {
    const localBin = join3(homedir2(), ".local", "bin");
    if (!searchDirs.includes(localBin)) {
      searchDirs.push(localBin);
    }
  }
  const extensions = process.platform === "win32" ? (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean) : [""];
  for (const dir of searchDirs) {
    for (const ext of extensions) {
      const candidate = ext && !binaryName.toLowerCase().endsWith(ext.toLowerCase()) ? join3(dir, `${binaryName}${ext}`) : join3(dir, binaryName);
      if (isExecutableFile(candidate)) {
        return candidate;
      }
    }
    if (process.platform === "win32" && isExecutableFile(join3(dir, binaryName))) {
      return join3(dir, binaryName);
    }
  }
  return void 0;
}
function buildSanitizedAgyEnv(config) {
  const sourceEnv = config?.env ?? process.env;
  const env = { ...sourceEnv };
  const adcEnabled = config?.adcAuth === true || sourceEnv.AGY_ADC_AUTH?.trim().toLowerCase() === "true" || sourceEnv.AGY_ADC_AUTH?.trim() === "1";
  const savedLocation = sourceEnv.GOOGLE_CLOUD_LOCATION;
  for (const key of STRIPPED_AMBIENT_ENV_KEYS) {
    delete env[key];
  }
  const autoCompact = config?.autoCompactOverride?.trim() || sourceEnv.AGY_CLI_AUTO_COMPACT_OVERRIDE?.trim() || "off";
  env.AGY_CLI_AUTO_COMPACT_OVERRIDE = autoCompact;
  if (adcEnabled) {
    env.AGY_ADC_AUTH = "true";
    if (savedLocation?.trim()) {
      env.GOOGLE_CLOUD_LOCATION = savedLocation.trim();
    }
  }
  const explicitProject = config?.projectId?.trim() || sourceEnv.OPENCODE_AGY_PROJECT_ID?.trim();
  if (explicitProject) {
    env.GOOGLE_CLOUD_PROJECT = explicitProject;
    env.AGY_ACP_CCPA_PROJECT = explicitProject;
  }
  return env;
}
function expandHomePath(rawPath) {
  const trimmed = rawPath.trim();
  if (trimmed === "~") {
    return homedir2();
  }
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return join3(homedir2(), trimmed.slice(2));
  }
  return trimmed;
}
function resolveEffectiveGeminiDir(config) {
  const env = config?.env ?? process.env;
  const raw = config?.geminiDir?.trim() || env.OPENCODE_AGY_GEMINI_DIR?.trim();
  return raw ? expandHomePath(raw) : void 0;
}
function buildAgyAcpArgs(config) {
  const args = ["acp", "--disable-telemetry"];
  if (config?.includeDefaultCustomizations === false) {
    args.push("--include-default-customizations=false");
  }
  const geminiDir = resolveEffectiveGeminiDir(config);
  if (geminiDir) {
    const appDataDir = validateRelativeAppDataDir(
      config?.appDataDir ?? AGY_ISOLATED_APP_DATA_DIR
    );
    args.push("--gemini-dir", geminiDir, "--app-data-dir", appDataDir);
  } else if (config?.appDataDir) {
    const appDataDir = validateRelativeAppDataDir(config.appDataDir);
    args.push("--app-data-dir", appDataDir);
  }
  if (config?.extraArgs?.length) {
    args.push(...config.extraArgs);
  }
  return args;
}
function resolveConversationsDir(config) {
  const geminiDir = resolveEffectiveGeminiDir(config);
  if (geminiDir) {
    const appDataDir2 = validateRelativeAppDataDir(
      config?.appDataDir ?? AGY_ISOLATED_APP_DATA_DIR
    );
    return join3(geminiDir, appDataDir2, "conversations");
  }
  const appDataDir = config?.appDataDir ? validateRelativeAppDataDir(config.appDataDir) : AGY_DEFAULT_APP_DATA_DIR;
  return join3(homedir2(), ".gemini", appDataDir, "conversations");
}
function resolveSessionDbPath(sessionId, config) {
  return join3(resolveConversationsDir(config), `${sessionId}.db`);
}
function cleanupSessionDbFiles(sessionId, config) {
  if (!sessionId || sessionId.includes("/") || sessionId.includes("\\")) return;
  const base = resolveSessionDbPath(sessionId, config);
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const target = `${base}${suffix}`;
    try {
      if (existsSync2(target)) {
        rmSync(target, { force: true });
      }
    } catch {
    }
  }
}
var AcpConnection = class {
  constructor(binaryPath, args, config = {}) {
    this.binaryPath = binaryPath;
    this.args = args;
    this.config = config;
    const useShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(binaryPath);
    this.child = spawn(binaryPath, [...args], {
      cwd: config.cwd ?? process.cwd(),
      env: buildSanitizedAgyEnv(config),
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
      shell: useShell
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => {
      this.onStdoutData(chunk);
    });
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk) => {
      this.appendStderr(chunk);
    });
    this.child.on("error", (err) => {
      this.failConnection(
        new Error(
          `Failed to spawn Antigravity ACP (${binaryPath}): ${err.message}${this.formatStderrSuffix()}`,
          { cause: err }
        )
      );
    });
    this.child.on("close", (code, signal) => {
      const detail = signal !== null ? `killed by signal ${signal}` : `exited with code ${code ?? "unknown"}`;
      this.failConnection(
        new Error(
          `Antigravity ACP worker ${detail}${this.formatStderrSuffix()}`
        )
      );
    });
  }
  binaryPath;
  args;
  config;
  child;
  pending = /* @__PURE__ */ new Map();
  sessionUpdateListeners = /* @__PURE__ */ new Map();
  globalUpdateListeners = /* @__PURE__ */ new Set();
  permissionHandlers = /* @__PURE__ */ new Map();
  cancelledSessions = /* @__PURE__ */ new Set();
  inFlightPermissionResolvers = /* @__PURE__ */ new Map();
  nextId = 1;
  stdoutBuffer = "";
  stderrTail = "";
  closed = false;
  exitError;
  initPromise;
  initResultValue;
  get alive() {
    return !this.closed && this.child.exitCode === null && !this.child.killed;
  }
  get initializeResult() {
    return this.initResultValue;
  }
  get stderr() {
    return this.stderrTail;
  }
  get pid() {
    return this.child.pid;
  }
  appendStderr(text) {
    if (!text) return;
    this.stderrTail = (this.stderrTail + text).slice(-MAX_STDERR_TAIL_CHARS);
  }
  formatStderrSuffix() {
    const trimmed = this.stderrTail.trim();
    if (!trimmed) return "";
    const compact = trimmed.split("\n").slice(-6).join("\n").trim();
    return compact ? `
${compact}` : "";
  }
  failConnection(error) {
    if (this.closed) return;
    this.closed = true;
    this.exitError = error;
    for (const [id, entry] of this.pending.entries()) {
      this.pending.delete(id);
      if (entry.timer) clearTimeout(entry.timer);
      entry.cleanupAbort?.();
      entry.reject(error);
    }
  }
  onStdoutData(chunk) {
    this.stdoutBuffer += chunk;
    let nlIndex;
    while ((nlIndex = this.stdoutBuffer.indexOf("\n")) !== -1) {
      const rawLine = this.stdoutBuffer.slice(0, nlIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(nlIndex + 1);
      if (!rawLine) continue;
      let frame;
      try {
        frame = JSON.parse(rawLine);
      } catch {
        continue;
      }
      this.dispatchFrame(frame);
    }
  }
  dispatchFrame(frame) {
    const hasMethod = typeof frame.method === "string";
    const hasId = frame.id !== void 0 && frame.id !== null;
    if (!hasMethod && hasId) {
      const id = frame.id;
      const entry = this.pending.get(id);
      if (!entry) return;
      this.pending.delete(id);
      if (entry.timer) clearTimeout(entry.timer);
      entry.cleanupAbort?.();
      if (frame.error && typeof frame.error === "object") {
        const errObj = frame.error;
        entry.reject(
          new AcpRpcError({
            code: typeof errObj.code === "number" ? errObj.code : -32603,
            message: typeof errObj.message === "string" ? errObj.message : `ACP RPC ${entry.method} failed`,
            data: errObj.data
          })
        );
      } else {
        entry.resolve(frame.result);
      }
      return;
    }
    if (hasMethod && !hasId) {
      const method = frame.method;
      if (method === "session/update" && frame.params && typeof frame.params === "object") {
        const notification = frame.params;
        const listeners = this.sessionUpdateListeners.get(notification.sessionId);
        if (listeners) {
          for (const listener of listeners) {
            try {
              listener(notification);
            } catch {
            }
          }
        }
        for (const listener of this.globalUpdateListeners) {
          try {
            listener(notification);
          } catch {
          }
        }
      }
      return;
    }
    if (hasMethod && hasId) {
      const id = frame.id;
      const method = frame.method;
      void this.handleServerRequest(id, method, frame.params);
    }
  }
  async handleServerRequest(id, method, params) {
    if (method === "session/request_permission") {
      const permParams = params ?? {};
      const sessionId = permParams.sessionId;
      if (sessionId && this.cancelledSessions.has(sessionId)) {
        this.writeFrame({
          jsonrpc: "2.0",
          id,
          result: { outcome: { outcome: "cancelled" } }
        });
        return;
      }
      const handler = sessionId ? this.permissionHandlers.get(sessionId) : void 0;
      if (!handler) {
        const rejectOpt = permParams.options?.find((o) => o.kind.startsWith("reject"));
        const result = rejectOpt ? { outcome: { outcome: "selected", optionId: rejectOpt.optionId } } : { outcome: { outcome: "cancelled" } };
        this.writeFrame({ jsonrpc: "2.0", id, result });
        return;
      }
      let cancelEarly;
      const cancelPromise = new Promise((resolve3) => {
        cancelEarly = resolve3;
      });
      let bucket = this.inFlightPermissionResolvers.get(sessionId);
      if (!bucket) {
        bucket = /* @__PURE__ */ new Set();
        this.inFlightPermissionResolvers.set(sessionId, bucket);
      }
      if (cancelEarly) bucket.add(cancelEarly);
      try {
        const result = await Promise.race([handler(permParams), cancelPromise]);
        this.writeFrame({ jsonrpc: "2.0", id, result });
      } catch {
        this.writeFrame({
          jsonrpc: "2.0",
          id,
          result: { outcome: { outcome: "cancelled" } }
        });
      } finally {
        if (cancelEarly) {
          bucket.delete(cancelEarly);
          if (bucket.size === 0) {
            this.inFlightPermissionResolvers.delete(sessionId);
          }
        }
      }
      return;
    }
    this.writeFrame({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `Client method not supported: ${method}`
      }
    });
  }
  writeFrame(frame) {
    if (this.closed || !this.child.stdin.writable) return;
    try {
      this.child.stdin.write(`${JSON.stringify(frame)}
`);
    } catch {
    }
  }
  request(method, params, options) {
    if (this.closed) {
      return Promise.reject(
        this.exitError ?? new Error(`Antigravity ACP connection is closed (${method})`)
      );
    }
    if (options?.signal?.aborted) {
      return Promise.reject(
        options.signal.reason instanceof Error ? options.signal.reason : new DOMException("The operation was aborted.", "AbortError")
      );
    }
    const id = this.nextId++;
    const timeoutMs = options?.timeoutMs;
    return new Promise((resolve3, reject) => {
      let timer;
      if (timeoutMs !== void 0 && timeoutMs > 0) {
        timer = setTimeout(() => {
          this.pending.delete(id);
          cleanupAbort?.();
          reject(
            new AcpRpcError({
              code: -32001,
              message: `Antigravity ACP ${method} timed out after ${timeoutMs}ms${this.formatStderrSuffix()}`
            })
          );
        }, timeoutMs);
        timer.unref?.();
      }
      let cleanupAbort;
      if (options?.signal) {
        const onAbort = () => {
          this.pending.delete(id);
          if (timer) clearTimeout(timer);
          reject(
            options.signal?.reason instanceof Error ? options.signal.reason : new DOMException("The operation was aborted.", "AbortError")
          );
        };
        options.signal.addEventListener("abort", onAbort, { once: true });
        cleanupAbort = () => options.signal?.removeEventListener("abort", onAbort);
      }
      this.pending.set(id, {
        method,
        resolve: resolve3,
        reject,
        timer,
        cleanupAbort
      });
      this.writeFrame({
        jsonrpc: "2.0",
        id,
        method,
        ...params !== void 0 ? { params } : {}
      });
    });
  }
  notify(method, params) {
    this.writeFrame({
      jsonrpc: "2.0",
      method,
      ...params !== void 0 ? { params } : {}
    });
  }
  async initialize(options) {
    if (this.initPromise) {
      return this.initPromise;
    }
    const payload = {
      protocolVersion: 1,
      clientCapabilities: {
        fs: {
          readTextFile: false,
          writeTextFile: false
        },
        terminal: false
      },
      clientInfo: {
        name: "opencode",
        title: "OpenCode",
        version: this.config.clientVersion ?? "2.0.0"
      }
    };
    this.initPromise = this.request("initialize", payload, {
      timeoutMs: options?.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS,
      signal: options?.signal
    }).then(
      (res) => {
        this.initResultValue = res;
        return res;
      },
      (err) => {
        this.initPromise = void 0;
        throw err;
      }
    );
    return this.initPromise;
  }
  createSession(params, options) {
    return this.request("session/new", params, {
      timeoutMs: options?.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS,
      signal: options?.signal
    });
  }
  resumeSession(params, options) {
    return this.request("session/resume", params, {
      timeoutMs: options?.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS,
      signal: options?.signal
    });
  }
  async closeSession(sessionId) {
    this.cancelledSessions.delete(sessionId);
    this.sessionUpdateListeners.delete(sessionId);
    this.permissionHandlers.delete(sessionId);
    if (!this.alive) return;
    if (this.initResultValue?.agentCapabilities?.sessionCapabilities?.close === void 0) {
      return;
    }
    try {
      await this.request("session/close", { sessionId }, { timeoutMs: 5e3 });
    } catch {
    }
  }
  setConfigOption(sessionId, configId, value, options) {
    const payload = typeof value === "boolean" ? { sessionId, configId, type: "boolean", value } : { sessionId, configId, value: String(value) };
    return this.request("session/set_config_option", payload, {
      timeoutMs: options?.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS,
      signal: options?.signal
    });
  }
  setMode(sessionId, modeId, options) {
    return this.request(
      "session/set_mode",
      { sessionId, modeId },
      { timeoutMs: options?.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS, signal: options?.signal }
    );
  }
  prompt(params, options) {
    this.cancelledSessions.delete(params.sessionId);
    return this.request("session/prompt", params, {
      signal: options?.signal
    });
  }
  cancelSession(sessionId) {
    this.cancelledSessions.add(sessionId);
    const inFlight = this.inFlightPermissionResolvers.get(sessionId);
    if (inFlight) {
      for (const resolve3 of inFlight) {
        resolve3({ outcome: { outcome: "cancelled" } });
      }
      this.inFlightPermissionResolvers.delete(sessionId);
    }
    this.notify("session/cancel", { sessionId });
  }
  onSessionUpdate(sessionId, listener) {
    let set = this.sessionUpdateListeners.get(sessionId);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.sessionUpdateListeners.set(sessionId, set);
    }
    set.add(listener);
    return () => {
      const current = this.sessionUpdateListeners.get(sessionId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        this.sessionUpdateListeners.delete(sessionId);
      }
    };
  }
  onAnySessionUpdate(listener) {
    this.globalUpdateListeners.add(listener);
    return () => {
      this.globalUpdateListeners.delete(listener);
    };
  }
  setPermissionHandler(sessionId, handler) {
    if (!handler) {
      this.permissionHandlers.delete(sessionId);
      return () => {
      };
    }
    this.permissionHandlers.set(sessionId, handler);
    return () => {
      if (this.permissionHandlers.get(sessionId) === handler) {
        this.permissionHandlers.delete(sessionId);
      }
    };
  }
  async close() {
    if (this.closed && this.child.exitCode !== null) {
      return;
    }
    this.failConnection(new Error("Antigravity ACP connection closed"));
    try {
      this.child.stdin.end();
    } catch {
    }
    const pid = this.child.pid;
    const killGroup = (sig) => {
      if (pid && process.platform !== "win32") {
        try {
          process.kill(-pid, sig);
          return;
        } catch {
        }
      }
      try {
        this.child.kill(sig);
      } catch {
      }
    };
    if (this.child.exitCode === null) {
      const exited = new Promise((resolve3) => {
        this.child.once("close", () => resolve3());
      });
      killGroup("SIGTERM");
      let forceKillTimer;
      const graceTimeout = new Promise((resolve3) => {
        forceKillTimer = setTimeout(() => {
          killGroup("SIGKILL");
          resolve3();
        }, 500);
        forceKillTimer.unref?.();
      });
      await Promise.race([exited, graceTimeout]);
      if (forceKillTimer) clearTimeout(forceKillTimer);
    }
  }
};
var AsyncLock = class {
  tail = Promise.resolve();
  async run(fn, signal) {
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new DOMException("The operation was aborted.", "AbortError");
    }
    const prev = this.tail;
    let release;
    this.tail = new Promise((resolve3) => {
      release = resolve3;
    });
    if (signal) {
      let abortedWhileWaiting = false;
      let cleanupAbort;
      const abortWait = new Promise((_, reject) => {
        const onAbort = () => {
          abortedWhileWaiting = true;
          reject(
            signal.reason instanceof Error ? signal.reason : new DOMException("The operation was aborted.", "AbortError")
          );
        };
        signal.addEventListener("abort", onAbort, { once: true });
        cleanupAbort = () => signal.removeEventListener("abort", onAbort);
      });
      try {
        await Promise.race([prev, abortWait]);
      } catch (err) {
        void prev.finally(() => release());
        throw err;
      } finally {
        cleanupAbort?.();
      }
      if (abortedWhileWaiting || signal.aborted) {
        release();
        throw signal.reason instanceof Error ? signal.reason : new DOMException("The operation was aborted.", "AbortError");
      }
    } else {
      await prev;
    }
    try {
      return await fn();
    } finally {
      release();
    }
  }
};
var AcpClientPool = class {
  workers = /* @__PURE__ */ new Map();
  locks = /* @__PURE__ */ new Map();
  idleTimeoutMs;
  disposed = false;
  constructor(options) {
    this.idleTimeoutMs = options?.idleTimeoutMs ?? DEFAULT_POOL_IDLE_MS;
  }
  computePoolKey(binaryPath, args, config) {
    const sanitizedEnv = buildSanitizedAgyEnv(config);
    return JSON.stringify({
      binaryPath,
      args,
      adcAuth: sanitizedEnv.AGY_ADC_AUTH === "true",
      location: sanitizedEnv.GOOGLE_CLOUD_LOCATION ?? "",
      projectId: sanitizedEnv.GOOGLE_CLOUD_PROJECT ?? "",
      autoCompactOverride: sanitizedEnv.AGY_CLI_AUTO_COMPACT_OVERRIDE ?? "off"
    });
  }
  getLock(key) {
    let lock = this.locks.get(key);
    if (!lock) {
      lock = new AsyncLock();
      this.locks.set(key, lock);
    }
    return lock;
  }
  async acquire(config, options) {
    if (this.disposed) {
      throw new Error("Antigravity ACP client pool has been disposed.");
    }
    const binaryPath = resolveAgyBinaryPath({
      binaryPath: config.binaryPath,
      env: config.env
    });
    if (!binaryPath) {
      const err = new Error(
        "Antigravity CLI (`agy`) was not found in PATH. Install `agy` 1.5.8+ or set OPENCODE_AGY_PATH."
      );
      err.code = "ENOENT";
      throw err;
    }
    const args = buildAgyAcpArgs(config);
    const key = this.computePoolKey(binaryPath, args, config);
    return this.getLock(key).run(async () => {
      if (this.disposed) {
        throw new Error("Antigravity ACP client pool has been disposed.");
      }
      let entry = this.workers.get(key);
      if (entry && !entry.connection.alive) {
        if (entry.idleTimer) clearTimeout(entry.idleTimer);
        this.workers.delete(key);
        await entry.connection.close().catch(() => {
        });
        entry = void 0;
      }
      if (!entry) {
        const connection = new AcpConnection(binaryPath, args, config);
        try {
          await connection.initialize({
            timeoutMs: options?.timeoutMs,
            signal: options?.signal
          });
        } catch (err) {
          await connection.close().catch(() => {
          });
          throw err;
        }
        entry = { connection, activeLeases: 0 };
        this.workers.set(key, entry);
      }
      if (entry.idleTimer) {
        clearTimeout(entry.idleTimer);
        entry.idleTimer = void 0;
      }
      entry.activeLeases += 1;
      let released = false;
      const capturedEntry = entry;
      const release = () => {
        if (released) return;
        released = true;
        capturedEntry.activeLeases = Math.max(0, capturedEntry.activeLeases - 1);
        if (capturedEntry.activeLeases === 0 && !this.disposed) {
          this.scheduleIdleEviction(key, capturedEntry);
        }
      };
      return { connection: entry.connection, release };
    }, options?.signal);
  }
  async spawnEphemeral(config, options) {
    const binaryPath = resolveAgyBinaryPath({
      binaryPath: config.binaryPath,
      env: config.env
    });
    if (!binaryPath) {
      const err = new Error(
        "Antigravity CLI (`agy`) was not found in PATH. Install `agy` 1.5.8+ or set OPENCODE_AGY_PATH."
      );
      err.code = "ENOENT";
      throw err;
    }
    const args = buildAgyAcpArgs(config);
    const connection = new AcpConnection(binaryPath, args, config);
    try {
      await connection.initialize({
        timeoutMs: options?.timeoutMs,
        signal: options?.signal
      });
      return connection;
    } catch (err) {
      await connection.close().catch(() => {
      });
      throw err;
    }
  }
  scheduleIdleEviction(key, entry) {
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    if (this.idleTimeoutMs <= 0) return;
    const timer = setTimeout(() => {
      if (entry.activeLeases > 0) return;
      if (this.workers.get(key) === entry) {
        this.workers.delete(key);
        void entry.connection.close().catch(() => {
        });
      }
    }, this.idleTimeoutMs);
    timer.unref?.();
    entry.idleTimer = timer;
  }
  async evictAll() {
    const closing = [];
    for (const [key, entry] of this.workers.entries()) {
      this.workers.delete(key);
      if (entry.idleTimer) clearTimeout(entry.idleTimer);
      closing.push(entry.connection.close().catch(() => {
      }));
    }
    await Promise.all(closing);
  }
  async dispose() {
    this.disposed = true;
    await this.evictAll();
  }
};

// src/acp/auth.ts
function classifyAcpAuthError(error) {
  const errCode = error?.code;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : String(error ?? "Unknown Antigravity ACP error");
  if (errCode === "ENOENT" || /not found in PATH|ENOENT/i.test(message)) {
    return {
      state: "missing",
      message: "Antigravity CLI (`agy`) was not found in PATH. Install `agy` 1.5.8+ or set `OPENCODE_AGY_PATH`."
    };
  }
  if (error instanceof AcpRpcError) {
    if (error.code === -32e3) {
      return {
        state: "needs_auth",
        message: "Antigravity CLI authentication is required. Run `agy acp --login` to sign in."
      };
    }
    if (error.code === -32603 && /no browser is available|agy acp --login|authentication required|auth_required|not signed in|sign in|unauthenticated/i.test(
      message
    )) {
      return {
        state: "needs_auth",
        message: "Antigravity CLI is not signed in (headless environment detected). Run `agy acp --login` to authenticate via URL paste."
      };
    }
  }
  if (/no browser is available|agy acp --login|authentication required|auth_required|not signed in|unauthenticated/i.test(
    message
  )) {
    return {
      state: "needs_auth",
      message: "Antigravity CLI authentication is required. Run `agy acp --login` to sign in."
    };
  }
  return {
    state: "failed",
    message
  };
}
function buildAgyLoginCommand(config) {
  const env = config?.env ?? process.env;
  const binary = resolveAgyBinaryPath({
    binaryPath: config?.binaryPath,
    env
  }) ?? config?.binaryPath?.trim() ?? env.OPENCODE_AGY_PATH?.trim() ?? AGY_DEFAULT_BINARY;
  const cmd = [binary, "acp", "--login"];
  const geminiDir = resolveEffectiveGeminiDir(config);
  if (geminiDir) {
    const appDataDir = validateRelativeAppDataDir(
      config?.appDataDir ?? AGY_ISOLATED_APP_DATA_DIR
    );
    cmd.push("--gemini-dir", geminiDir, "--app-data-dir", appDataDir);
  } else if (config?.appDataDir) {
    cmd.push("--app-data-dir", validateRelativeAppDataDir(config.appDataDir));
  }
  return cmd;
}
function readBoundedFileUtf8(filePath, maxBytes = 16384) {
  const fd = openSync(filePath, "r");
  try {
    const buf = Buffer.allocUnsafe(maxBytes);
    const bytesRead = readSync(fd, buf, 0, maxBytes, 0);
    return buf.subarray(0, bytesRead).toString("utf8");
  } finally {
    closeSync(fd);
  }
}
function isNonEmptyAuthHintFile(filePath, kind) {
  try {
    if (!existsSync3(filePath)) return false;
    const st = statSync2(filePath);
    if (!st.isFile() || st.size === 0) return false;
    const trimmed = readBoundedFileUtf8(filePath).trim();
    if (!trimmed) return false;
    if (kind === "json") {
      if (trimmed.length <= 2 || trimmed === "{}" || trimmed === "[]" || trimmed === "null") {
        return false;
      }
      if (st.size <= 16384) {
        try {
          const parsed = JSON.parse(trimmed);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return false;
          }
          const rec = parsed;
          if (Object.keys(rec).length === 0 || rec.signedIn === false) {
            return false;
          }
        } catch {
        }
      }
      return true;
    }
    if (kind === "token") {
      return trimmed !== "{}" && trimmed !== "null" && trimmed.length > 2;
    }
    return /^[a-zA-Z0-9_]+\s*[:{]/m.test(trimmed);
  } catch {
    return false;
  }
}
function isAdcEnabledInConfig(config) {
  const env = config?.env ?? process.env;
  return config?.adcAuth === true || env.AGY_ADC_AUTH?.trim().toLowerCase() === "true" || env.AGY_ADC_AUTH?.trim() === "1";
}
function resolveAgyProfilePaths(config) {
  const explicitGeminiDir = resolveEffectiveGeminiDir(config);
  const baseGeminiDir = explicitGeminiDir ?? join4(homedir3(), ".gemini");
  const appDataDir = explicitGeminiDir ? validateRelativeAppDataDir(config?.appDataDir ?? AGY_ISOLATED_APP_DATA_DIR) : config?.appDataDir ? validateRelativeAppDataDir(config.appDataDir) : AGY_DEFAULT_APP_DATA_DIR;
  return {
    explicitGeminiDir,
    baseGeminiDir,
    appDataDir,
    appDataPath: join4(baseGeminiDir, appDataDir)
  };
}
function hasExplicitDiskCredentialHint(config) {
  if (isAdcEnabledInConfig(config)) {
    return true;
  }
  const env = config?.env ?? process.env;
  const binary = resolveAgyBinaryPath({
    binaryPath: config?.binaryPath,
    env
  });
  if (!binary) {
    return false;
  }
  try {
    const { explicitGeminiDir, baseGeminiDir, appDataDir, appDataPath } = resolveAgyProfilePaths(config);
    if (isNonEmptyAuthHintFile(join4(appDataPath, "auth.json"), "json")) {
      return true;
    }
    if (isNonEmptyAuthHintFile(join4(appDataPath, "jetski-standalone-oauth-token"), "token")) {
      return true;
    }
    const canCheckSharedStandaloneToken = Boolean(explicitGeminiDir) || !config?.appDataDir || appDataDir === AGY_DEFAULT_APP_DATA_DIR;
    if (canCheckSharedStandaloneToken && isNonEmptyAuthHintFile(join4(baseGeminiDir, "jetski-standalone-oauth-token"), "token")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
function hasLocalAgyAuthHint(config) {
  if (isAdcEnabledInConfig(config)) {
    return true;
  }
  const env = config?.env ?? process.env;
  const binary = resolveAgyBinaryPath({
    binaryPath: config?.binaryPath,
    env
  });
  if (!binary) {
    return false;
  }
  try {
    const { explicitGeminiDir, baseGeminiDir, appDataDir, appDataPath } = resolveAgyProfilePaths(config);
    if (isNonEmptyAuthHintFile(join4(appDataPath, "auth.json"), "json")) {
      return true;
    }
    if (isNonEmptyAuthHintFile(join4(appDataPath, "jetski_state.pbtxt"), "pbtxt")) {
      return true;
    }
    if (isNonEmptyAuthHintFile(join4(appDataPath, "jetski-standalone-oauth-token"), "token")) {
      return true;
    }
    const canCheckSharedStandaloneToken = Boolean(explicitGeminiDir) || !config?.appDataDir || appDataDir === AGY_DEFAULT_APP_DATA_DIR;
    if (canCheckSharedStandaloneToken && isNonEmptyAuthHintFile(join4(baseGeminiDir, "jetski-standalone-oauth-token"), "token")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
async function resolveEffectiveSpawnConfig(ctx, overrides) {
  const opts = ctx.options ?? {};
  const env = overrides?.env ?? process.env;
  let connectionGeminiDir;
  try {
    const activeConn = await ctx.integration.connection?.active(AGY_PROVIDER_ID);
    if (activeConn && ctx.integration.connection?.resolve) {
      const cred = await ctx.integration.connection.resolve(activeConn);
      const meta = cred?.metadata && typeof cred.metadata === "object" ? cred.metadata : void 0;
      const rawDir = meta?.geminiDir;
      if (typeof rawDir === "string" && rawDir.trim()) {
        connectionGeminiDir = expandHomePath(rawDir);
      }
    }
  } catch {
  }
  const rawGeminiDir = overrides?.geminiDir ?? connectionGeminiDir ?? opts.geminiDir ?? env.OPENCODE_AGY_GEMINI_DIR;
  const geminiDir = rawGeminiDir?.trim() ? expandHomePath(rawGeminiDir) : void 0;
  const includeDefaultCustomizations = overrides?.includeDefaultCustomizations ?? opts.includeDefaultCustomizations;
  const cwd = overrides?.cwd ?? ctx.location?.directory ?? ctx.location?.worktree ?? ctx.location?.root ?? ctx.location?.workspace ?? process.cwd();
  return {
    binaryPath: overrides?.binaryPath ?? opts.binaryPath,
    ...geminiDir ? { geminiDir } : {},
    ...overrides?.appDataDir ?? opts.appDataDir ? { appDataDir: overrides?.appDataDir ?? opts.appDataDir } : {},
    adcAuth: overrides?.adcAuth ?? opts.adcAuth,
    projectId: overrides?.projectId ?? opts.projectId,
    autoCompactOverride: overrides?.autoCompactOverride ?? opts.autoCompactOverride,
    ...includeDefaultCustomizations !== void 0 ? { includeDefaultCustomizations } : {},
    cwd,
    ...overrides?.env ? { env: overrides.env } : {},
    ...overrides?.extraArgs ? { extraArgs: overrides.extraArgs } : {}
  };
}
async function probeAgyAuthAndCatalog(pool, config, options) {
  const tempCwd = mkdtempSync(join4(tmpdir(), "opencode-agy-probe-"));
  let sessionId;
  let connection;
  let probeState;
  let preExistingStatePbtxt = true;
  let statePbtxtPath;
  try {
    const paths = resolveAgyProfilePaths(config);
    statePbtxtPath = join4(paths.appDataPath, "jetski_state.pbtxt");
    preExistingStatePbtxt = existsSync3(statePbtxtPath);
  } catch {
  }
  try {
    connection = await pool.spawnEphemeral(
      {
        ...config,
        cwd: tempCwd,
        includeDefaultCustomizations: false
      },
      {
        signal: options?.signal,
        timeoutMs: options?.timeoutMs ?? 2e4
      }
    );
    const setup = await connection.createSession(
      {
        cwd: tempCwd,
        mcpServers: [],
        _meta: {
          disableBuiltInTools: true
        }
      },
      {
        signal: options?.signal,
        timeoutMs: options?.timeoutMs ?? 25e3
      }
    );
    sessionId = setup.sessionId;
    const catalog = await discoverCatalogFromSession(connection, setup, {
      probeThoughtLevels: options?.probeThoughtLevels !== false,
      signal: options?.signal
    });
    probeState = "ready";
    return {
      state: "ready",
      agentVersion: connection.initializeResult?.agentInfo?.version,
      catalog
    };
  } catch (error) {
    const classified = classifyAcpAuthError(error);
    probeState = classified.state;
    return {
      state: classified.state,
      message: classified.message,
      error
    };
  } finally {
    if (connection && sessionId) {
      await connection.closeSession(sessionId).catch(() => {
      });
    }
    if (connection) {
      await connection.close().catch(() => {
      });
    }
    if (sessionId) {
      cleanupSessionDbFiles(sessionId, {
        geminiDir: config.geminiDir,
        appDataDir: config.appDataDir,
        env: config.env
      });
    }
    if (probeState === "needs_auth" && !preExistingStatePbtxt && statePbtxtPath) {
      try {
        rmSync2(statePbtxtPath, { force: true });
      } catch {
      }
    }
    try {
      rmSync2(tempCwd, { recursive: true, force: true });
    } catch {
    }
  }
}
function buildAuthProfileStorageKey(config) {
  try {
    const paths = resolveAgyProfilePaths(config);
    return JSON.stringify({
      appDataPath: paths.appDataPath,
      adcAuth: isAdcEnabledInConfig(config)
    });
  } catch {
    return void 0;
  }
}
var AgyAuthController = class {
  constructor(initialConfig) {
    this.initialConfig = initialConfig;
    if (hasLocalAgyAuthHint(initialConfig)) {
      this.readiness = "ready";
    }
  }
  initialConfig;
  readiness = "unknown";
  lastMessage;
  disposed = false;
  get state() {
    return this.readiness;
  }
  get message() {
    return this.lastMessage;
  }
  get shouldActivateProvider() {
    return this.readiness === "ready";
  }
  async hydrateFromStorage(storage, config) {
    if (!storage) return;
    const effectiveConfig = config ?? this.initialConfig;
    const profileKey = buildAuthProfileStorageKey(effectiveConfig);
    if (!profileKey) return;
    try {
      const raw = await storage.get(AGY_STORAGE_AUTH_STATUS_KEY);
      if (!raw || typeof raw !== "object" || raw.version !== 1 || !raw.profiles) {
        return;
      }
      const entry = raw.profiles[profileKey];
      if (!entry) return;
      if (entry.state === "needs_auth" && !hasExplicitDiskCredentialHint(effectiveConfig)) {
        this.readiness = "needs_auth";
        this.lastMessage = entry.message;
      }
    } catch {
    }
  }
  async persistToStorage(storage, config) {
    if (!storage) return;
    if (this.readiness !== "ready" && this.readiness !== "needs_auth") {
      return;
    }
    const effectiveConfig = config ?? this.initialConfig;
    const profileKey = buildAuthProfileStorageKey(effectiveConfig);
    if (!profileKey) return;
    try {
      const existing = await storage.get(AGY_STORAGE_AUTH_STATUS_KEY).catch(() => void 0);
      const prevProfiles = existing && typeof existing === "object" && existing.version === 1 && existing.profiles ? existing.profiles : {};
      const next = {
        version: 1,
        profiles: {
          ...prevProfiles,
          [profileKey]: {
            state: this.readiness,
            ...this.lastMessage ? { message: this.lastMessage } : {},
            updatedAt: Date.now()
          }
        }
      };
      await storage.set(AGY_STORAGE_AUTH_STATUS_KEY, next);
    } catch {
    }
  }
  updateFromOutcome(outcome) {
    const prevState = this.readiness;
    const prevMsg = this.lastMessage;
    this.readiness = outcome.state;
    this.lastMessage = outcome.message;
    return prevState !== this.readiness || prevMsg !== this.lastMessage;
  }
  markDisposed() {
    this.disposed = true;
  }
  get isDisposed() {
    return this.disposed;
  }
};
async function syncIntegrationConnectionStatus(ctx, auth) {
  if (!ctx.integration.connection?.active || !ctx.integration.connection?.status) {
    return;
  }
  try {
    const active = await ctx.integration.connection.active(AGY_PROVIDER_ID);
    if (!active) return;
    if (auth.state === "needs_auth" || auth.state === "missing") {
      await ctx.integration.connection.status({
        integrationID: AGY_PROVIDER_ID,
        connection: active,
        status: {
          status: "needs_auth",
          message: auth.message ?? "Antigravity CLI authentication is required. Run `agy acp --login`."
        }
      });
    } else if (auth.state === "ready") {
      await ctx.integration.connection.status({
        integrationID: AGY_PROVIDER_ID,
        connection: active,
        status: void 0
      });
    }
  } catch {
  }
}
async function registerAgyIntegration(ctx, deps) {
  const reg = await ctx.integration.transform((editor) => {
    editor.update(AGY_PROVIDER_ID, (info) => {
      info.name = AGY_PROVIDER_NAME;
    });
    const cfg = deps.getSpawnConfig();
    editor.method.update({
      integrationID: AGY_PROVIDER_ID,
      method: {
        id: AGY_LOGIN_METHOD_ID,
        type: "command",
        label: "Sign in with Antigravity CLI (agy acp --login)",
        command: buildAgyLoginCommand(cfg)
      }
    });
    editor.method.update({
      integrationID: AGY_PROVIDER_ID,
      method: {
        id: AGY_EXTERNAL_METHOD_ID,
        type: "external",
        label: "Use existing Antigravity CLI login (~/.gemini)",
        form: [
          {
            key: "geminiDir",
            type: "string",
            title: "Custom Gemini directory (optional)",
            description: "Leave blank to share ~/.gemini/antigravity-cli, or provide an isolated --gemini-dir path.",
            required: false,
            placeholder: "~/.gemini"
          }
        ]
      }
    });
  });
  if (reg && typeof reg.dispose === "function") {
    deps.cleanups.push(() => reg.dispose());
  }
  if (ctx.event?.subscribe) {
    let stopped = false;
    deps.cleanups.push(() => {
      stopped = true;
    });
    const subscription = ctx.event.subscribe({
      types: ["credential.updated", "credential.switched"]
    });
    void (async () => {
      try {
        for await (const evt of subscription) {
          if (stopped || deps.auth.isDisposed) break;
          const integrationId = typeof evt.data?.integrationID === "string" ? evt.data.integrationID : typeof evt.data?.providerID === "string" ? evt.data.providerID : void 0;
          if (integrationId && integrationId !== AGY_PROVIDER_ID) {
            continue;
          }
          await deps.onCredentialsChanged().catch(() => {
          });
        }
      } catch {
      }
    })();
  }
}

// src/acp/language-model.ts
var AgyAcpLanguageModel = class {
  constructor(modelId, sessions) {
    this.modelId = modelId;
    this.sessions = sessions;
  }
  modelId;
  sessions;
  specificationVersion = "v3";
  provider = AGY_PROVIDER_ID;
  supportedUrls = {};
  async doStream(options) {
    const stream = this.sessions.createStream(this.modelId, options);
    return {
      stream
    };
  }
  async doGenerate(options) {
    const { stream } = await this.doStream(options);
    const reader = stream.getReader();
    const content = [];
    const warnings = [];
    const reasoningBuffers = /* @__PURE__ */ new Map();
    const textBuffers = /* @__PURE__ */ new Map();
    let responseMeta;
    let finishReason = {
      unified: "stop",
      raw: "end_turn"
    };
    let usage = {
      inputTokens: {
        total: 0,
        noCache: 0,
        cacheRead: 0,
        cacheWrite: 0
      },
      outputTokens: {
        total: 0,
        text: 0,
        reasoning: 0
      }
    };
    let providerMetadata;
    let streamCompleted = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          streamCompleted = true;
          break;
        }
        switch (value.type) {
          case "stream-start":
            warnings.push(...value.warnings);
            break;
          case "response-metadata":
            responseMeta = {
              ...value.id ? { id: value.id } : {},
              ...value.timestamp ? { timestamp: value.timestamp } : {},
              ...value.modelId ? { modelId: value.modelId } : {}
            };
            break;
          case "reasoning-start":
            reasoningBuffers.set(value.id, "");
            break;
          case "reasoning-delta":
            reasoningBuffers.set(
              value.id,
              (reasoningBuffers.get(value.id) ?? "") + value.delta
            );
            break;
          case "reasoning-end": {
            const text = reasoningBuffers.get(value.id) ?? "";
            reasoningBuffers.delete(value.id);
            if (text) {
              content.push({
                type: "reasoning",
                text,
                ...value.providerMetadata ? { providerMetadata: value.providerMetadata } : {}
              });
            }
            break;
          }
          case "text-start":
            textBuffers.set(value.id, "");
            break;
          case "text-delta":
            textBuffers.set(
              value.id,
              (textBuffers.get(value.id) ?? "") + value.delta
            );
            break;
          case "text-end": {
            const text = textBuffers.get(value.id) ?? "";
            textBuffers.delete(value.id);
            if (text) {
              content.push({
                type: "text",
                text,
                ...value.providerMetadata ? { providerMetadata: value.providerMetadata } : {}
              });
            }
            break;
          }
          case "tool-call":
            content.push({
              type: "tool-call",
              toolCallId: value.toolCallId,
              toolName: value.toolName,
              input: value.input,
              ...value.providerExecuted !== void 0 ? { providerExecuted: value.providerExecuted } : {},
              ...value.dynamic !== void 0 ? { dynamic: value.dynamic } : {},
              ...value.providerMetadata ? { providerMetadata: value.providerMetadata } : {}
            });
            break;
          case "tool-result":
            content.push({
              type: "tool-result",
              toolCallId: value.toolCallId,
              toolName: value.toolName,
              result: value.result,
              ...value.isError !== void 0 ? { isError: value.isError } : {},
              ...value.preliminary !== void 0 ? { preliminary: value.preliminary } : {},
              ...value.dynamic !== void 0 ? { dynamic: value.dynamic } : {},
              ...value.providerMetadata ? { providerMetadata: value.providerMetadata } : {}
            });
            break;
          case "finish":
            finishReason = value.finishReason;
            usage = value.usage;
            if (value.providerMetadata) {
              providerMetadata = value.providerMetadata;
            }
            break;
          case "error":
            throw value.error instanceof Error ? value.error : new Error(String(value.error));
          default:
            break;
        }
      }
    } finally {
      if (!streamCompleted) {
        await reader.cancel().catch(() => {
        });
      }
      reader.releaseLock();
    }
    for (const leftover of reasoningBuffers.values()) {
      if (leftover) content.push({ type: "reasoning", text: leftover });
    }
    for (const leftover of textBuffers.values()) {
      if (leftover) content.push({ type: "text", text: leftover });
    }
    return {
      content,
      finishReason,
      usage,
      ...providerMetadata ? { providerMetadata } : {},
      ...responseMeta ? { response: responseMeta } : {},
      warnings
    };
  }
};
function createAgyAcpSdk(sessions) {
  return {
    languageModel(modelId) {
      return new AgyAcpLanguageModel(modelId, sessions);
    }
  };
}

// src/acp/sessions.ts
import { createHash, randomUUID as randomUUID2 } from "crypto";
import { mkdtempSync as mkdtempSync2, rmSync as rmSync3 } from "fs";
import { tmpdir as tmpdir2 } from "os";
import { isAbsolute as isAbsolute2, relative, resolve as resolve2 } from "path";

// src/acp/mcp-bridge.ts
import { randomBytes, randomUUID } from "crypto";
import { createServer } from "http";
var TOOL_BATCH_COALESCE_MS = 25;
var TOOL_BATCH_MAX_WAIT_MS = 150;
var HYBRID_OVERLAPPING_OPENCODE_TOOLS = /* @__PURE__ */ new Set([
  "bash",
  "read",
  "write",
  "edit",
  "multiedit",
  "patch",
  "apply_patch",
  "glob",
  "grep",
  "list",
  "ls",
  "websearch"
]);
var AGY_MCP_SERVER_NAME = "opencode";
var STDIO_HTTP_RELAY_SCRIPT = `
const http = require("node:http");
const url = new URL(process.env.OPENCODE_AGY_MCP_URL);
const token = process.env.OPENCODE_AGY_MCP_TOKEN || "";
let inFlight = 0;
let stdinEnded = false;
let rawBuf = Buffer.alloc(0);
const CL_PREFIX_LEN = 15;
const HEADER_SEP = Buffer.from("\\r\\n\\r\\n", "ascii");

function maybeExit() {
  if (stdinEnded && inFlight === 0) process.exit(0);
}

function forwardJsonFrame(rawJson) {
  const trimmed = rawJson.trim();
  if (!trimmed) return;
  inFlight++;
  const body = Buffer.from(trimmed, "utf8");
  const req = http.request(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token,
        "Content-Length": body.length,
      },
    },
    (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const respText = Buffer.concat(chunks).toString("utf8").trim();
        if (respText && res.statusCode !== 202 && res.statusCode !== 204) {
          try {
            const compact = JSON.stringify(JSON.parse(respText));
            process.stdout.write(compact + "\\n");
          } catch {
            process.stdout.write(respText.replace(/[\\r\\n]+/g, " ") + "\\n");
          }
        }
        inFlight--;
        maybeExit();
      });
    }
  );
  req.on("error", (err) => {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && parsed.id !== undefined && parsed.id !== null) {
        process.stdout.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: parsed.id,
            error: { code: -32603, message: err.message || "MCP bridge error" },
          }) + "\\n"
        );
      }
    } catch {}
    inFlight--;
    maybeExit();
  });
  req.write(body);
  req.end();
}

function drainBuffer() {
  while (rawBuf.length > 0) {
    let start = 0;
    while (
      start < rawBuf.length &&
      (rawBuf[start] === 13 || rawBuf[start] === 10 || rawBuf[start] === 32 || rawBuf[start] === 9)
    ) {
      start++;
    }
    if (start > 0) {
      rawBuf = rawBuf.subarray(start);
      if (rawBuf.length === 0) return;
    }

    if (rawBuf[0] === 67 || rawBuf[0] === 99) {
      if (rawBuf.length < CL_PREFIX_LEN) return;
      if (rawBuf.subarray(0, CL_PREFIX_LEN).toString("ascii").toLowerCase() === "content-length:") {
        const headerEnd = rawBuf.indexOf(HEADER_SEP);
        if (headerEnd === -1) return;
        const headerStr = rawBuf.subarray(0, headerEnd).toString("ascii");
        const m = headerStr.match(/Content-Length:\\s*(\\d+)/i);
        const byteLen = m ? Number(m[1]) : 0;
        const bodyStart = headerEnd + 4;
        if (rawBuf.length < bodyStart + byteLen) return;
        const frameText = rawBuf.subarray(bodyStart, bodyStart + byteLen).toString("utf8");
        rawBuf = rawBuf.subarray(bodyStart + byteLen);
        forwardJsonFrame(frameText);
        continue;
      }
    }

    const nl = rawBuf.indexOf(10);
    if (nl === -1) return;
    const line = rawBuf.subarray(0, nl).toString("utf8");
    rawBuf = rawBuf.subarray(nl + 1);
    forwardJsonFrame(line);
  }
}

process.stdin.on("data", (chunk) => {
  const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  rawBuf = rawBuf.length === 0 ? b : Buffer.concat([rawBuf, b]);
  drainBuffer();
});
process.stdin.on("end", () => {
  if (rawBuf.length > 0) {
    const rem = rawBuf.toString("utf8").trim();
    rawBuf = Buffer.alloc(0);
    if (rem) forwardJsonFrame(rem);
  }
  stdinEnded = true;
  maybeExit();
});
`.trim();
function stripAgyMcpTitlePrefix(rawTitleOrName) {
  let clean = rawTitleOrName.trim();
  clean = clean.replace(/^run\s+/i, "");
  clean = clean.replace(new RegExp(`^mcp_${AGY_MCP_SERVER_NAME}_`, "i"), "");
  clean = clean.replace(new RegExp(`^${AGY_MCP_SERVER_NAME}_`, "i"), "");
  return clean.trim();
}
function isAgyMcpBridgedToolCall(input) {
  const title = input.title ?? "";
  if (new RegExp(`\\bmcp_${AGY_MCP_SERVER_NAME}_`, "i").test(title) || new RegExp(`^run\\s+mcp_${AGY_MCP_SERVER_NAME}_`, "i").test(title)) {
    return true;
  }
  const serverName = input.meta?.mcpServerName ?? input.meta?.serverName;
  return serverName === AGY_MCP_SERVER_NAME;
}
function stripInjectedToolSummary(rawArgs, inputSchema) {
  if (!rawArgs || typeof rawArgs !== "object" || Array.isArray(rawArgs)) {
    return {};
  }
  const record = rawArgs;
  if (!Object.prototype.hasOwnProperty.call(record, "toolSummary")) {
    return { ...record };
  }
  const props = inputSchema?.properties;
  if (props && typeof props === "object" && !Array.isArray(props) && Object.prototype.hasOwnProperty.call(props, "toolSummary")) {
    return { ...record };
  }
  const copy = { ...record };
  delete copy.toolSummary;
  return copy;
}
function stripDataUrlPrefix(data) {
  const match = data.match(/^data:[^;]+;base64,(.+)$/s);
  return match?.[1] ? match[1] : data;
}
function convertToolResultOutputToMcp(output) {
  if (output === null || output === void 0) {
    return { content: [{ type: "text", text: "" }] };
  }
  if (typeof output === "string") {
    return { content: [{ type: "text", text: output }] };
  }
  if (typeof output !== "object") {
    return { content: [{ type: "text", text: String(output) }] };
  }
  const typed = output;
  switch (typed.type) {
    case "text":
      return {
        content: [{ type: "text", text: typed.value ?? "" }]
      };
    case "json":
      return {
        content: [
          {
            type: "text",
            text: typeof typed.value === "string" ? typed.value : JSON.stringify(typed.value ?? null)
          }
        ]
      };
    case "error-text":
      return {
        content: [{ type: "text", text: typed.value ?? "Tool execution failed." }],
        isError: true
      };
    case "error-json":
      return {
        content: [
          {
            type: "text",
            text: typeof typed.value === "string" ? typed.value : JSON.stringify(typed.value ?? null)
          }
        ],
        isError: true
      };
    case "execution-denied":
      return {
        content: [
          {
            type: "text",
            text: typed.reason || "Tool execution was denied by the user."
          }
        ],
        isError: true
      };
    case "content": {
      const blocks = [];
      for (const item of typed.value ?? []) {
        if (!item || typeof item !== "object") continue;
        if (item.type === "text") {
          blocks.push({ type: "text", text: item.text });
        } else if (item.type === "image-data") {
          blocks.push({
            type: "image",
            data: stripDataUrlPrefix(item.data),
            mimeType: item.mediaType || "image/png"
          });
        } else if (item.type === "file-data") {
          if (item.mediaType?.startsWith("image/")) {
            blocks.push({
              type: "image",
              data: stripDataUrlPrefix(item.data),
              mimeType: item.mediaType
            });
          } else {
            blocks.push({
              type: "resource",
              resource: {
                uri: item.filename ? `file:///${item.filename.replace(/^\/+/, "")}` : "attachment://file",
                mimeType: item.mediaType || "application/octet-stream",
                blob: stripDataUrlPrefix(item.data)
              }
            });
          }
        } else if (item.type === "image-url" || item.type === "file-url") {
          blocks.push({ type: "text", text: `[Attachment URL: ${item.url}]` });
        } else {
          blocks.push({ type: "text", text: JSON.stringify(item) });
        }
      }
      return {
        content: blocks.length > 0 ? blocks : [{ type: "text", text: "" }]
      };
    }
    default:
      return {
        content: [{ type: "text", text: JSON.stringify(output) }]
      };
  }
}
function encodeSafeMcpToolName(rawName, usedNames) {
  if (/^[a-zA-Z0-9_-]{1,50}$/.test(rawName) && !usedNames.has(rawName)) {
    usedNames.add(rawName);
    return rawName;
  }
  const base = rawName.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "tool";
  let candidate = base;
  let suffix = 1;
  while (usedNames.has(candidate)) {
    candidate = `${base}_${suffix++}`;
  }
  usedNames.add(candidate);
  return candidate;
}
function normalizeInputSchema(schema) {
  if (!schema || typeof schema !== "object") {
    return { type: "object", properties: {} };
  }
  const copy = { ...schema };
  if (!copy.type) {
    copy.type = "object";
  }
  if (!copy.properties || typeof copy.properties !== "object") {
    copy.properties = {};
  }
  if (copy.additionalProperties === false) {
    delete copy.additionalProperties;
  }
  return copy;
}
var OpenCodeMcpBridge = class {
  server;
  port = 0;
  authToken = randomBytes(24).toString("hex");
  toolsByMcpName = /* @__PURE__ */ new Map();
  parkedCalls = /* @__PURE__ */ new Map();
  batchWaiters = [];
  coalesceTimer;
  maxWaitTimer;
  onActivityCallback;
  acceptingCalls = true;
  lastCancelReason = "Tool execution cancelled.";
  closed = false;
  setOnActivity(cb) {
    this.onActivityCallback = cb;
  }
  /**
   * Opens the turn gate so incoming MCP `tools/call` invocations are accepted
   * for the active `session/prompt` turn.
   */
  beginTurn() {
    if (this.closed) return;
    this.acceptingCalls = true;
  }
  /**
   * Closes the turn gate when a `session/prompt` turn settles or is aborted so
   * late/straggler `tools/call` HTTP requests cannot leak into `parkedCalls`
   * across turns or hang `session/cancel`.
   */
  endTurn(reason = "Tool execution cancelled.") {
    this.acceptingCalls = false;
    this.lastCancelReason = reason;
    this.cancelParkedCalls(reason);
  }
  get hasParkedToolCalls() {
    return this.parkedCalls.size > 0;
  }
  get parkedCount() {
    return this.parkedCalls.size;
  }
  get batchWaiterCount() {
    return this.batchWaiters.length;
  }
  updateTools(tools, toolChoice, toolMode = "opencode") {
    this.toolsByMcpName.clear();
    if (!tools || tools.length === 0 || toolChoice?.type === "none") {
      return;
    }
    const usedNames = /* @__PURE__ */ new Set();
    for (const tool of tools) {
      if (tool.type !== "function") continue;
      if (toolChoice?.type === "tool") {
        if (tool.name !== toolChoice.toolName) {
          continue;
        }
      } else if (toolMode === "hybrid" && HYBRID_OVERLAPPING_OPENCODE_TOOLS.has(tool.name.trim().toLowerCase())) {
        continue;
      }
      const mcpName = encodeSafeMcpToolName(tool.name, usedNames);
      this.toolsByMcpName.set(mcpName, {
        mcpName,
        openCodeName: tool.name,
        description: tool.description ?? `Execute OpenCode tool ${tool.name}`,
        inputSchema: normalizeInputSchema(tool.inputSchema)
      });
    }
  }
  async start() {
    if (this.server) return;
    const srv = createServer((req, res) => {
      void this.handleHttpRequest(req, res);
    });
    await new Promise((resolve3, reject) => {
      srv.once("error", reject);
      srv.listen(0, "127.0.0.1", () => {
        srv.removeListener("error", reject);
        const addr = srv.address();
        this.port = addr.port;
        this.server = srv;
        resolve3();
      });
    });
  }
  toAcpMcpServer(agentCapabilities) {
    if (!this.server || this.port <= 0) {
      throw new Error("OpenCodeMcpBridge must be started before generating AcpMcpServer config.");
    }
    const endpointUrl = `http://127.0.0.1:${this.port}/mcp`;
    if (agentCapabilities?.mcpCapabilities?.http === true) {
      return {
        type: "http",
        name: AGY_MCP_SERVER_NAME,
        url: endpointUrl,
        headers: [
          {
            name: "Authorization",
            value: `Bearer ${this.authToken}`
          }
        ]
      };
    }
    const env = [
      { name: "OPENCODE_AGY_MCP_URL", value: endpointUrl },
      { name: "OPENCODE_AGY_MCP_TOKEN", value: this.authToken }
    ];
    if (process.versions.bun) {
      env.unshift({ name: "BUN_BE_BUN", value: "1" });
    }
    return {
      name: AGY_MCP_SERVER_NAME,
      command: process.execPath,
      args: ["-e", STDIO_HTTP_RELAY_SCRIPT],
      env
    };
  }
  /**
   * Resolves as soon as one or more un-emitted MCP `tools/call` invocations are
   * parked waiting for OpenCode tool execution (coalescing parallel tool calls).
   * Pass `signal` to unregister the waiter cleanly when the current step finishes
   * without tool calls or is aborted.
   */
  waitForNextToolBatch(signal) {
    if (signal?.aborted) {
      return new Promise(() => {
      });
    }
    const readyNow = this.takeUnemittedCalls();
    if (readyNow.length > 0 && !this.coalesceTimer) {
      return Promise.resolve(readyNow);
    }
    return new Promise((resolve3) => {
      const waiter = (calls) => {
        signal?.removeEventListener("abort", onAbort);
        resolve3(calls);
      };
      const onAbort = () => {
        const idx = this.batchWaiters.indexOf(waiter);
        if (idx >= 0) {
          this.batchWaiters.splice(idx, 1);
        }
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      this.batchWaiters.push(waiter);
    });
  }
  /**
   * Supplies OpenCode's `LanguageModelV3ToolResultPart` outputs to the parked
   * MCP `tools/call` promises so `agy acp` resumes its paused `session/prompt`.
   * Returns the number of matched parked calls resolved.
   */
  supplyToolResults(results) {
    let resolvedCount = 0;
    for (const part of results) {
      const parked = this.parkedCalls.get(part.toolCallId);
      if (!parked) continue;
      this.parkedCalls.delete(part.toolCallId);
      resolvedCount += 1;
      this.onActivityCallback?.();
      parked.resolve(convertToolResultOutputToMcp(part.output));
    }
    return resolvedCount;
  }
  /**
   * Cancels any parked `tools/call` requests (e.g., on user abort, session rewind,
   * or worker teardown) so HTTP requests never hang, and clears stale batch waiters.
   */
  cancelParkedCalls(reason = "Tool execution cancelled.") {
    this.lastCancelReason = reason;
    this.clearBatchTimers();
    this.batchWaiters.length = 0;
    for (const [id, call] of this.parkedCalls.entries()) {
      this.parkedCalls.delete(id);
      call.resolve({
        content: [{ type: "text", text: reason }],
        isError: true
      });
    }
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    this.cancelParkedCalls("MCP bridge closed.");
    const srv = this.server;
    this.server = void 0;
    if (srv) {
      await new Promise((resolve3) => {
        srv.close(() => resolve3());
      });
    }
  }
  takeUnemittedCalls() {
    const out = [];
    for (const call of this.parkedCalls.values()) {
      if (!call.emitted) {
        call.emitted = true;
        out.push({
          callId: call.callId,
          mcpToolName: call.mcpToolName,
          toolName: call.toolName,
          args: call.args,
          argsJson: call.argsJson
        });
      }
    }
    return out;
  }
  scheduleBatchFlush() {
    if (this.coalesceTimer) {
      clearTimeout(this.coalesceTimer);
    }
    this.coalesceTimer = setTimeout(() => {
      this.flushBatchWaiters();
    }, TOOL_BATCH_COALESCE_MS);
    this.coalesceTimer.unref?.();
    if (!this.maxWaitTimer) {
      this.maxWaitTimer = setTimeout(() => {
        this.flushBatchWaiters();
      }, TOOL_BATCH_MAX_WAIT_MS);
      this.maxWaitTimer.unref?.();
    }
  }
  clearBatchTimers() {
    if (this.coalesceTimer) {
      clearTimeout(this.coalesceTimer);
      this.coalesceTimer = void 0;
    }
    if (this.maxWaitTimer) {
      clearTimeout(this.maxWaitTimer);
      this.maxWaitTimer = void 0;
    }
  }
  flushBatchWaiters() {
    this.clearBatchTimers();
    if (this.batchWaiters.length === 0) return;
    const batch = this.takeUnemittedCalls();
    if (batch.length === 0) return;
    const waiters = this.batchWaiters.splice(0, this.batchWaiters.length);
    for (const waiter of waiters) {
      waiter(batch);
    }
  }
  async handleHttpRequest(req, res) {
    const authHeader = req.headers.authorization ?? "";
    if (authHeader !== `Bearer ${this.authToken}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    if (req.method === "GET") {
      res.writeHead(405, { Allow: "POST, DELETE" });
      res.end();
      return;
    }
    if (req.method === "DELETE") {
      res.writeHead(200);
      res.end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST, DELETE" });
      res.end();
      return;
    }
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const rawText = Buffer.concat(chunks).toString("utf8").trim();
    if (!rawText) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Empty JSON-RPC payload" }));
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" }
        })
      );
      return;
    }
    if (Array.isArray(parsed)) {
      const responses = await Promise.all(
        parsed.map((item) => this.dispatchMcpRpc(item))
      );
      const filtered = responses.filter((r) => r !== void 0);
      if (filtered.length === 0) {
        res.writeHead(202);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(filtered));
      return;
    }
    const singleResponse = await this.dispatchMcpRpc(parsed);
    if (singleResponse === void 0) {
      res.writeHead(202);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(singleResponse));
  }
  async dispatchMcpRpc(frame) {
    const id = frame.id;
    const method = typeof frame.method === "string" ? frame.method : "";
    const params = frame.params ?? {};
    if (id === void 0 || id === null) {
      return void 0;
    }
    this.onActivityCallback?.();
    switch (method) {
      case "initialize": {
        const requestedVersion = typeof params.protocolVersion === "string" && params.protocolVersion.trim() ? params.protocolVersion.trim() : "2024-11-05";
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: requestedVersion,
            capabilities: {
              tools: {
                listChanged: true
              }
            },
            serverInfo: {
              name: AGY_MCP_SERVER_NAME,
              version: "1.0.0"
            }
          }
        };
      }
      case "ping":
        return { jsonrpc: "2.0", id, result: {} };
      case "tools/list": {
        const tools = [...this.toolsByMcpName.values()].map((t) => ({
          name: t.mcpName,
          description: t.description,
          inputSchema: t.inputSchema
        }));
        return {
          jsonrpc: "2.0",
          id,
          result: { tools }
        };
      }
      case "tools/call": {
        if (this.closed || !this.acceptingCalls) {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: this.lastCancelReason
                }
              ],
              isError: true
            }
          };
        }
        const rawName = typeof params.name === "string" ? params.name : "";
        const cleanLookupName = stripAgyMcpTitlePrefix(rawName);
        const toolEntry = this.toolsByMcpName.get(rawName) ?? this.toolsByMcpName.get(cleanLookupName);
        if (!toolEntry) {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Unknown OpenCode tool: "${rawName}"`
                }
              ],
              isError: true
            }
          };
        }
        const sanitizedArgs = stripInjectedToolSummary(
          params.arguments,
          toolEntry.inputSchema
        );
        const callId = `agy_call_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
        const result = await new Promise((resolve3) => {
          this.parkedCalls.set(callId, {
            callId,
            mcpToolName: toolEntry.mcpName,
            toolName: toolEntry.openCodeName,
            args: sanitizedArgs,
            argsJson: JSON.stringify(sanitizedArgs),
            emitted: false,
            resolve: resolve3
          });
          this.scheduleBatchFlush();
        });
        return {
          jsonrpc: "2.0",
          id,
          result
        };
      }
      default:
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          }
        };
    }
  }
};

// src/acp/turn-outcome.ts
import { existsSync as existsSync4 } from "fs";
var CORTEX_STEP_TYPE_ERROR_MESSAGE = 17;
var AI_SDK_ERROR_SYMBOL2 = /* @__PURE__ */ Symbol.for("vercel.ai.error");
var AI_SDK_API_CALL_ERROR_SYMBOL2 = /* @__PURE__ */ Symbol.for("vercel.ai.error.AI_APICallError");
var AgyTurnOutcomeError = class extends Error {
  [AI_SDK_ERROR_SYMBOL2] = true;
  [AI_SDK_API_CALL_ERROR_SYMBOL2] = true;
  url = "acp://agy/session/prompt";
  requestBodyValues = {};
  status;
  statusCode;
  retryAfterMs;
  quotaResetTimestamp;
  isInvalidThinkingSignature;
  isRetryable;
  responseHeaders;
  responseBody;
  constructor(outcome) {
    super(outcome.message);
    this.name = "AgyTurnOutcomeError";
    this.status = outcome.statusCode;
    this.statusCode = outcome.statusCode;
    this.retryAfterMs = outcome.retryAfterMs;
    this.quotaResetTimestamp = outcome.quotaResetTimestamp;
    this.isInvalidThinkingSignature = outcome.isInvalidThinkingSignature;
    this.isRetryable = outcome.isRetryable;
    this.responseBody = JSON.stringify({
      error: {
        code: outcome.statusCode,
        message: outcome.message,
        ...outcome.quotaResetTimestamp ? { quotaResetTimeStamp: outcome.quotaResetTimestamp } : {},
        ...outcome.retryAfterMs !== void 0 ? { retryAfterMs: outcome.retryAfterMs } : {}
      }
    });
    if (outcome.retryAfterMs !== void 0 && outcome.retryAfterMs > 0) {
      this.responseHeaders = {
        "retry-after": String(Math.max(1, Math.ceil(outcome.retryAfterMs / 1e3))),
        "retry-after-ms": String(outcome.retryAfterMs)
      };
    }
  }
};
var cachedSqliteDriverPromise;
function getSqliteDriver() {
  if (!cachedSqliteDriverPromise) {
    cachedSqliteDriverPromise = (async () => {
      try {
        const modName = "node:sqlite";
        const sqliteMod = await import(
          /* @vite-ignore */
          modName
        );
        if (typeof sqliteMod.DatabaseSync === "function") {
          const DatabaseSyncCtor = sqliteMod.DatabaseSync;
          return (targetPath) => {
            const db = new DatabaseSyncCtor(targetPath, { readOnly: true });
            return {
              queryAll(sql, ...params) {
                return db.prepare(sql).all(...params);
              },
              close() {
                db.close();
              }
            };
          };
        }
      } catch {
      }
      try {
        const bunSqliteName = "bun:sqlite";
        const bunMod = await import(
          /* @vite-ignore */
          bunSqliteName
        );
        if (typeof bunMod.Database === "function") {
          const BunDatabaseCtor = bunMod.Database;
          return (targetPath) => {
            const db = new BunDatabaseCtor(targetPath, { readonly: true });
            return {
              queryAll(sql, ...params) {
                return db.query(sql).all(...params);
              },
              close() {
                db.close();
              }
            };
          };
        }
      } catch {
      }
      return null;
    })();
  }
  return cachedSqliteDriverPromise;
}
async function openReadOnlySqlite(dbPath) {
  if (!existsSync4(dbPath)) {
    return void 0;
  }
  const openDriver = await getSqliteDriver();
  if (!openDriver) {
    return void 0;
  }
  try {
    return openDriver(dbPath);
  } catch {
    return void 0;
  }
}
async function readPreTurnMaxStepIdx(dbPath) {
  const db = await openReadOnlySqlite(dbPath);
  if (!db) return -1;
  try {
    const rows = db.queryAll("SELECT MAX(idx) AS max_idx FROM steps");
    const raw = rows[0]?.max_idx;
    return typeof raw === "number" && Number.isFinite(raw) ? raw : -1;
  } catch {
    return -1;
  } finally {
    try {
      db.close();
    } catch {
    }
  }
}
async function inspectTurnOutcomeFromDb(dbPath, preTurnMaxIdx) {
  const db = await openReadOnlySqlite(dbPath);
  if (!db) return void 0;
  try {
    const rows = db.queryAll(
      "SELECT idx, step_type, status, step_payload, error_details FROM steps WHERE idx > ? ORDER BY idx ASC",
      preTurnMaxIdx
    );
    return evaluateTurnStepRows(rows);
  } catch {
    return void 0;
  } finally {
    try {
      db.close();
    } catch {
    }
  }
}
function evaluateTurnStepRows(rows) {
  if (!rows.length) return void 0;
  let lastErrorRow;
  let lastNonErrorIdx = -1;
  for (const row of rows) {
    const idx = Number(row.idx);
    const stepType = Number(row.step_type);
    if (!Number.isFinite(idx) || !Number.isFinite(stepType)) continue;
    if (stepType === CORTEX_STEP_TYPE_ERROR_MESSAGE) {
      lastErrorRow = row;
    } else {
      lastNonErrorIdx = Math.max(lastNonErrorIdx, idx);
    }
  }
  if (!lastErrorRow) return void 0;
  if (lastNonErrorIdx > Number(lastErrorRow.idx)) {
    return void 0;
  }
  return parseErrorStepRow(lastErrorRow);
}
function parseErrorStepRow(row) {
  const stepIdx = Number(row.idx);
  const fragments = [];
  const candidateStatusCodes = [];
  if (row.error_details !== null && row.error_details !== void 0) {
    collectTextAndCodes(row.error_details, fragments, candidateStatusCodes);
  }
  if (row.step_payload !== null && row.step_payload !== void 0) {
    collectTextAndCodes(row.step_payload, fragments, candidateStatusCodes);
  }
  const combined = deduplicateFragments(fragments).join(" \u2014 ").trim();
  const message = combined || "Antigravity upstream request failed";
  const statusCode = inferHttpStatusCode(message, candidateStatusCodes);
  const quotaResetTimestamp = extractQuotaResetTimestamp(message);
  const retryAfterMs = extractRetryDelayMs(message, quotaResetTimestamp);
  const isInvalidThinkingSignature = isInvalidThinkingSignatureText(message);
  const isRetryable = !isInvalidThinkingSignature && statusCode !== void 0 && (statusCode === 408 || statusCode === 429 || statusCode >= 500 && statusCode <= 599);
  return {
    stepIdx,
    message,
    ...statusCode !== void 0 ? { statusCode } : {},
    ...retryAfterMs !== void 0 ? { retryAfterMs } : {},
    ...quotaResetTimestamp !== void 0 ? { quotaResetTimestamp } : {},
    isInvalidThinkingSignature,
    isRetryable
  };
}
function isInvalidThinkingSignatureText(text) {
  if (!text) return false;
  return /invalid[\s_`'-]*signature/i.test(text) || /thinking[\s_`'-]*(?:block[\s_`'-]*)?signature/i.test(text) || /signature[\s_`'-]*(?:is[\s_`'-]*)?(?:missing|invalid|corrupt|mismatch)/i.test(text) || /corrupted[\s_`'-]*thought/i.test(text);
}
function collectTextAndCodes(raw, outStrings, outCodes) {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (!tryExtractJsonDetails(trimmed, outStrings, outCodes)) {
      outStrings.push(trimmed);
    }
    return;
  }
  const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  if (bytes.length === 0) return;
  if (bytes[0] === 123 || bytes[0] === 91) {
    const decoded2 = new TextDecoder("utf-8", { fatal: false }).decode(bytes).trim();
    if (tryExtractJsonDetails(decoded2, outStrings, outCodes)) {
      return;
    }
  }
  const protoStrings = [];
  scanProtobufWire(bytes, 0, bytes.length, protoStrings, outCodes, 0);
  if (protoStrings.length > 0) {
    for (const str of protoStrings) {
      if (!tryExtractJsonDetails(str, outStrings, outCodes)) {
        outStrings.push(str);
      }
    }
    return;
  }
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  for (const match of decoded.matchAll(/[\x20-\x7E\n\t]{6,}/g)) {
    const span = match[0].trim();
    if (span) {
      if (!tryExtractJsonDetails(span, outStrings, outCodes)) {
        outStrings.push(span);
      }
    }
  }
}
function tryExtractJsonDetails(text, outStrings, outCodes) {
  if (!(text.startsWith("{") || text.startsWith("["))) {
    return false;
  }
  try {
    const parsed = JSON.parse(text);
    walkJsonErrorPayload(parsed, outStrings, outCodes);
    return true;
  } catch {
    return false;
  }
}
function walkJsonErrorPayload(node, outStrings, outCodes) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walkJsonErrorPayload(item, outStrings, outCodes);
    return;
  }
  const obj = node;
  if (typeof obj.code === "number" && obj.code >= 400 && obj.code <= 599) {
    outCodes.push(obj.code);
  }
  if (typeof obj.status === "number" && obj.status >= 400 && obj.status <= 599) {
    outCodes.push(obj.status);
  }
  if (typeof obj.statusCode === "number" && obj.statusCode >= 400 && obj.statusCode <= 599) {
    outCodes.push(obj.statusCode);
  }
  for (const key of [
    "message",
    "reason",
    "status",
    "description",
    "quotaResetTimeStamp",
    "quotaResetDelay",
    "retryDelay"
  ]) {
    const val = obj[key];
    if (typeof val === "string" && val.trim()) {
      if (key === "quotaResetTimeStamp") {
        outStrings.push(`quotaResetTimeStamp=${val.trim()}`);
      } else if (key === "retryDelay" || key === "quotaResetDelay") {
        outStrings.push(`retryDelay=${val.trim()}`);
      } else {
        outStrings.push(val.trim());
      }
    }
  }
  if (obj.metadata && typeof obj.metadata === "object") {
    walkJsonErrorPayload(obj.metadata, outStrings, outCodes);
  }
  if (obj.error && typeof obj.error === "object") {
    walkJsonErrorPayload(obj.error, outStrings, outCodes);
  }
  if (Array.isArray(obj.details)) {
    walkJsonErrorPayload(obj.details, outStrings, outCodes);
  }
  if (Array.isArray(obj.violations)) {
    walkJsonErrorPayload(obj.violations, outStrings, outCodes);
  }
}
function readVarint(bytes, offset, end) {
  let result = 0n;
  let shift = 0n;
  let pos = offset;
  while (pos < end && shift <= 63n) {
    const byte = bytes[pos];
    pos += 1;
    result |= BigInt(byte & 127) << shift;
    if ((byte & 128) === 0) {
      return { value: result, nextOffset: pos };
    }
    shift += 7n;
  }
  return void 0;
}
function scanProtobufWire(bytes, start, end, outStrings, outCodes, depth = 0) {
  if (depth > 8 || start >= end) return false;
  let pos = start;
  let parsedFields = 0;
  while (pos < end) {
    const tag = readVarint(bytes, pos, end);
    if (!tag || tag.value === 0n) return false;
    pos = tag.nextOffset;
    const wireType = Number(tag.value & 0x07n);
    const fieldNo = Number(tag.value >> 3n);
    if (fieldNo <= 0 || fieldNo > 536870911) return false;
    if (wireType === 0) {
      const val = readVarint(bytes, pos, end);
      if (!val) return false;
      pos = val.nextOffset;
      const num = Number(val.value);
      if (num >= 400 && num <= 599) {
        outCodes.push(num);
      }
      parsedFields += 1;
    } else if (wireType === 1) {
      if (pos + 8 > end) return false;
      pos += 8;
      parsedFields += 1;
    } else if (wireType === 5) {
      if (pos + 4 > end) return false;
      pos += 4;
      parsedFields += 1;
    } else if (wireType === 2) {
      const lenVar = readVarint(bytes, pos, end);
      if (!lenVar) return false;
      const length = Number(lenVar.value);
      pos = lenVar.nextOffset;
      if (length < 0 || pos + length > end) return false;
      if (length > 0) {
        const subStrings = [];
        const subCodes = [];
        const slice = bytes.subarray(pos, pos + length);
        const asUtf8 = decodePrintableUtf8(slice);
        if (asUtf8 !== void 0) {
          outStrings.push(asUtf8);
        } else if (scanProtobufWire(bytes, pos, pos + length, subStrings, subCodes, depth + 1)) {
          outStrings.push(...subStrings);
          outCodes.push(...subCodes);
        }
      }
      pos += length;
      parsedFields += 1;
    } else {
      return false;
    }
  }
  return parsedFields > 0;
}
function decodePrintableUtf8(bytes) {
  if (bytes.length < 2) return void 0;
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return void 0;
  }
  let printable = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13 || code >= 32 && code !== 127) {
      printable += 1;
    } else {
      return void 0;
    }
  }
  if (printable === 0) return void 0;
  const trimmed = text.trim();
  if (trimmed.length < 2) return void 0;
  return trimmed;
}
function deduplicateFragments(fragments) {
  const unique = [];
  for (const frag of fragments) {
    const clean = frag.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    if (/^type\.googleapis\.com\//i.test(clean)) continue;
    if (!unique.some((existing) => existing.includes(clean))) {
      unique.push(clean);
    }
  }
  return unique;
}
function inferHttpStatusCode(message, candidates) {
  const explicitHttpMatch = message.match(
    /\b(?:HTTP(?:\/\d(?:\.\d)?)?\s+|status(?:\s+code)?[:=\s]+)(4\d\d|5\d\d)\b/i
  );
  if (explicitHttpMatch?.[1]) {
    return Number(explicitHttpMatch[1]);
  }
  if (/\b502\b.*bad gateway|bad gateway.*\b502\b/i.test(message)) return 502;
  if (/\b503\b.*service unavailable|service unavailable/i.test(message)) return 503;
  if (/\b504\b.*gateway timeout|gateway timeout/i.test(message)) return 504;
  if (/\b529\b|overloaded/i.test(message)) return 529;
  if (/\b429\b|RESOURCE_EXHAUSTED|QUOTA_EXHAUSTED|RATE_LIMIT_EXCEEDED|too many requests|quota.*exhausted|rate limit/i.test(
    message
  )) {
    return 429;
  }
  if (/\b401\b|UNAUTHENTICATED|authentication required/i.test(message)) return 401;
  if (/\b403\b|PERMISSION_DENIED/i.test(message)) return 403;
  if (/\b400\b|INVALID_ARGUMENT/i.test(message) || isInvalidThinkingSignatureText(message)) {
    return 400;
  }
  if (/\b500\b|INTERNAL\b/i.test(message)) return 500;
  for (const code of candidates) {
    if (code === 400 || code === 401 || code === 403 || code === 404 || code === 408 || code === 429 || code === 500 || code === 502 || code === 503 || code === 504 || code === 529) {
      return code;
    }
  }
  return void 0;
}
function extractQuotaResetTimestamp(message) {
  const kvMatch = message.match(
    /quotaResetTimeStamp[=:"'\s]+([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-]+Z?)/i
  );
  if (kvMatch?.[1]) return kvMatch[1];
  const isoMatch = message.match(/\b([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z)\b/);
  if (isoMatch?.[1]) return isoMatch[1];
  return void 0;
}
function extractRetryDelayMs(message, quotaResetTimestamp) {
  const delayPatterns = [
    /retryDelay[=:"'\s]+([0-9.]+)(ms|s)\b/i,
    /Please retry in ([0-9.]+)(ms|s)\b/i,
    /retry after ([0-9.]+)(ms|s)\b/i
  ];
  for (const pattern of delayPatterns) {
    const m = message.match(pattern);
    if (m?.[1] && m[2]) {
      const value = Number(m[1]);
      if (Number.isFinite(value) && value > 0) {
        return m[2].toLowerCase() === "ms" ? Math.round(value) : Math.round(value * 1e3);
      }
    }
  }
  if (quotaResetTimestamp) {
    const targetMs = Date.parse(quotaResetTimestamp);
    if (Number.isFinite(targetMs)) {
      const delta = targetMs - Date.now();
      if (delta > 0 && delta < 24 * 36e5) {
        return Math.round(delta);
      }
    }
  }
  return void 0;
}

// src/acp/sessions.ts
var DEFAULT_WATCHDOG_TIMEOUT_MS = 45e3;
function readHeader(headers, name) {
  if (!headers) return void 0;
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower && typeof v === "string" && v.trim()) {
      return v.trim();
    }
  }
  return void 0;
}
function readProviderOptionString(providerOptions, key) {
  const bucket = providerOptions?.[AGY_PROVIDER_ID] ?? providerOptions?.["antigravity"];
  const val = bucket?.[key];
  return typeof val === "string" && val.trim() ? val.trim() : void 0;
}
function extractCallRoutingMetadata(options) {
  const sessionId = readHeader(options.headers, AGY_HEADER_SESSION_ID) ?? readProviderOptionString(options.providerOptions, "sessionId") ?? readProviderOptionString(options.providerOptions, "sessionID");
  const rawKind = readHeader(options.headers, AGY_HEADER_REQUEST_KIND) ?? readProviderOptionString(options.providerOptions, "kind");
  const kind = rawKind === "title" || rawKind === "compaction" || rawKind === "generate" ? rawKind : "primary";
  const agent = readHeader(options.headers, "x-opencode-agy-agent") ?? readProviderOptionString(options.providerOptions, "agent");
  const forkSourceSessionId = readHeader(options.headers, AGY_HEADER_FORK_SOURCE) ?? readProviderOptionString(options.providerOptions, "forkSourceSessionId");
  const effort = readProviderOptionString(options.providerOptions, "thoughtLevel") ?? readProviderOptionString(options.providerOptions, "effort") ?? readProviderOptionString(options.providerOptions, "reasoningEffort") ?? readHeader(options.headers, "x-agy-tier");
  const mode = readProviderOptionString(options.providerOptions, "mode");
  const rawToolMode = readProviderOptionString(options.providerOptions, "toolMode");
  const toolModeOverride = rawToolMode === "hybrid" || rawToolMode === "opencode" ? rawToolMode : void 0;
  return {
    ...sessionId ? { sessionId } : {},
    kind,
    ...agent ? { agent } : {},
    ...forkSourceSessionId ? { forkSourceSessionId } : {},
    ...effort ? { effort } : {},
    ...mode ? { mode } : {},
    ...toolModeOverride ? { toolModeOverride } : {}
  };
}
function sha256Hex(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}
function computeMessageDigest(message) {
  return sha256Hex(
    JSON.stringify({
      role: message.role,
      content: message.content
    })
  );
}
function extractSystemAndConversation(prompt, options) {
  const systemParts = [];
  const optAgentSys = readProviderOptionString(options.providerOptions, AGY_OPTION_AGENT_SYSTEM);
  const optInstructions = readProviderOptionString(
    options.providerOptions,
    AGY_OPTION_INSTRUCTIONS
  );
  if (optAgentSys) systemParts.push(optAgentSys);
  if (optInstructions) systemParts.push(optInstructions);
  const nonSystemMessages = [];
  for (const msg of prompt) {
    if (msg.role === "system") {
      if (msg.content.trim()) {
        systemParts.push(msg.content.trim());
      }
    } else {
      nonSystemMessages.push(msg);
    }
  }
  if (options.responseFormat?.type === "json") {
    const schemaHint = options.responseFormat.schema ? `
Required JSON Schema:
${JSON.stringify(options.responseFormat.schema, null, 2)}` : "";
    systemParts.push(
      `Respond ONLY with valid JSON matching the requested format without surrounding markdown code fences.${schemaHint}`
    );
  }
  if (options.toolChoice?.type === "tool") {
    systemParts.push(
      `IMPORTANT: You MUST invoke the tool "${options.toolChoice.toolName}" immediately with valid JSON arguments matching its input schema. Do NOT reply with plain text instead of calling "${options.toolChoice.toolName}".`
    );
  } else if (options.toolChoice?.type === "required") {
    systemParts.push(
      "IMPORTANT: You MUST invoke at least one available tool before concluding your response."
    );
  }
  const dedupedSystem = [];
  for (const part of systemParts) {
    if (!dedupedSystem.includes(part)) {
      dedupedSystem.push(part);
    }
  }
  const systemAppend = dedupedSystem.join("\n\n").trim();
  const systemHash = sha256Hex(systemAppend);
  const digests = nonSystemMessages.map(computeMessageDigest);
  return {
    systemAppend,
    systemHash,
    nonSystemMessages,
    digests
  };
}
function extractTrailingToolResults(messages) {
  const results = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "tool") {
      for (const item of msg.content) {
        if (item.type === "tool-result") {
          results.push(item);
        }
      }
      continue;
    }
    if (msg.role === "assistant") {
      for (const item of msg.content) {
        if (item.type === "tool-result") {
          results.push(item);
        }
      }
    }
    break;
  }
  return results;
}
function encodeDataContentToBase64(data) {
  if (data instanceof Uint8Array) {
    return {
      base64: Buffer.from(data).toString("base64"),
      utf8Text: Buffer.from(data).toString("utf8")
    };
  }
  if (data instanceof URL) {
    return { url: data.toString() };
  }
  if (typeof data === "string") {
    const dataUrlMatch = data.match(/^data:([^;]+)?(;base64)?,([\s\S]*)$/);
    if (dataUrlMatch) {
      const isBase64 = Boolean(dataUrlMatch[2]);
      const payload = dataUrlMatch[3] ?? "";
      if (isBase64) {
        return {
          base64: payload,
          utf8Text: Buffer.from(payload, "base64").toString("utf8")
        };
      }
      const decoded = decodeURIComponent(payload);
      return {
        base64: Buffer.from(decoded, "utf8").toString("base64"),
        utf8Text: decoded
      };
    }
    if (/^https?:\/\//i.test(data)) {
      return { url: data };
    }
    return {
      base64: data,
      utf8Text: Buffer.from(data, "base64").toString("utf8")
    };
  }
  return {};
}
function convertFilePartToAcpBlock(part, capabilities) {
  const encoded = encodeDataContentToBase64(part.data);
  const mediaType = part.mediaType || "application/octet-stream";
  const filename = part.filename || "attachment";
  const fileUri = `attachment:///${encodeURIComponent(filename)}`;
  if (encoded.url) {
    return {
      type: "resource_link",
      uri: encoded.url,
      name: filename,
      mimeType: mediaType
    };
  }
  if (mediaType.startsWith("image/") && encoded.base64 && capabilities?.promptCapabilities?.image !== false) {
    return {
      type: "image",
      data: encoded.base64,
      mimeType: mediaType
    };
  }
  if (mediaType.startsWith("audio/") && encoded.base64 && capabilities?.promptCapabilities?.audio === true) {
    return {
      type: "audio",
      data: encoded.base64,
      mimeType: mediaType
    };
  }
  const isTextLike = mediaType.startsWith("text/") || mediaType === "application/json" || mediaType === "application/xml" || mediaType.endsWith("+json") || mediaType.endsWith("+xml");
  if (capabilities?.promptCapabilities?.embeddedContext !== false) {
    if (isTextLike && encoded.utf8Text !== void 0) {
      return {
        type: "resource",
        resource: {
          uri: fileUri,
          mimeType: mediaType,
          text: encoded.utf8Text
        }
      };
    }
    if (encoded.base64) {
      return {
        type: "resource",
        resource: {
          uri: fileUri,
          mimeType: mediaType,
          blob: encoded.base64
        }
      };
    }
  }
  if (isTextLike && encoded.utf8Text !== void 0) {
    return {
      type: "text",
      text: `<attachment filename="${filename}" mime="${mediaType}">
${encoded.utf8Text}
</attachment>`
    };
  }
  return {
    type: "text",
    text: `[Attached file: ${filename} (${mediaType})]`
  };
}
function summarizeMessageForCheckpoint(msg) {
  if (msg.role === "system") {
    return "";
  }
  if (msg.role === "user") {
    const parts = [];
    for (const item of msg.content) {
      if (item.type === "text") {
        parts.push(item.text);
      } else if (item.type === "file") {
        parts.push(`[Attached file: ${item.filename ?? item.mediaType}]`);
      }
    }
    return `<message role="user">
${parts.join("\n")}
</message>`;
  }
  if (msg.role === "assistant") {
    const parts = [];
    for (const item of msg.content) {
      if (item.type === "text" && item.text.trim()) {
        parts.push(item.text);
      } else if (item.type === "tool-call") {
        const inputStr = typeof item.input === "string" ? item.input : JSON.stringify(item.input ?? {});
        parts.push(`[Tool Call: ${item.toolName}(${inputStr})]`);
      } else if (item.type === "tool-result") {
        parts.push(`[Tool Result (${item.toolName}): ${JSON.stringify(item.output)}]`);
      }
    }
    if (!parts.length) return "";
    return `<message role="assistant">
${parts.join("\n")}
</message>`;
  }
  if (msg.role === "tool") {
    const parts = [];
    for (const item of msg.content) {
      if (item.type === "tool-result") {
        let rendered = "";
        if (item.output.type === "text" || item.output.type === "error-text") {
          rendered = item.output.value;
        } else if (item.output.type === "json" || item.output.type === "error-json") {
          rendered = JSON.stringify(item.output.value);
        } else if (item.output.type === "execution-denied") {
          rendered = item.output.reason ?? "Denied";
        } else {
          rendered = JSON.stringify(item.output.value);
        }
        parts.push(`[Tool Result (${item.toolName}): ${rendered}]`);
      }
    }
    if (!parts.length) return "";
    return `<message role="tool">
${parts.join("\n")}
</message>`;
  }
  return "";
}
function buildPromptBlocksFromMessages(messages, capabilities, options) {
  if (messages.length === 0) {
    return [{ type: "text", text: "Continue." }];
  }
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      lastUserIdx = i;
      break;
    }
  }
  const hasPriorNonUser = options?.forceCheckpoint === true || messages.some((m, idx) => idx !== lastUserIdx && m.role !== "user");
  if (!hasPriorNonUser && lastUserIdx >= 0) {
    const blocks = [];
    for (const msg of messages) {
      if (msg.role !== "user") continue;
      for (const part of msg.content) {
        if (part.type === "text") {
          if (part.text) blocks.push({ type: "text", text: part.text });
        } else if (part.type === "file") {
          blocks.push(convertFilePartToAcpBlock(part, capabilities));
        }
      }
    }
    return blocks.length > 0 ? blocks : [{ type: "text", text: "Continue." }];
  }
  if (lastUserIdx > 0) {
    const historySlice = messages.slice(0, lastUserIdx);
    const trailingSlice = messages.slice(lastUserIdx);
    const checkpointEntries = historySlice.map(summarizeMessageForCheckpoint).filter(Boolean);
    const blocks = [];
    if (checkpointEntries.length > 0) {
      blocks.push({
        type: "text",
        text: `<conversation-checkpoint>
Prior conversation context:
${checkpointEntries.join("\n")}
</conversation-checkpoint>`
      });
    }
    for (const msg of trailingSlice) {
      if (msg.role === "user") {
        for (const part of msg.content) {
          if (part.type === "text") {
            if (part.text) blocks.push({ type: "text", text: part.text });
          } else if (part.type === "file") {
            blocks.push(convertFilePartToAcpBlock(part, capabilities));
          }
        }
      } else {
        const summary = summarizeMessageForCheckpoint(msg);
        if (summary) blocks.push({ type: "text", text: summary });
      }
    }
    return blocks.length > 0 ? blocks : [{ type: "text", text: "Continue." }];
  }
  const allSummaries = messages.map(summarizeMessageForCheckpoint).filter(Boolean);
  return [
    {
      type: "text",
      text: allSummaries.length > 0 ? `<conversation-checkpoint>
${allSummaries.join("\n")}
</conversation-checkpoint>` : "Continue."
    }
  ];
}
function mapAcpUsageToV3(usage) {
  const inputTotal = typeof usage?.inputTokens === "number" ? usage.inputTokens : 0;
  const cacheRead = typeof usage?.cachedReadTokens === "number" ? usage.cachedReadTokens : 0;
  const cacheWrite = typeof usage?.cachedWriteTokens === "number" ? usage.cachedWriteTokens : 0;
  const noCache = Math.max(0, inputTotal - cacheRead);
  const outputText = typeof usage?.outputTokens === "number" ? usage.outputTokens : 0;
  const reasoning = typeof usage?.thoughtTokens === "number" ? usage.thoughtTokens : 0;
  const outputTotal = outputText + reasoning;
  const raw = {};
  if (usage) {
    if (typeof usage.inputTokens === "number") raw.inputTokens = usage.inputTokens;
    if (typeof usage.outputTokens === "number") raw.outputTokens = usage.outputTokens;
    if (typeof usage.cachedReadTokens === "number") raw.cachedReadTokens = usage.cachedReadTokens;
    if (typeof usage.cachedWriteTokens === "number") raw.cachedWriteTokens = usage.cachedWriteTokens;
    if (typeof usage.thoughtTokens === "number") raw.thoughtTokens = usage.thoughtTokens;
    if (typeof usage.totalTokens === "number") raw.totalTokens = usage.totalTokens;
  }
  return {
    inputTokens: {
      total: inputTotal,
      noCache,
      cacheRead,
      cacheWrite
    },
    outputTokens: {
      total: outputTotal,
      text: outputText,
      reasoning
    },
    ...Object.keys(raw).length > 0 ? { raw } : {}
  };
}
function mapAcpStopReasonToV3(stopReason) {
  switch (stopReason) {
    case "end_turn":
      return { unified: "stop", raw: stopReason };
    case "max_tokens":
      return { unified: "length", raw: stopReason };
    case "refusal":
      return { unified: "content-filter", raw: stopReason };
    case "tool_use":
    case "tool_calls":
      return { unified: "tool-calls", raw: stopReason };
    case "cancelled":
    case "max_turn_requests":
      return { unified: "other", raw: stopReason };
    default:
      return { unified: "stop", raw: stopReason ?? "end_turn" };
  }
}
function synthesizeNativeToolOutput(payload) {
  if (payload.rawOutput !== void 0 && payload.rawOutput !== null) {
    try {
      return JSON.parse(JSON.stringify(payload.rawOutput));
    } catch {
      return String(payload.rawOutput);
    }
  }
  if (Array.isArray(payload.content) && payload.content.length > 0) {
    const texts = [];
    const diffs = [];
    for (const entry of payload.content) {
      if (entry.content?.type === "text" && entry.content.text) {
        texts.push(entry.content.text);
      } else if (entry.type === "diff" && entry.path) {
        diffs.push({
          path: entry.path,
          oldText: entry.oldText ?? null,
          newText: entry.newText ?? ""
        });
      } else if (entry.terminalId) {
        texts.push(`[Terminal ${entry.terminalId}]`);
      }
    }
    if (diffs.length > 0) {
      return {
        diffs,
        ...texts.length > 0 ? { output: texts.join("\n") } : {}
      };
    }
    if (texts.length > 0) {
      return texts.join("\n");
    }
  }
  if (Array.isArray(payload.locations) && payload.locations.length > 0) {
    return {
      locations: payload.locations.map((loc) => ({
        path: loc.path,
        ...typeof loc.line === "number" ? { line: loc.line } : {}
      }))
    };
  }
  return {
    status: payload.status ?? "completed",
    ...payload.title ? { title: payload.title } : {}
  };
}
function selectPermissionOption(options, allow) {
  if (allow) {
    const preferred = options.find((o) => o.kind === "allow_once") ?? options.find((o) => o.kind === "allow_always") ?? options.find((o) => o.kind.startsWith("allow"));
    if (preferred) {
      return { outcome: { outcome: "selected", optionId: preferred.optionId } };
    }
  } else {
    const rejected = options.find((o) => o.kind === "reject_once") ?? options.find((o) => o.kind === "reject_always") ?? options.find((o) => o.kind.startsWith("reject"));
    if (rejected) {
      return { outcome: { outcome: "selected", optionId: rejected.optionId } };
    }
  }
  return { outcome: { outcome: "cancelled" } };
}
function mapNativeToolPermissionChecks(params, cwd) {
  const tc = params.toolCall;
  const kind = (tc.kind ?? "").toLowerCase();
  const title = (tc.title ?? "").trim();
  const rawInput = tc.rawInput && typeof tc.rawInput === "object" && !Array.isArray(tc.rawInput) ? tc.rawInput : {};
  const paths = [];
  if (Array.isArray(tc.locations)) {
    for (const loc of tc.locations) {
      if (typeof loc?.path === "string" && loc.path.trim()) {
        paths.push(loc.path.trim());
      }
    }
  }
  for (const key of ["path", "filePath", "TargetFile", "DirectoryPath", "SearchPath"]) {
    const val = rawInput[key];
    if (typeof val === "string" && val.trim() && !paths.includes(val.trim())) {
      paths.push(val.trim());
    }
  }
  const externalDirs = [];
  for (const p of paths) {
    const abs = isAbsolute2(p) ? resolve2(p) : resolve2(cwd, p);
    const rel = relative(resolve2(cwd), abs);
    if (rel === ".." || rel.startsWith("../") || rel.startsWith("..\\") || isAbsolute2(rel)) {
      externalDirs.push(abs);
    }
  }
  const checks = [];
  if (externalDirs.length > 0) {
    checks.push({
      action: "external_directory",
      resources: externalDirs,
      metadata: { title, kind }
    });
  }
  if (kind === "execute" || /\brun[_\s-]*command\b|\bterminal\b|\bbash\b/i.test(title)) {
    const cmd = typeof rawInput.CommandLine === "string" ? rawInput.CommandLine : typeof rawInput.command === "string" ? rawInput.command : title || "command";
    checks.push({
      action: "shell",
      resources: [cmd],
      metadata: { title, kind, rawInput }
    });
  } else if (kind === "edit" || kind === "delete" || kind === "move" || /\bedit\b|\bwrite\b/i.test(title)) {
    checks.push({
      action: "edit",
      resources: paths.length > 0 ? paths : [title || "file"],
      metadata: { title, kind, rawInput }
    });
  } else if (kind === "search" || /search_web|web[\s_-]*search/i.test(title)) {
    const query = typeof rawInput.query === "string" ? rawInput.query : title || "search_web";
    checks.push({
      action: "websearch",
      resources: [query],
      metadata: { title, kind, rawInput }
    });
  } else if (kind === "fetch" || /read_url|fetch/i.test(title)) {
    const url = typeof rawInput.url === "string" ? rawInput.url : typeof rawInput.Url === "string" ? rawInput.Url : title || "url";
    checks.push({
      action: "webfetch",
      resources: [url],
      metadata: { title, kind, rawInput }
    });
  } else if (checks.length === 0 && kind !== "read" && kind !== "think") {
    checks.push({
      action: kind || "tool",
      resources: paths.length > 0 ? paths : [title || tc.toolCallId],
      metadata: { title, kind, rawInput }
    });
  }
  return checks;
}
var StepStreamEmitter = class {
  constructor(enqueue, modelId) {
    this.enqueue = enqueue;
    this.modelId = modelId;
    this.enqueue({ type: "stream-start", warnings: [] });
    this.enqueue({
      type: "response-metadata",
      id: `agy_resp_${randomUUID2().slice(0, 12)}`,
      timestamp: /* @__PURE__ */ new Date(),
      modelId: this.modelId
    });
  }
  enqueue;
  modelId;
  openReasoningId;
  openTextId;
  emittedVisibleOutput = false;
  finished = false;
  seq = 0;
  get hasVisibleOutput() {
    return this.emittedVisibleOutput;
  }
  emitReasoningDelta(delta) {
    if (this.finished || !delta) return;
    this.closeTextBlock();
    if (!this.openReasoningId) {
      this.openReasoningId = `agy_think_${++this.seq}`;
      this.enqueue({ type: "reasoning-start", id: this.openReasoningId });
    }
    this.emittedVisibleOutput = true;
    this.enqueue({
      type: "reasoning-delta",
      id: this.openReasoningId,
      delta
    });
  }
  emitTextDelta(delta) {
    if (this.finished || !delta) return;
    this.closeReasoningBlock();
    if (!this.openTextId) {
      this.openTextId = `agy_txt_${++this.seq}`;
      this.enqueue({ type: "text-start", id: this.openTextId });
    }
    this.emittedVisibleOutput = true;
    this.enqueue({
      type: "text-delta",
      id: this.openTextId,
      delta
    });
  }
  emitOpenCodeToolCalls(calls) {
    if (this.finished) return;
    this.closeOpenTextAndReasoning();
    for (const call of calls) {
      this.emittedVisibleOutput = true;
      this.enqueue({
        type: "tool-input-start",
        id: call.callId,
        toolName: call.toolName,
        providerExecuted: false
      });
      this.enqueue({
        type: "tool-input-delta",
        id: call.callId,
        delta: call.argsJson
      });
      this.enqueue({
        type: "tool-input-end",
        id: call.callId
      });
      this.enqueue({
        type: "tool-call",
        toolCallId: call.callId,
        toolName: call.toolName,
        input: call.argsJson,
        providerExecuted: false
      });
    }
  }
  emitNativeHostedToolCall(toolCallId, toolName, inputJson, title) {
    if (this.finished) return;
    this.closeOpenTextAndReasoning();
    this.emittedVisibleOutput = true;
    this.enqueue({
      type: "tool-input-start",
      id: toolCallId,
      toolName,
      providerExecuted: true,
      ...title ? { title } : {}
    });
    this.enqueue({
      type: "tool-input-delta",
      id: toolCallId,
      delta: inputJson
    });
    this.enqueue({
      type: "tool-input-end",
      id: toolCallId
    });
    this.enqueue({
      type: "tool-call",
      toolCallId,
      toolName,
      input: inputJson,
      providerExecuted: true
    });
  }
  emitNativeHostedToolResult(toolCallId, toolName, result, isError) {
    if (this.finished) return;
    this.closeOpenTextAndReasoning();
    this.emittedVisibleOutput = true;
    this.enqueue({
      type: "tool-result",
      toolCallId,
      toolName,
      result,
      ...isError ? { isError: true } : {}
    });
  }
  finish(finishReason, usage) {
    if (this.finished) return;
    this.closeOpenTextAndReasoning();
    this.finished = true;
    this.enqueue({
      type: "finish",
      finishReason,
      usage
    });
  }
  emitError(error) {
    if (this.finished) return;
    this.closeOpenTextAndReasoning();
    this.finished = true;
    this.enqueue({ type: "error", error });
  }
  closeReasoningBlock() {
    if (this.openReasoningId) {
      this.enqueue({ type: "reasoning-end", id: this.openReasoningId });
      this.openReasoningId = void 0;
    }
  }
  closeTextBlock() {
    if (this.openTextId) {
      this.enqueue({ type: "text-end", id: this.openTextId });
      this.openTextId = void 0;
    }
  }
  closeOpenTextAndReasoning() {
    this.closeReasoningBlock();
    this.closeTextBlock();
  }
};
var ActiveAcpTurn = class {
  constructor(params) {
    this.params = params;
  }
  params;
  emitter;
  bufferedUpdates = [];
  nativeTools = /* @__PURE__ */ new Map();
  latestUsage;
  anyTurnOutput = false;
  promptSettled = false;
  promptResult;
  promptError;
  promptWakeups = [];
  watchdogTimer;
  pendingPermissionCount = 0;
  unsubscribeUpdates;
  unsubscribePermission;
  cleanedUp = false;
  stepEpochValue = 0;
  get hasEmittedAnyOutput() {
    return this.anyTurnOutput;
  }
  get isPromptSettled() {
    return this.promptSettled;
  }
  get stepEpoch() {
    return this.stepEpochValue;
  }
  startPrompt(promptBlocks) {
    this.unsubscribeUpdates = this.params.connection.onSessionUpdate(
      this.params.acpSessionId,
      (notification) => {
        this.touchWatchdog();
        this.handleUpdate(notification.update);
      }
    );
    this.unsubscribePermission = this.params.connection.setPermissionHandler(
      this.params.acpSessionId,
      (permParams) => this.handlePermissionRequest(permParams)
    );
    this.params.mcpBridge?.beginTurn();
    this.params.mcpBridge?.setOnActivity(() => {
      this.touchWatchdog();
    });
    this.armWatchdog();
    this.params.connection.prompt({
      sessionId: this.params.acpSessionId,
      prompt: promptBlocks
    }).then(
      (res) => {
        if (res.usage) {
          this.latestUsage = res.usage;
        }
        this.promptResult = res;
        this.promptSettled = true;
        this.notifyPromptWakeups();
      },
      (err) => {
        if (!this.promptError) {
          this.promptError = err;
        }
        this.promptSettled = true;
        this.notifyPromptWakeups();
      }
    );
  }
  /**
   * Drives a single OpenCode `doStream` step:
   * - Either yields a batch of parked OpenCode MCP tool calls (`finishReason = tool-calls`),
   * - Or finishes when `session/prompt` completes (`finishReason = stop`),
   * - Or throws/emits an enriched `AgyTurnOutcomeError` if ACP/SQLite reported an error.
   */
  async executeStep(emitter, options) {
    this.stepEpochValue += 1;
    this.emitter = emitter;
    if (this.bufferedUpdates.length > 0) {
      const pending = this.bufferedUpdates.splice(0, this.bufferedUpdates.length);
      for (const u of pending) {
        this.processUpdateWithEmitter(u, emitter);
      }
    }
    if (options?.supplyToolResults?.length && this.params.mcpBridge) {
      this.params.mcpBridge.supplyToolResults(options.supplyToolResults);
      this.armWatchdog();
    }
    let cleanupAbort;
    const abortPromise = new Promise((resolveAbort) => {
      if (!options?.signal) return;
      if (options.signal.aborted) {
        resolveAbort({
          kind: "aborted",
          error: options.signal.reason instanceof Error ? options.signal.reason : new DOMException("The operation was aborted.", "AbortError")
        });
        return;
      }
      const onAbort = () => {
        resolveAbort({
          kind: "aborted",
          error: options.signal?.reason instanceof Error ? options.signal.reason : new DOMException("The operation was aborted.", "AbortError")
        });
      };
      options.signal.addEventListener("abort", onAbort, { once: true });
      cleanupAbort = () => options.signal?.removeEventListener("abort", onAbort);
    });
    const promptDonePromise = this.waitForPromptSettlement().then(
      () => ({ kind: "prompt_settled" })
    );
    const raceCandidates = [promptDonePromise, abortPromise];
    const stepWaiterAbort = new AbortController();
    if (this.params.mcpBridge) {
      raceCandidates.push(
        this.params.mcpBridge.waitForNextToolBatch(stepWaiterAbort.signal).then((calls) => ({ kind: "tool_batch", calls }))
      );
    }
    try {
      const winner = await Promise.race(raceCandidates);
      if (winner.kind === "aborted") {
        await this.abortTurn();
        throw winner.error;
      }
      if (winner.kind === "tool_batch") {
        this.anyTurnOutput = true;
        emitter.emitOpenCodeToolCalls(winner.calls);
        emitter.finish(
          { unified: "tool-calls", raw: "tool_use" },
          mapAcpUsageToV3(this.latestUsage)
        );
        this.emitter = void 0;
        this.clearWatchdog();
        return { turnDone: false };
      }
      if (options?.signal?.aborted) {
        await this.abortTurn();
        throw options.signal.reason instanceof Error ? options.signal.reason : new DOMException("The operation was aborted.", "AbortError");
      }
      await this.finalizePromptSettlement(emitter);
      return { turnDone: true };
    } finally {
      stepWaiterAbort.abort();
      cleanupAbort?.();
      if (this.emitter === emitter) {
        this.emitter = void 0;
      }
    }
  }
  async finalizePromptSettlement(emitter) {
    this.clearWatchdog();
    if (this.params.toolMode === "hybrid") {
      for (const [toolCallId, tracked] of this.nativeTools.entries()) {
        if (tracked.emittedCall && !tracked.settledResult) {
          tracked.settledResult = true;
          const synthesized = synthesizeNativeToolOutput(tracked.latestPayload);
          emitter.emitNativeHostedToolResult(
            toolCallId,
            tracked.toolName,
            synthesized,
            tracked.latestPayload.status === "failed"
          );
        }
      }
    }
    const shouldInspectDb = Boolean(this.promptError) || !this.anyTurnOutput && !emitter.hasVisibleOutput;
    if (shouldInspectDb) {
      const dbOutcome = await inspectTurnOutcomeFromDb(
        this.params.dbPath,
        this.params.preTurnMaxIdx
      );
      if (dbOutcome) {
        await this.cleanup();
        throw new AgyTurnOutcomeError(dbOutcome);
      }
    }
    if (this.promptError) {
      const err = this.promptError;
      await this.cleanup();
      throw err;
    }
    const finishReason = mapAcpStopReasonToV3(this.promptResult?.stopReason);
    const usage = mapAcpUsageToV3(this.promptResult?.usage ?? this.latestUsage);
    emitter.finish(finishReason, usage);
    await this.cleanup();
    await this.params.onTurnFullyCompleted?.();
  }
  async abortTurn() {
    this.clearWatchdog();
    this.params.mcpBridge?.endTurn("Cancelled.");
    this.params.connection.cancelSession(this.params.acpSessionId);
    await this.cleanup();
  }
  async cleanup() {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    this.clearWatchdog();
    this.params.mcpBridge?.endTurn("Turn completed.");
    this.params.mcpBridge?.setOnActivity(void 0);
    this.unsubscribeUpdates?.();
    this.unsubscribeUpdates = void 0;
    this.unsubscribePermission?.();
    this.unsubscribePermission = void 0;
  }
  waitForPromptSettlement() {
    if (this.promptSettled) return Promise.resolve();
    return new Promise((resolve3) => {
      this.promptWakeups.push(resolve3);
    });
  }
  notifyPromptWakeups() {
    const wakeups = this.promptWakeups.splice(0, this.promptWakeups.length);
    for (const fn of wakeups) {
      fn();
    }
  }
  isPausedOnClient() {
    return this.pendingPermissionCount > 0 || Boolean(this.params.mcpBridge?.hasParkedToolCalls);
  }
  clearWatchdog() {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = void 0;
    }
  }
  touchWatchdog() {
    if (this.promptSettled || this.cleanedUp) return;
    if (this.isPausedOnClient()) {
      this.clearWatchdog();
      return;
    }
    this.armWatchdog();
  }
  armWatchdog() {
    this.clearWatchdog();
    if (this.promptSettled || this.cleanedUp || this.params.watchdogTimeoutMs <= 0) {
      return;
    }
    if (this.isPausedOnClient()) {
      return;
    }
    this.watchdogTimer = setTimeout(() => {
      void this.onWatchdogTick();
    }, this.params.watchdogTimeoutMs);
    this.watchdogTimer.unref?.();
  }
  async onWatchdogTick() {
    if (this.promptSettled || this.cleanedUp || this.isPausedOnClient()) {
      return;
    }
    const dbOutcome = await inspectTurnOutcomeFromDb(
      this.params.dbPath,
      this.params.preTurnMaxIdx
    );
    if (dbOutcome) {
      this.promptError = new AgyTurnOutcomeError(dbOutcome);
      this.promptSettled = true;
      this.params.mcpBridge?.endTurn(dbOutcome.message);
      this.params.connection.cancelSession(this.params.acpSessionId);
      this.notifyPromptWakeups();
      return;
    }
    this.armWatchdog();
  }
  handleUpdate(update) {
    if (update.sessionUpdate === "config_option_update") {
      this.params.onConfigUpdate?.(update.configOptions);
      return;
    }
    if (update.sessionUpdate === "usage_update") {
      if (update.usage) {
        this.latestUsage = update.usage;
      } else if (typeof update.inputTokens === "number" || typeof update.outputTokens === "number") {
        this.latestUsage = update;
      }
      return;
    }
    if (!this.emitter) {
      this.bufferedUpdates.push(update);
      return;
    }
    this.processUpdateWithEmitter(update, this.emitter);
  }
  processUpdateWithEmitter(update, emitter) {
    switch (update.sessionUpdate) {
      case "agent_thought_chunk": {
        if (update.content?.type === "text" && update.content.text) {
          this.anyTurnOutput = true;
          emitter.emitReasoningDelta(update.content.text);
        }
        return;
      }
      case "agent_message_chunk": {
        if (update.content?.type === "text" && update.content.text) {
          this.anyTurnOutput = true;
          emitter.emitTextDelta(update.content.text);
        }
        return;
      }
      case "tool_call":
      case "tool_call_update": {
        if (this.params.toolMode !== "hybrid" || isAgyMcpBridgedToolCall({
          title: update.title,
          toolCallId: update.toolCallId,
          meta: update._meta
        })) {
          return;
        }
        const toolCallId = update.toolCallId;
        if (!toolCallId) return;
        let tracked = this.nativeTools.get(toolCallId);
        const inferredName = stripAgyMcpTitlePrefix(update.title ?? "") || update.kind || "antigravity_tool";
        if (!tracked) {
          tracked = {
            toolName: inferredName,
            ...update.title ? { title: update.title } : {},
            emittedCall: false,
            settledResult: false,
            latestPayload: update
          };
          this.nativeTools.set(toolCallId, tracked);
        } else {
          tracked.latestPayload = {
            ...tracked.latestPayload,
            ...update,
            ...update.rawInput !== void 0 ? { rawInput: update.rawInput } : {},
            ...update.rawOutput !== void 0 ? { rawOutput: update.rawOutput } : {},
            ...update.content ? { content: update.content } : {},
            ...update.locations ? { locations: update.locations } : {}
          };
        }
        const status = tracked.latestPayload.status;
        const hasInput = tracked.latestPayload.rawInput !== void 0;
        if (!tracked.emittedCall && (hasInput || status === "completed" || status === "failed")) {
          tracked.emittedCall = true;
          this.anyTurnOutput = true;
          const inputJson = JSON.stringify(
            tracked.latestPayload.rawInput && typeof tracked.latestPayload.rawInput === "object" ? tracked.latestPayload.rawInput : {}
          );
          emitter.emitNativeHostedToolCall(
            toolCallId,
            tracked.toolName,
            inputJson,
            tracked.title
          );
        }
        if (tracked.emittedCall && !tracked.settledResult && (status === "completed" || status === "failed")) {
          tracked.settledResult = true;
          const output = synthesizeNativeToolOutput(tracked.latestPayload);
          emitter.emitNativeHostedToolResult(
            toolCallId,
            tracked.toolName,
            output,
            status === "failed"
          );
        }
        return;
      }
      default:
        return;
    }
  }
  async handlePermissionRequest(permParams) {
    if (isAgyMcpBridgedToolCall({
      title: permParams.toolCall.title,
      toolCallId: permParams.toolCall.toolCallId,
      meta: permParams.toolCall._meta ?? permParams._meta
    })) {
      return selectPermissionOption(permParams.options, true);
    }
    if (this.params.toolMode !== "hybrid") {
      return selectPermissionOption(permParams.options, false);
    }
    if (!this.params.permission?.assert || !this.params.openCodeSessionId) {
      return selectPermissionOption(permParams.options, true);
    }
    this.pendingPermissionCount += 1;
    this.clearWatchdog();
    try {
      const checks = mapNativeToolPermissionChecks(permParams, this.params.cwd);
      for (const check of checks) {
        await this.params.permission.assert({
          sessionID: this.params.openCodeSessionId,
          ...this.params.agent ? { agent: this.params.agent } : {},
          action: check.action,
          resources: check.resources,
          metadata: check.metadata
        });
      }
      return selectPermissionOption(permParams.options, true);
    } catch {
      return selectPermissionOption(permParams.options, false);
    } finally {
      this.pendingPermissionCount = Math.max(0, this.pendingPermissionCount - 1);
      this.touchWatchdog();
    }
  }
};
var AgySessionManager = class {
  constructor(deps) {
    this.deps = deps;
  }
  deps;
  liveSessions = /* @__PURE__ */ new Map();
  persistedRecords = /* @__PURE__ */ new Map();
  sessionLocks = /* @__PURE__ */ new Map();
  disposed = false;
  getSessionLock(sessionId) {
    let lock = this.sessionLocks.get(sessionId);
    if (!lock) {
      lock = new AsyncLock();
      this.sessionLocks.set(sessionId, lock);
    }
    return lock;
  }
  async loadPersistedRecord(openCodeSessionId) {
    const inMem = this.persistedRecords.get(openCodeSessionId);
    if (inMem) return inMem;
    if (!this.deps.storage) return void 0;
    try {
      const raw = await this.deps.storage.get(
        `${AGY_STORAGE_SESSION_PREFIX}${openCodeSessionId}`
      );
      if (raw && typeof raw === "object" && typeof raw.acpSessionId === "string") {
        const rec = raw;
        this.persistedRecords.set(openCodeSessionId, rec);
        return rec;
      }
    } catch {
    }
    return void 0;
  }
  async savePersistedRecord(openCodeSessionId, record) {
    this.persistedRecords.set(openCodeSessionId, record);
    if (!this.deps.storage) return;
    await this.deps.storage.set(`${AGY_STORAGE_SESSION_PREFIX}${openCodeSessionId}`, record).catch(() => {
    });
  }
  createStream(requestedModelId, callOptions) {
    const routing = extractCallRoutingMetadata(callOptions);
    const isStateful = Boolean(routing.sessionId && routing.kind === "primary");
    const streamAbort = new AbortController();
    let cleanupUpstreamAbort;
    if (callOptions.abortSignal) {
      if (callOptions.abortSignal.aborted) {
        streamAbort.abort(callOptions.abortSignal.reason);
      } else {
        const onUpstreamAbort = () => {
          streamAbort.abort(callOptions.abortSignal?.reason);
        };
        callOptions.abortSignal.addEventListener("abort", onUpstreamAbort, { once: true });
        cleanupUpstreamAbort = () => {
          callOptions.abortSignal?.removeEventListener("abort", onUpstreamAbort);
        };
      }
    }
    const effectiveCallOptions = {
      ...callOptions,
      abortSignal: streamAbort.signal
    };
    let controllerSettled = false;
    let streamCancelled = false;
    let runPromise;
    let parkedStep;
    return new ReadableStream({
      start: (controller) => {
        const safeEnqueue = (part) => {
          if (controllerSettled || streamCancelled) return;
          try {
            controller.enqueue(part);
          } catch {
            controllerSettled = true;
          }
        };
        const safeClose = () => {
          if (controllerSettled || streamCancelled) return;
          controllerSettled = true;
          try {
            controller.close();
          } catch {
          }
        };
        const safeError = (err) => {
          if (controllerSettled || streamCancelled) return;
          controllerSettled = true;
          try {
            controller.error(err);
          } catch {
          }
        };
        runPromise = (async () => {
          try {
            if (isStateful && routing.sessionId) {
              await this.runStatefulSessionStep(
                routing.sessionId,
                requestedModelId,
                effectiveCallOptions,
                routing,
                safeEnqueue,
                (info) => {
                  parkedStep = info;
                }
              );
            } else {
              await this.runStatelessAuxiliaryCall(
                requestedModelId,
                effectiveCallOptions,
                routing,
                safeEnqueue
              );
            }
            safeClose();
          } catch (error) {
            if (!streamCancelled) {
              if (!streamAbort.signal.aborted) {
                this.inspectForAuthFailure(error);
              }
              safeError(
                streamAbort.signal.aborted ? error instanceof Error ? error : new Error(String(error)) : this.normalizeOutboundError(error)
              );
            }
          } finally {
            cleanupUpstreamAbort?.();
            cleanupUpstreamAbort = void 0;
          }
        })();
      },
      cancel: async (reason) => {
        streamCancelled = true;
        controllerSettled = true;
        if (!streamAbort.signal.aborted) {
          streamAbort.abort(
            reason instanceof Error ? reason : new DOMException(
              reason !== void 0 ? String(reason) : "The stream was cancelled.",
              "AbortError"
            )
          );
        }
        cleanupUpstreamAbort?.();
        cleanupUpstreamAbort = void 0;
        if (runPromise) {
          await runPromise.catch(() => {
          });
        }
        const pendingParked = parkedStep;
        parkedStep = void 0;
        if (pendingParked && !this.disposed) {
          await this.getSessionLock(pendingParked.openCodeSessionId).run(async () => {
            const live = this.liveSessions.get(pendingParked.openCodeSessionId);
            if (live?.activeTurn === pendingParked.turn && pendingParked.turn.stepEpoch === pendingParked.stepEpoch) {
              live.activeTurn = void 0;
              await pendingParked.turn.abortTurn();
            }
          }).catch(() => {
          });
        }
      }
    });
  }
  inspectForAuthFailure(error) {
    const classified = classifyAcpAuthError(error);
    if (classified.state === "needs_auth" || classified.state === "missing") {
      this.deps.onAuthFailure?.(classified.message);
    }
  }
  normalizeOutboundError(error) {
    if (error instanceof AgyTurnOutcomeError || error instanceof AcpRpcError) {
      return error;
    }
    const classified = classifyAcpAuthError(error);
    if (classified.state === "needs_auth" || classified.state === "missing") {
      return new AcpRpcError({
        code: -32e3,
        status: 401,
        message: classified.message,
        isRetryable: false,
        cause: error
      });
    }
    return error instanceof Error ? error : new Error(String(error));
  }
  async applySessionModelThoughtAndMode(connection, acpSessionId, requestedModelId, requestedEffort, requestedMode, agent, currentConfigOptions, modes, signal) {
    let configOptions = [...currentConfigOptions];
    const firstPass = this.deps.catalog.resolveAcpModelAndThoughtLevel(
      requestedModelId,
      requestedEffort,
      configOptions
    );
    const modelOpt = findConfigOption(configOptions, "model");
    if (modelOpt && modelOpt.currentValue !== firstPass.modelId) {
      const res = await connection.setConfigOption(
        acpSessionId,
        modelOpt.id,
        firstPass.modelId,
        { signal }
      );
      configOptions = mergeSessionConfigOptions(configOptions, res.configOptions);
      this.deps.catalog.applyIncrementalConfigOptions(configOptions);
    }
    const secondPass = this.deps.catalog.resolveAcpModelAndThoughtLevel(
      firstPass.modelId,
      requestedEffort,
      configOptions
    );
    const thoughtOpt = findConfigOption(configOptions, "thought_level");
    if (thoughtOpt && secondPass.thoughtLevel && thoughtOpt.currentValue !== secondPass.thoughtLevel) {
      const res = await connection.setConfigOption(
        acpSessionId,
        thoughtOpt.id,
        secondPass.thoughtLevel,
        { signal }
      );
      configOptions = mergeSessionConfigOptions(configOptions, res.configOptions);
      this.deps.catalog.applyIncrementalConfigOptions(configOptions);
    }
    const desiredMode = requestedMode ?? (agent?.toLowerCase() === "plan" ? "plan" : void 0);
    if (desiredMode && modes?.availableModes?.length) {
      const validMode = modes.availableModes.find(
        (m) => m.id.toLowerCase() === desiredMode.toLowerCase()
      );
      if (validMode && modes.currentModeId !== validMode.id) {
        await connection.setMode(acpSessionId, validMode.id, { signal }).catch(() => {
        });
      }
    }
    return configOptions;
  }
  async runStatefulSessionStep(openCodeSessionId, requestedModelId, callOptions, routing, enqueue, onStepParked) {
    await this.getSessionLock(openCodeSessionId).run(async () => {
      if (this.disposed) {
        throw new Error("Antigravity session manager has been disposed.");
      }
      const { systemAppend, systemHash, nonSystemMessages, digests } = extractSystemAndConversation(callOptions.prompt, callOptions);
      const existingLive = this.liveSessions.get(openCodeSessionId);
      if (existingLive?.activeTurn && existingLive.mcpBridge.hasParkedToolCalls) {
        const trailingToolResults = extractTrailingToolResults(nonSystemMessages);
        if (trailingToolResults.length > 0 && existingLive.connection.alive) {
          existingLive.mcpBridge.updateTools(
            callOptions.tools,
            callOptions.toolChoice,
            existingLive.toolMode
          );
          const emitter = new StepStreamEmitter(enqueue, requestedModelId);
          const resumedTurn = existingLive.activeTurn;
          try {
            const { turnDone } = await resumedTurn.executeStep(emitter, {
              signal: callOptions.abortSignal,
              supplyToolResults: trailingToolResults
            });
            if (!turnDone && callOptions.abortSignal?.aborted) {
              existingLive.activeTurn = void 0;
              await resumedTurn.abortTurn();
              throw callOptions.abortSignal.reason instanceof Error ? callOptions.abortSignal.reason : new DOMException("The operation was aborted.", "AbortError");
            }
            if (turnDone) {
              existingLive.activeTurn = void 0;
              await this.savePersistedRecord(openCodeSessionId, {
                acpSessionId: existingLive.acpSessionId,
                cwd: existingLive.cwd,
                systemHash: existingLive.systemHash,
                syncedMessageDigests: digests,
                updatedAt: Date.now()
              });
            } else {
              onStepParked?.({
                openCodeSessionId,
                turn: resumedTurn,
                stepEpoch: resumedTurn.stepEpoch
              });
            }
            return;
          } catch (err) {
            existingLive.activeTurn = void 0;
            throw err;
          }
        }
        await existingLive.activeTurn.abortTurn();
        existingLive.activeTurn = void 0;
      }
      if (callOptions.toolChoice?.type === "none") {
        await this.runStatelessAuxiliaryCall(
          requestedModelId,
          callOptions,
          routing,
          enqueue
        );
        return;
      }
      await this.executeNewOrResumedStatefulTurn({
        openCodeSessionId,
        requestedModelId,
        callOptions,
        routing,
        systemAppend,
        systemHash,
        nonSystemMessages,
        digests,
        enqueue,
        onStepParked,
        forceFreshSession: false
      });
    }, callOptions.abortSignal);
  }
  async executeNewOrResumedStatefulTurn(input) {
    const baseSpawnConfig = await this.deps.getSpawnConfig();
    const toolMode = input.routing.toolModeOverride ?? this.deps.getToolMode();
    const spawnConfig = {
      ...baseSpawnConfig,
      includeDefaultCustomizations: baseSpawnConfig.includeDefaultCustomizations ?? (toolMode !== "hybrid" ? false : void 0)
    };
    const cwd = spawnConfig.cwd ?? process.cwd();
    const persisted = input.forceFreshSession ? void 0 : await this.loadPersistedRecord(input.openCodeSessionId);
    const isStrictExtension = Boolean(persisted) && !input.routing.forkSourceSessionId && persisted.cwd === cwd && persisted.syncedMessageDigests.length > 0 && input.digests.length > persisted.syncedMessageDigests.length && persisted.syncedMessageDigests.every(
      (digest, index) => input.digests[index] === digest
    );
    let live = this.liveSessions.get(input.openCodeSessionId);
    if (live && (!live.connection.alive || live.cwd !== cwd || live.toolMode !== toolMode || live.systemHash !== input.systemHash || input.forceFreshSession || !isStrictExtension)) {
      await this.disposeLiveBinding(input.openCodeSessionId, live);
      live = void 0;
    }
    let resumedExistingSession = false;
    if (live && isStrictExtension && persisted && live.acpSessionId === persisted.acpSessionId) {
      resumedExistingSession = true;
    } else {
      const mcpBridge = new OpenCodeMcpBridge();
      await mcpBridge.start();
      mcpBridge.updateTools(input.callOptions.tools, input.callOptions.toolChoice, toolMode);
      let connection;
      let release;
      let setup;
      try {
        const lease = await this.deps.pool.acquire(spawnConfig, {
          signal: input.callOptions.abortSignal
        });
        connection = lease.connection;
        release = lease.release;
        const mcpServer = mcpBridge.toAcpMcpServer(
          connection.initializeResult?.agentCapabilities
        );
        const sessionMeta = {
          disableBuiltInTools: toolMode !== "hybrid",
          ...input.systemAppend ? {
            antigravity: {
              systemPrompt: {
                append: input.systemAppend
              }
            }
          } : {}
        };
        if (isStrictExtension && persisted) {
          try {
            setup = await connection.resumeSession(
              {
                sessionId: persisted.acpSessionId,
                cwd,
                mcpServers: [mcpServer],
                _meta: sessionMeta
              },
              { signal: input.callOptions.abortSignal }
            );
            resumedExistingSession = true;
          } catch {
            resumedExistingSession = false;
          }
        }
        if (!setup) {
          setup = await connection.createSession(
            {
              cwd,
              mcpServers: [mcpServer],
              _meta: sessionMeta
            },
            { signal: input.callOptions.abortSignal }
          );
        }
      } catch (err) {
        await mcpBridge.close().catch(() => {
        });
        release?.();
        throw err;
      }
      const initialConfigOptions = setup.configOptions ? [...setup.configOptions] : [];
      this.deps.catalog.applyIncrementalConfigOptions(initialConfigOptions);
      live = {
        acpSessionId: setup.sessionId,
        connection,
        releaseWorker: release,
        mcpBridge,
        cwd,
        toolMode,
        systemHash: input.systemHash,
        configOptions: initialConfigOptions,
        modes: setup.modes
      };
      this.liveSessions.set(input.openCodeSessionId, live);
    }
    live.mcpBridge.updateTools(input.callOptions.tools, input.callOptions.toolChoice, toolMode);
    live.configOptions = await this.applySessionModelThoughtAndMode(
      live.connection,
      live.acpSessionId,
      input.requestedModelId,
      input.routing.effort,
      input.routing.mode,
      input.routing.agent,
      live.configOptions,
      live.modes,
      input.callOptions.abortSignal
    );
    let messagesToSend;
    if (resumedExistingSession && persisted) {
      const rawDelta = input.nonSystemMessages.slice(
        persisted.syncedMessageDigests.length
      );
      const firstUserIdx = rawDelta.findIndex((m) => m.role === "user");
      messagesToSend = firstUserIdx > 0 ? rawDelta.slice(firstUserIdx) : rawDelta;
    } else {
      messagesToSend = input.nonSystemMessages;
    }
    const promptBlocks = buildPromptBlocksFromMessages(
      messagesToSend,
      live.connection.initializeResult?.agentCapabilities,
      {
        forceCheckpoint: !resumedExistingSession && (input.forceFreshSession || Boolean(input.routing.forkSourceSessionId))
      }
    );
    const dbPath = resolveSessionDbPath(live.acpSessionId, {
      geminiDir: spawnConfig.geminiDir,
      appDataDir: spawnConfig.appDataDir,
      env: spawnConfig.env
    });
    const preTurnMaxIdx = resumedExistingSession ? await readPreTurnMaxStepIdx(dbPath) : -1;
    const capturedLive = live;
    const turn = new ActiveAcpTurn({
      acpSessionId: capturedLive.acpSessionId,
      openCodeSessionId: input.openCodeSessionId,
      agent: input.routing.agent,
      cwd,
      dbPath,
      preTurnMaxIdx,
      toolMode,
      watchdogTimeoutMs: this.deps.getWatchdogTimeoutMs() > 0 ? this.deps.getWatchdogTimeoutMs() : DEFAULT_WATCHDOG_TIMEOUT_MS,
      connection: capturedLive.connection,
      mcpBridge: capturedLive.mcpBridge,
      permission: this.deps.permission,
      onConfigUpdate: (updated) => {
        capturedLive.configOptions = mergeSessionConfigOptions(
          capturedLive.configOptions,
          updated
        );
        this.deps.catalog.applyIncrementalConfigOptions(capturedLive.configOptions);
      }
    });
    capturedLive.activeTurn = turn;
    turn.startPrompt(promptBlocks);
    let bufferedRetryParts = resumedExistingSession && !input.forceFreshSession ? [] : void 0;
    const emitter = new StepStreamEmitter((part) => {
      if (bufferedRetryParts) {
        if (part.type === "stream-start" || part.type === "response-metadata") {
          bufferedRetryParts.push(part);
          return;
        }
        for (const headerPart of bufferedRetryParts) {
          input.enqueue(headerPart);
        }
        bufferedRetryParts = void 0;
      }
      input.enqueue(part);
    }, input.requestedModelId);
    try {
      const { turnDone } = await turn.executeStep(emitter, {
        signal: input.callOptions.abortSignal
      });
      if (!turnDone && input.callOptions.abortSignal?.aborted) {
        capturedLive.activeTurn = void 0;
        await turn.abortTurn();
        throw input.callOptions.abortSignal.reason instanceof Error ? input.callOptions.abortSignal.reason : new DOMException("The operation was aborted.", "AbortError");
      }
      if (bufferedRetryParts) {
        for (const headerPart of bufferedRetryParts) {
          input.enqueue(headerPart);
        }
        bufferedRetryParts = void 0;
      }
      if (turnDone) {
        capturedLive.activeTurn = void 0;
        await this.savePersistedRecord(input.openCodeSessionId, {
          acpSessionId: capturedLive.acpSessionId,
          cwd,
          systemHash: input.systemHash,
          syncedMessageDigests: input.digests,
          updatedAt: Date.now()
        });
      } else {
        input.onStepParked?.({
          openCodeSessionId: input.openCodeSessionId,
          turn,
          stepEpoch: turn.stepEpoch
        });
      }
    } catch (err) {
      capturedLive.activeTurn = void 0;
      const isSigCorruption = err instanceof AgyTurnOutcomeError && err.isInvalidThinkingSignature || err instanceof Error && isInvalidThinkingSignatureText(err.message);
      if (isSigCorruption && resumedExistingSession && !input.forceFreshSession && !turn.hasEmittedAnyOutput) {
        await this.disposeLiveBinding(input.openCodeSessionId, capturedLive);
        await this.executeNewOrResumedStatefulTurn({
          ...input,
          forceFreshSession: true
        });
        return;
      }
      throw err;
    }
  }
  async runStatelessAuxiliaryCall(requestedModelId, callOptions, routing, enqueue) {
    const baseConfig = await this.deps.getSpawnConfig();
    const tempCwd = mkdtempSync2(
      `${tmpdir2()}/opencode-agy-${routing.kind || "aux"}-`
    );
    const auxConfig = {
      ...baseConfig,
      cwd: baseConfig.cwd ?? tmpdir2(),
      includeDefaultCustomizations: false
    };
    const { systemAppend, nonSystemMessages } = extractSystemAndConversation(
      callOptions.prompt,
      callOptions
    );
    const hasActiveFunctionTools = callOptions.toolChoice?.type !== "none" && Boolean(callOptions.tools?.some((t) => t.type === "function"));
    let mcpBridge;
    if (hasActiveFunctionTools) {
      mcpBridge = new OpenCodeMcpBridge();
      await mcpBridge.start();
      mcpBridge.updateTools(callOptions.tools, callOptions.toolChoice, "opencode");
    }
    let lease;
    let acpSessionId;
    let activeTurn;
    let turnCompleted = false;
    try {
      lease = await this.deps.pool.acquire(auxConfig, {
        signal: callOptions.abortSignal
      });
      const { connection } = lease;
      const mcpServers = mcpBridge ? [mcpBridge.toAcpMcpServer(connection.initializeResult?.agentCapabilities)] : [];
      const setup = await connection.createSession(
        {
          cwd: tempCwd,
          mcpServers,
          _meta: {
            disableBuiltInTools: true,
            ...systemAppend ? {
              antigravity: {
                systemPrompt: {
                  append: systemAppend
                }
              }
            } : {}
          }
        },
        { signal: callOptions.abortSignal }
      );
      acpSessionId = setup.sessionId;
      const initialConfig = setup.configOptions ? [...setup.configOptions] : [];
      await this.applySessionModelThoughtAndMode(
        connection,
        acpSessionId,
        requestedModelId,
        routing.effort,
        routing.mode,
        routing.agent,
        initialConfig,
        setup.modes,
        callOptions.abortSignal
      );
      const promptBlocks = buildPromptBlocksFromMessages(
        nonSystemMessages,
        connection.initializeResult?.agentCapabilities
      );
      const dbPath = resolveSessionDbPath(acpSessionId, {
        geminiDir: auxConfig.geminiDir,
        appDataDir: auxConfig.appDataDir,
        env: auxConfig.env
      });
      const preTurnMaxIdx = -1;
      activeTurn = new ActiveAcpTurn({
        acpSessionId,
        cwd: tempCwd,
        dbPath,
        preTurnMaxIdx,
        toolMode: "opencode",
        watchdogTimeoutMs: this.deps.getWatchdogTimeoutMs() > 0 ? this.deps.getWatchdogTimeoutMs() : DEFAULT_WATCHDOG_TIMEOUT_MS,
        connection,
        ...mcpBridge ? { mcpBridge } : {}
      });
      const emitter = new StepStreamEmitter(enqueue, requestedModelId);
      activeTurn.startPrompt(promptBlocks);
      const { turnDone } = await activeTurn.executeStep(emitter, {
        signal: callOptions.abortSignal
      });
      turnCompleted = turnDone;
    } finally {
      if (activeTurn && !turnCompleted) {
        await activeTurn.abortTurn().catch(() => {
        });
      }
      if (mcpBridge) {
        await mcpBridge.close().catch(() => {
        });
      }
      if (acpSessionId && lease) {
        await lease.connection.closeSession(acpSessionId).catch(() => {
        });
        cleanupSessionDbFiles(acpSessionId, {
          geminiDir: auxConfig.geminiDir,
          appDataDir: auxConfig.appDataDir,
          env: auxConfig.env
        });
      }
      lease?.release();
      try {
        rmSync3(tempCwd, { recursive: true, force: true });
      } catch {
      }
    }
  }
  async disposeLiveBinding(openCodeSessionId, binding) {
    if (this.liveSessions.get(openCodeSessionId) === binding) {
      this.liveSessions.delete(openCodeSessionId);
    }
    if (binding.activeTurn) {
      await binding.activeTurn.abortTurn().catch(() => {
      });
      binding.activeTurn = void 0;
    }
    await binding.connection.closeSession(binding.acpSessionId).catch(() => {
    });
    await binding.mcpBridge.close().catch(() => {
    });
    binding.releaseWorker();
  }
  async dispose() {
    this.disposed = true;
    const tasks = [];
    for (const [sessionId, binding] of this.liveSessions.entries()) {
      tasks.push(this.disposeLiveBinding(sessionId, binding));
    }
    await Promise.all(tasks);
  }
};

// src/plugin/types.ts
function defineOpenCodeV2Plugin(def) {
  return def;
}

// src/plugin/v2-websearch.ts
import { mkdtempSync as mkdtempSync3, rmSync as rmSync4 } from "fs";
import { tmpdir as tmpdir3 } from "os";
var AGY_WEBSEARCH_PROVIDER_ID = AGY_PROVIDER_ID;
var AGY_WEBSEARCH_PROVIDER_NAME = AGY_PROVIDER_NAME;
var DEFAULT_WEBSEARCH_MODEL_CANDIDATES = [
  "gemini-3.8-flash",
  "gemini-3-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-4-argon"
];
var MAX_WEBSEARCH_ATTEMPTS = 3;
function resolveWebSearchConfig(options) {
  const envFlag = process.env.OPENCODE_AGY_WEBSEARCH?.trim().toLowerCase();
  if (envFlag === "false" || envFlag === "0" || envFlag === "off" || envFlag === "no") {
    return { enabled: false, setDefault: false };
  }
  const wsOpt = options?.webSearch;
  if (wsOpt === false) {
    return { enabled: false, setDefault: false };
  }
  if (wsOpt && typeof wsOpt === "object") {
    if (wsOpt.enabled === false) {
      return { enabled: false, setDefault: false };
    }
    const customModel = typeof wsOpt.model === "string" && wsOpt.model.trim() ? wsOpt.model.trim() : void 0;
    return {
      enabled: true,
      setDefault: wsOpt.default !== false,
      ...customModel ? { model: customModel } : {}
    };
  }
  return { enabled: true, setDefault: true };
}
function isAllowedSearchWebTool(params) {
  const kind = (params.toolCall.kind ?? "").toLowerCase();
  const title = (params.toolCall.title ?? "").toLowerCase();
  if (/run_command|terminal|bash|edit_file|write_file|delete|grep|view_file|read_file/i.test(
    title
  )) {
    return false;
  }
  return kind === "search" || /\bsearch_web\b|\bweb[\s_-]*search\b|^search\b/i.test(title);
}
function pickPermissionOutcome(options, allow) {
  if (allow) {
    const opt = options.find((o) => o.kind === "allow_once") ?? options.find((o) => o.kind === "allow_always") ?? options.find((o) => o.kind.startsWith("allow"));
    if (opt) {
      return { outcome: { outcome: "selected", optionId: opt.optionId } };
    }
  } else {
    const opt = options.find((o) => o.kind === "reject_once") ?? options.find((o) => o.kind === "reject_always") ?? options.find((o) => o.kind.startsWith("reject"));
    if (opt) {
      return { outcome: { outcome: "selected", optionId: opt.optionId } };
    }
  }
  return { outcome: { outcome: "cancelled" } };
}
function harvestSourcesFromUnknown(node, out) {
  if (!node) return;
  if (typeof node === "string") {
    for (const match of node.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g)) {
      if (match[2]) {
        out.push({
          url: match[2],
          title: match[1]?.trim() || void 0
        });
      }
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) harvestSourcesFromUnknown(item, out);
    return;
  }
  if (typeof node === "object") {
    const obj = node;
    const rawUrl = typeof obj.url === "string" ? obj.url : typeof obj.uri === "string" ? obj.uri : typeof obj.link === "string" ? obj.link : void 0;
    if (rawUrl && /^https?:\/\//i.test(rawUrl.trim())) {
      const title = typeof obj.title === "string" && obj.title.trim() ? obj.title.trim() : void 0;
      const snippet = typeof obj.snippet === "string" && obj.snippet.trim() ? obj.snippet.trim() : typeof obj.content === "string" && obj.content.trim() ? obj.content.trim() : typeof obj.description === "string" && obj.description.trim() ? obj.description.trim() : void 0;
      out.push({
        url: rawUrl.trim(),
        ...title ? { title } : {},
        ...snippet ? { snippet } : {}
      });
    }
    for (const val of Object.values(obj)) {
      if (val && typeof val === "object") {
        harvestSourcesFromUnknown(val, out);
      } else if (typeof val === "string") {
        harvestSourcesFromUnknown(val, out);
      }
    }
  }
}
function harvestSourcesFromToolPayload(payload, out) {
  if (payload.rawOutput !== void 0) {
    harvestSourcesFromUnknown(payload.rawOutput, out);
  }
  if (Array.isArray(payload.content)) {
    for (const entry of payload.content) {
      if (entry.content?.type === "text" && entry.content.text) {
        harvestSourcesFromUnknown(entry.content.text, out);
      }
    }
  }
}
function tryParseJsonBlock(text) {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    candidates.unshift(fenced[1].trim());
  } else {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
    }
  }
  for (const candidate of candidates) {
    if (!candidate.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
    }
  }
  return void 0;
}
function parseAgyWebSearchOutput(rawText, query, toolSources = []) {
  const collected = [...toolSources];
  let summary = rawText.trim();
  const jsonObj = tryParseJsonBlock(rawText);
  if (jsonObj) {
    if (typeof jsonObj.summary === "string" && jsonObj.summary.trim()) {
      summary = jsonObj.summary.trim();
    } else if (typeof jsonObj.answer === "string" && jsonObj.answer.trim()) {
      summary = jsonObj.answer.trim();
    }
    if (Array.isArray(jsonObj.sources)) {
      harvestSourcesFromUnknown(jsonObj.sources, collected);
    } else if (Array.isArray(jsonObj.results)) {
      harvestSourcesFromUnknown(jsonObj.results, collected);
    }
  }
  harvestSourcesFromUnknown(summary, collected);
  if (collected.length === 0) {
    for (const bare of summary.matchAll(/\bhttps?:\/\/[^\s<>)"'`]+/g)) {
      const cleanUrl = bare[0].replace(/[.,;:!?]+$/, "");
      if (cleanUrl) {
        collected.push({ url: cleanUrl });
      }
    }
  }
  const dedupedByUrl = /* @__PURE__ */ new Map();
  for (const src of collected) {
    const normalized = src.url.trim();
    if (!normalized || !/^https?:\/\//i.test(normalized)) continue;
    const prev = dedupedByUrl.get(normalized);
    if (!prev) {
      dedupedByUrl.set(normalized, src);
    } else {
      dedupedByUrl.set(normalized, {
        url: normalized,
        title: prev.title ?? src.title,
        snippet: prev.snippet ?? src.snippet
      });
    }
  }
  const uniqueSources = [...dedupedByUrl.values()];
  if (!summary && uniqueSources.length === 0) {
    return [];
  }
  const fallbackSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  const primaryUrl = uniqueSources[0]?.url ?? fallbackSearchUrl;
  const sourceListMarkdown = uniqueSources.length > 0 ? `

Sources:
${uniqueSources.map(
    (src, idx) => `[${idx + 1}] [${src.title ?? src.url}](${src.url})`
  ).join("\n")}` : "";
  const results = [];
  if (summary) {
    results.push({
      url: primaryUrl,
      title: `Antigravity Web Search: ${query}`,
      content: `${summary}${sourceListMarkdown}`,
      time: {}
    });
  }
  uniqueSources.forEach((src, index) => {
    results.push({
      url: src.url,
      title: src.title ? `[${index + 1}] ${src.title}` : `[${index + 1}] ${src.url}`,
      ...src.snippet ? { content: src.snippet } : {},
      time: {}
    });
  });
  return results;
}
function buildWebSearchPrompt(query, domain) {
  const domainDirective = domain?.trim() ? `
Prioritize authoritative results from domain: ${domain.trim()}` : "";
  return [
    `Use the search_web tool to search the live web for the following query and return grounded results.`,
    `Query: ${query.trim()}${domainDirective}`,
    `Do NOT execute shell commands or read/modify local files.`,
    `Return ONLY a JSON object with this exact shape:`,
    `{"summary":"Concise factual summary synthesized from search results","sources":[{"url":"https://...","title":"Page title","snippet":"Relevant excerpt"}]}`
  ].join("\n");
}
function isRateLimitError(err) {
  if (err instanceof AgyTurnOutcomeError) {
    return err.statusCode === 429;
  }
  if (err instanceof AcpRpcError) {
    return err.statusCode === 429 || /\b429\b|quota|rate[\s_-]*limit/i.test(err.message);
  }
  if (err instanceof Error) {
    return /\b429\b|RESOURCE_EXHAUSTED|QUOTA_EXHAUSTED|rate[\s_-]*limit/i.test(err.message);
  }
  return false;
}
async function executeAgyWebSearch(input) {
  const trimmedQuery = input.query.trim();
  if (!trimmedQuery) {
    return [];
  }
  const candidateModels = [];
  if (input.model?.trim()) {
    candidateModels.push(input.model.trim());
  }
  for (const fallback of DEFAULT_WEBSEARCH_MODEL_CANDIDATES) {
    if (!candidateModels.includes(fallback)) {
      candidateModels.push(fallback);
    }
  }
  const triedModels = /* @__PURE__ */ new Set();
  let lastError;
  for (let attemptIdx = 0; attemptIdx < MAX_WEBSEARCH_ATTEMPTS; attemptIdx++) {
    try {
      const attempt = await runSingleWebSearchAttempt({
        query: trimmedQuery,
        domain: input.domain,
        candidateModels,
        triedModels,
        signal: input.signal,
        pool: input.pool,
        baseSpawnConfig: input.spawnConfig
      });
      if (attempt.noUntriedModel) {
        break;
      }
      return attempt.results;
    } catch (err) {
      lastError = err;
      const hasMoreFallbacks = attemptIdx < MAX_WEBSEARCH_ATTEMPTS - 1;
      if (hasMoreFallbacks && isRateLimitError(err) && !input.signal?.aborted) {
        continue;
      }
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Antigravity ACP web search failed.");
}
function selectWebSearchModelForAttempt(availableValues, currentValue, candidateModels, triedModels) {
  if (availableValues.length === 0) {
    return candidateModels.find((m) => !triedModels.has(m));
  }
  for (const candidate of candidateModels) {
    if (availableValues.includes(candidate) && !triedModels.has(candidate)) {
      return candidate;
    }
  }
  for (const liveId of availableValues) {
    if (/flash/i.test(liveId) && !triedModels.has(liveId)) {
      return liveId;
    }
  }
  if (currentValue && availableValues.includes(currentValue) && !triedModels.has(currentValue)) {
    return currentValue;
  }
  return availableValues.find((m) => !triedModels.has(m));
}
async function runSingleWebSearchAttempt(params) {
  const tempCwd = mkdtempSync3(`${tmpdir3()}/opencode-agy-websearch-`);
  const spawnConfig = {
    ...params.baseSpawnConfig,
    cwd: params.baseSpawnConfig.cwd ?? tmpdir3(),
    includeDefaultCustomizations: false
  };
  const { connection, release } = await params.pool.acquire(spawnConfig, {
    signal: params.signal
  });
  let sessionId;
  let unsubscribeUpdates;
  let unsubscribePermissions;
  try {
    const setup = await connection.createSession(
      {
        cwd: tempCwd,
        mcpServers: [],
        _meta: {
          // Keep built-in tools enabled ONLY so `search_web` is available; all other
          // built-in tools are strictly denied by `setPermissionHandler` below.
          disableBuiltInTools: false
        }
      },
      { signal: params.signal }
    );
    sessionId = setup.sessionId;
    let currentConfigOptions = setup.configOptions ? [...setup.configOptions] : [];
    const modelOpt = findConfigOption(currentConfigOptions, "model");
    const availableValues = flattenSelectOptions(modelOpt).map((o) => o.value);
    const chosenModel = selectWebSearchModelForAttempt(
      availableValues,
      modelOpt?.currentValue,
      params.candidateModels,
      params.triedModels
    );
    if (!chosenModel) {
      return { noUntriedModel: true };
    }
    params.triedModels.add(chosenModel);
    if (modelOpt && modelOpt.currentValue !== chosenModel) {
      const updated = await connection.setConfigOption(sessionId, modelOpt.id, chosenModel, {
        signal: params.signal
      });
      currentConfigOptions = mergeSessionConfigOptions(
        currentConfigOptions,
        updated.configOptions
      );
    }
    const thoughtOpt = findConfigOption(currentConfigOptions, "thought_level");
    if (thoughtOpt) {
      const thoughtValues = flattenSelectOptions(thoughtOpt).map((o) => o.value);
      const fastThought = thoughtValues.includes("minimal") ? "minimal" : thoughtValues.includes("low") ? "low" : void 0;
      if (fastThought && thoughtOpt.currentValue !== fastThought) {
        await connection.setConfigOption(sessionId, thoughtOpt.id, fastThought, {
          signal: params.signal
        }).catch(() => {
        });
      }
    }
    const toolSources = [];
    let responseText = "";
    unsubscribeUpdates = connection.onSessionUpdate(sessionId, (notification) => {
      const u = notification.update;
      if (u.sessionUpdate === "agent_message_chunk" && u.content?.type === "text") {
        responseText += u.content.text;
      } else if (u.sessionUpdate === "tool_call" || u.sessionUpdate === "tool_call_update") {
        harvestSourcesFromToolPayload(u, toolSources);
      }
    });
    unsubscribePermissions = connection.setPermissionHandler(
      sessionId,
      async (permParams) => {
        const allow = isAllowedSearchWebTool(permParams);
        return pickPermissionOutcome(permParams.options, allow);
      }
    );
    const dbPath = resolveSessionDbPath(sessionId, {
      geminiDir: spawnConfig.geminiDir,
      appDataDir: spawnConfig.appDataDir,
      env: spawnConfig.env
    });
    const preTurnMaxIdx = -1;
    let onAbort;
    if (params.signal) {
      onAbort = () => {
        if (sessionId) connection.cancelSession(sessionId);
      };
      params.signal.addEventListener("abort", onAbort, { once: true });
    }
    let promptError;
    try {
      await connection.prompt(
        {
          sessionId,
          prompt: [
            {
              type: "text",
              text: buildWebSearchPrompt(params.query, params.domain)
            }
          ]
        },
        { signal: params.signal }
      );
    } catch (err) {
      promptError = err;
    } finally {
      if (onAbort && params.signal) {
        params.signal.removeEventListener("abort", onAbort);
      }
    }
    if (!params.signal?.aborted && (promptError || !responseText.trim() && toolSources.length === 0)) {
      const dbOutcome = await inspectTurnOutcomeFromDb(dbPath, preTurnMaxIdx);
      if (dbOutcome) {
        throw new AgyTurnOutcomeError(dbOutcome);
      }
    }
    if (promptError) {
      throw promptError;
    }
    return {
      noUntriedModel: false,
      results: parseAgyWebSearchOutput(responseText, params.query, toolSources)
    };
  } finally {
    unsubscribeUpdates?.();
    unsubscribePermissions?.();
    if (sessionId) {
      await connection.closeSession(sessionId).catch(() => {
      });
      cleanupSessionDbFiles(sessionId, {
        geminiDir: spawnConfig.geminiDir,
        appDataDir: spawnConfig.appDataDir,
        env: spawnConfig.env
      });
    }
    release();
    try {
      rmSync4(tempCwd, { recursive: true, force: true });
    } catch {
    }
  }
}
async function registerV2WebSearch(ctx, deps) {
  if (!ctx.websearch?.transform) {
    return;
  }
  const config = resolveWebSearchConfig(ctx.options);
  if (!config.enabled) {
    return;
  }
  const reg = await ctx.websearch.transform((editor) => {
    editor.add({
      id: AGY_WEBSEARCH_PROVIDER_ID,
      name: AGY_WEBSEARCH_PROVIDER_NAME,
      execute: async (input, execCtx) => {
        const spawnConfig = await deps.getSpawnConfig();
        return executeAgyWebSearch({
          query: input.query,
          model: config.model,
          signal: execCtx.signal,
          pool: deps.pool,
          spawnConfig
        });
      }
    });
    if (config.setDefault) {
      const current = editor.default.get();
      if (!current) {
        editor.default.set(AGY_WEBSEARCH_PROVIDER_ID);
      }
    }
  });
  if (reg && typeof reg.dispose === "function") {
    deps.cleanups.push(() => reg.dispose());
  }
}

// src/plugin/v2.ts
var DEFAULT_WATCHDOG_TIMEOUT_MS2 = 45e3;
var MAX_RETRY_ATTEMPTS = 4;
function resolveModelVariants(modelId) {
  const efforts = getStaticModelEfforts(modelId);
  return efforts.map((level) => ({
    id: level,
    settings: {
      effort: level,
      thoughtLevel: level
    },
    headers: {
      "x-agy-tier": level
    }
  }));
}
function trackRegistration(reg, cleanups) {
  if (!reg) return;
  if (typeof reg.then === "function") {
    return reg.then((resolved) => {
      if (resolved && typeof resolved.dispose === "function") {
        cleanups.push(() => resolved.dispose());
      }
    });
  }
  if (typeof reg.dispose === "function") {
    cleanups.push(() => reg.dispose());
  }
}
function extractRetryDelayFromStructuredError(event) {
  if (typeof event.error.retryAfterMs === "number" && Number.isFinite(event.error.retryAfterMs) && event.error.retryAfterMs > 0) {
    return Math.min(event.error.retryAfterMs, 12e4);
  }
  const body = event.error.response?.body ?? event.error.message ?? "";
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed.error?.retryAfterMs === "number" && parsed.error.retryAfterMs > 0) {
      return Math.min(parsed.error.retryAfterMs, 12e4);
    }
    if (typeof parsed.error?.quotaResetTimeStamp === "string") {
      const resetAt = Date.parse(parsed.error.quotaResetTimeStamp);
      if (Number.isFinite(resetAt)) {
        const delta = resetAt - Date.now();
        if (delta > 0 && delta <= 12e4) {
          return Math.round(delta);
        }
      }
    }
  } catch {
  }
  const secMatch = body.match(/retry(?:\s+in|\s+after|Delay=)\s*([0-9.]+)(ms|s)\b/i);
  if (secMatch?.[1] && secMatch[2]) {
    const num = Number(secMatch[1]);
    if (Number.isFinite(num) && num > 0) {
      const ms = secMatch[2].toLowerCase() === "ms" ? num : num * 1e3;
      return Math.min(Math.round(ms), 12e4);
    }
  }
  return void 0;
}
async function setupOpenCodeV2(ctx) {
  const cleanups = [];
  const pool = new AcpClientPool();
  const catalog = new AgyCatalogStore();
  await catalog.hydrateFromStorage(ctx.storage);
  let currentSpawnConfig = await resolveEffectiveSpawnConfig(ctx);
  const auth = new AgyAuthController(currentSpawnConfig);
  await auth.hydrateFromStorage(ctx.storage, currentSpawnConfig);
  const sessions = new AgySessionManager({
    pool,
    catalog,
    getSpawnConfig: async () => {
      currentSpawnConfig = await resolveEffectiveSpawnConfig(ctx);
      return currentSpawnConfig;
    },
    getToolMode: () => ctx.options?.toolMode === "hybrid" ? "hybrid" : "opencode",
    getWatchdogTimeoutMs: () => typeof ctx.options?.watchdogTimeoutMs === "number" ? ctx.options.watchdogTimeoutMs : DEFAULT_WATCHDOG_TIMEOUT_MS2,
    storage: ctx.storage,
    permission: ctx.permission,
    onAuthFailure: (message) => {
      if (auth.updateFromOutcome({ state: "needs_auth", message })) {
        void auth.persistToStorage(ctx.storage, currentSpawnConfig);
        void syncIntegrationConnectionStatus(ctx, auth);
        void ctx.provider?.reload?.()?.catch(() => {
        });
      }
    }
  });
  const refreshProbeAndReload = async () => {
    if (auth.isDisposed) return;
    currentSpawnConfig = await resolveEffectiveSpawnConfig(ctx);
    const outcome = await probeAgyAuthAndCatalog(pool, currentSpawnConfig);
    if (auth.isDisposed) return;
    const authChanged = auth.updateFromOutcome(outcome);
    await auth.persistToStorage(ctx.storage, currentSpawnConfig);
    let catalogChanged = false;
    if (outcome.state === "ready" && outcome.catalog) {
      catalogChanged = await catalog.applyDiscoveredCatalog(
        outcome.catalog,
        ctx.storage
      );
    }
    await syncIntegrationConnectionStatus(ctx, auth);
    if ((authChanged || catalogChanged) && !auth.isDisposed) {
      await ctx.provider?.reload?.()?.catch(() => {
      });
      await ctx.model?.reload?.()?.catch(() => {
      });
    }
  };
  await registerAgyIntegration(ctx, {
    auth,
    getSpawnConfig: () => currentSpawnConfig,
    onCredentialsChanged: async () => {
      await pool.evictAll();
      await refreshProbeAndReload();
    },
    cleanups
  });
  if (ctx.provider?.transform) {
    await trackRegistration(
      ctx.provider.transform((editor) => {
        editor.update(AGY_PROVIDER_ID, (provider) => {
          provider.id = AGY_PROVIDER_ID;
          provider.name = AGY_PROVIDER_NAME;
          provider.integrationID = AGY_PROVIDER_ID;
          provider.package = AGY_AISDK_PACKAGE;
          if (provider.activation !== "disabled") {
            provider.activation = auth.shouldActivateProvider ? "enabled" : "auto";
          }
        });
        for (const entry of catalog.listEntries()) {
          const modelInfo = toOpenCodeModelInfo(entry);
          editor.models.update(AGY_PROVIDER_ID, modelInfo.id, (draft) => {
            Object.assign(draft, modelInfo);
          });
        }
      }),
      cleanups
    );
  }
  if (ctx.aisdk?.hook) {
    const sdkInstance = createAgyAcpSdk(sessions);
    await trackRegistration(
      ctx.aisdk.hook(
        "sdk",
        (event) => {
          if (event.package !== AGY_ACP_PACKAGE && event.package !== AGY_AISDK_PACKAGE) {
            return;
          }
          event.sdk = sdkInstance;
        },
        { providerID: AGY_PROVIDER_ID }
      ),
      cleanups
    );
  }
  const forkSourceCache = /* @__PURE__ */ new Map();
  const resolveForkSource = async (sessionID) => {
    if (!ctx.session.get) return void 0;
    if (forkSourceCache.has(sessionID)) {
      return forkSourceCache.get(sessionID) ?? void 0;
    }
    try {
      const raw = await ctx.session.get({ sessionID });
      const info = raw && typeof raw === "object" && "data" in raw ? raw.data : raw;
      const forkId = info?.fork?.sessionID;
      forkSourceCache.set(sessionID, typeof forkId === "string" ? forkId : null);
      return typeof forkId === "string" ? forkId : void 0;
    } catch {
      forkSourceCache.set(sessionID, null);
      return void 0;
    }
  };
  const attachContextMetadata = (event) => {
    if (event.model.providerID !== AGY_PROVIDER_ID) return;
    const existing = event.options[AGY_PROVIDER_ID] && typeof event.options[AGY_PROVIDER_ID] === "object" ? event.options[AGY_PROVIDER_ID] : {};
    event.options[AGY_PROVIDER_ID] = {
      ...existing,
      sessionId: event.sessionID,
      ...event.agent ? { agent: event.agent } : {},
      ...event.model.variant && !existing.thoughtLevel ? { thoughtLevel: event.model.variant, effort: event.model.variant } : {}
    };
  };
  await trackRegistration(
    ctx.session.hook(
      "model.request",
      async (event) => {
        if (event.model.providerID !== AGY_PROVIDER_ID) return;
        event.headers[AGY_HEADER_SESSION_ID] = event.sessionID;
        event.headers[AGY_HEADER_REQUEST_KIND] = event.kind;
        if (event.agent) {
          event.headers["x-opencode-agy-agent"] = event.agent;
        }
        if (event.model.variant && !event.headers["x-agy-tier"]) {
          event.headers["x-agy-tier"] = event.model.variant;
        }
        const forkSource = await resolveForkSource(event.sessionID);
        if (forkSource) {
          event.headers[AGY_HEADER_FORK_SOURCE] = forkSource;
        }
      },
      { providerID: AGY_PROVIDER_ID }
    ),
    cleanups
  );
  await trackRegistration(
    ctx.session.hook("context", attachContextMetadata, {
      providerID: AGY_PROVIDER_ID
    }),
    cleanups
  );
  await trackRegistration(
    ctx.session.hook("generate", attachContextMetadata, {
      providerID: AGY_PROVIDER_ID
    }),
    cleanups
  );
  await trackRegistration(
    ctx.session.hook("compaction", attachContextMetadata, {
      providerID: AGY_PROVIDER_ID
    }),
    cleanups
  );
  await trackRegistration(
    ctx.session.hook(
      "retry",
      (event) => {
        if (event.model.providerID !== AGY_PROVIDER_ID) return;
        const status = event.error.status;
        if (status === 400 || status === 401 || status === 403 || status === 404) {
          event.decision = { retry: false };
          return;
        }
        if (event.attempt > MAX_RETRY_ATTEMPTS) {
          event.decision = { retry: false };
          return;
        }
        if (status === 429 || typeof status === "number" && status >= 500) {
          const parsedDelay = extractRetryDelayFromStructuredError(event);
          const backoffMs = parsedDelay ?? Math.min(1e3 * Math.pow(2, Math.max(0, event.attempt - 1)), 3e4);
          event.decision = { retry: true, delay: backoffMs };
        }
      },
      { providerID: AGY_PROVIDER_ID }
    ),
    cleanups
  );
  await registerV2WebSearch(ctx, {
    pool,
    getSpawnConfig: () => resolveEffectiveSpawnConfig(ctx),
    cleanups
  });
  const shouldRunInitialProbe = ctx.options?.skipInitialProbe === false || ctx.options?.skipInitialProbe !== true && (!process.env.VITEST || Boolean(ctx.options?.binaryPath || process.env.OPENCODE_AGY_PATH));
  let initialProbePromise;
  if (shouldRunInitialProbe) {
    initialProbePromise = refreshProbeAndReload().catch(() => {
    });
  }
  return async () => {
    auth.markDisposed();
    if (initialProbePromise) {
      await initialProbePromise.catch(() => {
      });
    }
    for (const cleanup of cleanups.reverse()) {
      await Promise.resolve(cleanup()).catch(() => {
      });
    }
    await sessions.dispose();
    await pool.dispose();
  };
}
var v2PluginDefinition = defineOpenCodeV2Plugin({
  id: AGY_PROVIDER_ID,
  setup: setupOpenCodeV2
});
function createV2PluginDefinition() {
  return v2PluginDefinition;
}

// index.ts
var index_default = v2PluginDefinition;
export {
  AGY_ACP_PACKAGE,
  AGY_AISDK_PACKAGE,
  AGY_MCP_SERVER_NAME,
  AGY_PROVIDER_ID,
  AGY_PROVIDER_NAME,
  AGY_WEBSEARCH_PROVIDER_ID,
  AGY_WEBSEARCH_PROVIDER_NAME,
  AcpClientPool,
  AcpConnection,
  AcpRpcError,
  AgyAcpLanguageModel,
  AgyAuthController,
  AgyCatalogStore,
  AgySessionManager,
  AgyTurnOutcomeError,
  AsyncLock,
  CORTEX_STEP_TYPE_ERROR_MESSAGE,
  OpenCodeMcpBridge,
  STATIC_MODELS_SIMPLE,
  TIER_MAPPING,
  buildAgyAcpArgs,
  buildAgyLoginCommand,
  buildPromptBlocksFromMessages,
  buildSanitizedAgyEnv,
  buildWebSearchPrompt,
  classifyAcpAuthError,
  cleanupSessionDbFiles,
  computeMessageDigest,
  convertToolResultOutputToMcp,
  createAgyAcpSdk,
  createV2PluginDefinition,
  index_default as default,
  defineOpenCodeV2Plugin,
  discoverCatalogFromSession,
  evaluateTurnStepRows,
  executeAgyWebSearch,
  expandHomePath,
  extractCallRoutingMetadata,
  extractModelsFromSessionSetup,
  extractSystemAndConversation,
  extractThoughtLevelsFromConfig,
  extractTrailingToolResults,
  findConfigOption,
  flattenSelectOptions,
  hasLocalAgyAuthHint,
  inspectTurnOutcomeFromDb,
  isAgyMcpBridgedToolCall,
  isInvalidThinkingSignatureText,
  mapAcpStopReasonToV3,
  mapAcpUsageToV3,
  mapNativeToolPermissionChecks,
  mergeSessionConfigOptions,
  parseAgyWebSearchOutput,
  parseErrorStepRow,
  probeAgyAuthAndCatalog,
  readPreTurnMaxStepIdx,
  registerAgyIntegration,
  registerV2WebSearch,
  resolveAgyBinaryPath,
  resolveConversationsDir,
  resolveEffectiveGeminiDir,
  resolveEffectiveSpawnConfig,
  resolveModelTier,
  resolveModelVariants,
  resolveSessionDbPath,
  resolveWebSearchConfig,
  scanProtobufWire,
  setupOpenCodeV2,
  stripAgyMcpTitlePrefix,
  stripInjectedToolSummary,
  syncIntegrationConnectionStatus,
  synthesizeNativeToolOutput,
  toOpenCodeModelInfo,
  v2PluginDefinition,
  validateRelativeAppDataDir
};
