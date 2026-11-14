import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AGY_AISDK_PACKAGE,
  AGY_PROVIDER_ID,
  AGY_STORAGE_CATALOG_KEY,
} from "../constants";
import {
  ORDERED_EFFORT_LEVELS,
  STATIC_MODELS_SIMPLE,
  TIER_MAPPING,
  getStaticModelEfforts,
  registerDynamicTierVariant,
} from "../plugin/tier";
import type {
  OpenCodeV2ModelInfo,
  OpenCodeV2ModelVariant,
  OpenCodeV2StorageDomain,
} from "../plugin/types";
import { getAgyCacheDir } from "../sdk/cache-dir";
import type { AcpConnection } from "./client";
import type {
  AcpSessionConfigOption,
  AcpSessionConfigSelectGroup,
  AcpSessionConfigSelectOption,
  AcpSessionSetupResult,
} from "./types";

const DISK_CATALOG_FILENAME = "agy-acp-catalog.json";

export interface AgyCatalogModelEntry {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly thoughtLevels: ReadonlyArray<string>;
  readonly defaultThoughtLevel?: string;
  readonly maxTokens: number;
  readonly maxOutputTokens: number;
  readonly toolCall: boolean;
  readonly reasoning: boolean;
  readonly attachment: boolean;
  readonly source: "static" | "cache" | "live";
}

export interface PersistedAgyCatalog {
  readonly version: 1;
  readonly updatedAt: number;
  readonly defaultModelId?: string;
  readonly models: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly thoughtLevels: ReadonlyArray<string>;
    readonly defaultThoughtLevel?: string;
  }>;
}

export interface DiscoveredAgyCatalog {
  readonly defaultModelId?: string;
  readonly models: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly thoughtLevels: ReadonlyArray<string>;
    readonly defaultThoughtLevel?: string;
  }>;
}

function isSelectGroup(
  item: AcpSessionConfigSelectOption | AcpSessionConfigSelectGroup,
): item is AcpSessionConfigSelectGroup {
  return typeof (item as AcpSessionConfigSelectGroup).group === "string" && Array.isArray((item as AcpSessionConfigSelectGroup).options);
}

export function flattenSelectOptions(
  option: AcpSessionConfigOption | undefined,
): AcpSessionConfigSelectOption[] {
  if (!option || option.type !== "select" || !Array.isArray(option.options)) {
    return [];
  }
  const flat: AcpSessionConfigSelectOption[] = [];
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

export function findConfigOption(
  configOptions: ReadonlyArray<AcpSessionConfigOption> | null | undefined,
  categoryOrId: "model" | "thought_level" | "mode" | string,
): Extract<AcpSessionConfigOption, { type: "select" }> | undefined {
  if (!Array.isArray(configOptions)) return undefined;
  for (const opt of configOptions) {
    if (
      opt.type === "select" &&
      (opt.category === categoryOrId || opt.id === categoryOrId)
    ) {
      return opt;
    }
  }
  return undefined;
}

/**
 * Merges incoming `config_option_update` entries with previously known session
 * `configOptions` by `id` so partial updates (`#28433`, e.g. updating only `mode`
 * or `thought_level`) never drop the `model` option list.
 */
export function mergeSessionConfigOptions(
  previous: ReadonlyArray<AcpSessionConfigOption> | null | undefined,
  incoming: ReadonlyArray<AcpSessionConfigOption> | null | undefined,
): AcpSessionConfigOption[] {
  if (!incoming || incoming.length === 0) {
    return previous ? [...previous] : [];
  }
  if (!previous || previous.length === 0) {
    return [...incoming];
  }

  const incomingHasModel = incoming.some(
    (opt) => opt.category === "model" || opt.id === "model",
  );
  const incomingHasThought = incoming.some(
    (opt) => opt.category === "thought_level" || opt.id === "thought_level",
  );

  // When `incoming` is a full config snapshot containing `model` (e.g. returned from
  // `session/set_config_option` after switching models) and it omits `thought_level`,
  // the newly selected model does not support `thought_level` — drop stale `thought_level`.
  const filteredPrev =
    incomingHasModel && !incomingHasThought
      ? previous.filter(
          (opt) => opt.category !== "thought_level" && opt.id !== "thought_level",
        )
      : [...previous];

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

function orderEfforts(levels: Iterable<string>): string[] {
  const unique = new Set<string>();
  for (const lvl of levels) {
    const clean = lvl.trim();
    if (clean) unique.add(clean);
  }
  const ordered: string[] = [];
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

export function extractThoughtLevelsFromConfig(
  configOptions: ReadonlyArray<AcpSessionConfigOption> | null | undefined,
): { levels: string[]; current?: string; configId?: string } {
  const thoughtOpt = findConfigOption(configOptions, "thought_level");
  if (!thoughtOpt) {
    return { levels: [] };
  }
  const flat = flattenSelectOptions(thoughtOpt);
  const levels = orderEfforts(flat.map((o) => o.value));
  return {
    levels,
    current: thoughtOpt.currentValue || undefined,
    configId: thoughtOpt.id,
  };
}

const KNOWN_TIER_SUFFIXES = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;

function matchTierSuffixOfBase(
  id: string,
  baseIds: ReadonlySet<string>,
): { baseId: string; tier: string } | undefined {
  const lower = id.toLowerCase();
  for (const suffix of KNOWN_TIER_SUFFIXES) {
    if (lower.endsWith(`-${suffix}`)) {
      const candidateBase = id.slice(0, -(suffix.length + 1));
      if (candidateBase && baseIds.has(candidateBase)) {
        return { baseId: candidateBase, tier: suffix };
      }
    }
  }
  return undefined;
}

export function extractModelsFromSessionSetup(
  setup: Pick<AcpSessionSetupResult, "configOptions" | "models">,
): {
  modelConfigId?: string;
  currentModelId?: string;
  models: Array<{ id: string; name: string; description?: string; inferredTiers?: string[] }>;
} {
  const modelOpt = findConfigOption(setup.configOptions, "model");
  const seen = new Map<
    string,
    { id: string; name: string; description?: string; inferredTiers?: string[] }
  >();

  if (modelOpt) {
    for (const item of flattenSelectOptions(modelOpt)) {
      const id = item.value.trim();
      if (!id) continue;
      seen.set(id, {
        id,
        name: item.name?.trim() || id,
        ...(item.description ? { description: item.description.trim() } : {}),
      });
    }
  }

  // Only fall back to legacy `setup.models.availableModels` when `configOptions`
  // has no `model` selector (`agy 1.5.8` populates `availableModels` with flattened
  // `<base>-<tier>` legacy IDs alongside `configOptions`).
  if (seen.size === 0 && Array.isArray(setup.models?.availableModels)) {
    const rawAvailable: Array<{ id: string; name: string; description?: string }> = [];
    for (const m of setup.models.availableModels) {
      const id = m.modelId?.trim();
      if (!id) continue;
      rawAvailable.push({
        id,
        name: m.name?.trim() || id,
        ...(m.description ? { description: m.description.trim() } : {}),
      });
    }
    const allIds = new Set(rawAvailable.map((m) => m.id));
    const inferredTiersByBase = new Map<string, Set<string>>();
    for (const item of rawAvailable) {
      const tierMatch = matchTierSuffixOfBase(item.id, allIds);
      if (tierMatch) {
        let bucket = inferredTiersByBase.get(tierMatch.baseId);
        if (!bucket) {
          bucket = new Set<string>();
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
  const normalizedCurrent = rawCurrent
    ? (matchTierSuffixOfBase(rawCurrent, baseIdSet)?.baseId ?? rawCurrent)
    : undefined;

  return {
    modelConfigId: modelOpt?.id,
    currentModelId: normalizedCurrent,
    models: [...seen.values()],
  };
}

/**
 * Discovers all live `agy acp` models and probes per-model `thought_level` options
 * inside a single ACP session by stepping through `session/set_config_option`.
 */
export async function discoverCatalogFromSession(
  connection: AcpConnection,
  sessionSetup: AcpSessionSetupResult,
  options?: {
    probeThoughtLevels?: boolean;
    restoreInitialModel?: boolean;
    signal?: AbortSignal;
  },
): Promise<DiscoveredAgyCatalog> {
  const extracted = extractModelsFromSessionSetup(sessionSetup);
  const initialThought = extractThoughtLevelsFromConfig(sessionSetup.configOptions);
  const probeThought = options?.probeThoughtLevels !== false;

  const thoughtByModel = new Map<
    string,
    { levels: string[]; defaultLevel?: string }
  >();

  if (extracted.currentModelId) {
    thoughtByModel.set(extracted.currentModelId, {
      levels: initialThought.levels,
      defaultLevel: initialThought.current,
    });
  }

  if (
    probeThought &&
    extracted.modelConfigId &&
    extracted.models.length > 0
  ) {
    for (const model of extracted.models) {
      if (options?.signal?.aborted) break;
      if (thoughtByModel.has(model.id)) continue;
      try {
        const res = await connection.setConfigOption(
          sessionSetup.sessionId,
          extracted.modelConfigId,
          model.id,
          { timeoutMs: 15_000, signal: options?.signal },
        );
        const mergedCfg = mergeSessionConfigOptions(
          sessionSetup.configOptions,
          res.configOptions,
        );
        const tl = extractThoughtLevelsFromConfig(mergedCfg);
        thoughtByModel.set(model.id, {
          levels: tl.levels,
          defaultLevel: tl.current,
        });
      } catch {
        thoughtByModel.set(model.id, {
          levels: getStaticModelEfforts(model.id),
        });
      }
    }

    if (
      options?.restoreInitialModel &&
      extracted.currentModelId &&
      !options?.signal?.aborted
    ) {
      await connection
        .setConfigOption(
          sessionSetup.sessionId,
          extracted.modelConfigId,
          extracted.currentModelId,
          { timeoutMs: 10_000, signal: options?.signal },
        )
        .catch(() => {});
    }
  }

  return {
    defaultModelId: extracted.currentModelId,
    models: extracted.models.map((m) => {
      const thought = thoughtByModel.get(m.id);
      const levels = thought ? thought.levels : (m.inferredTiers ?? getStaticModelEfforts(m.id));
      return {
        id: m.id,
        name: m.name,
        ...(m.description ? { description: m.description } : {}),
        thoughtLevels: levels,
        ...(thought?.defaultLevel ? { defaultThoughtLevel: thought.defaultLevel } : {}),
      };
    }),
  };
}

function inferModelMetadata(
  id: string,
  name: string,
  description: string | undefined,
  thoughtLevels: ReadonlyArray<string>,
  defaultThoughtLevel: string | undefined,
  source: "static" | "cache" | "live",
): AgyCatalogModelEntry {
  const staticEntry = STATIC_MODELS_SIMPLE[id];
  if (staticEntry) {
    return {
      id,
      name: name || staticEntry.name,
      description: description ?? staticEntry.description,
      thoughtLevels,
      ...(defaultThoughtLevel ? { defaultThoughtLevel } : {}),
      maxTokens: staticEntry.maxTokens,
      maxOutputTokens: staticEntry.maxOutputTokens,
      toolCall: staticEntry.toolCall,
      reasoning: thoughtLevels.length > 0 || staticEntry.reasoning,
      attachment: staticEntry.attachment,
      source,
    };
  }

  const lower = id.toLowerCase();
  const isClaude = lower.startsWith("claude-");
  const isGptOss = lower.startsWith("gpt-oss-");
  const isLargeOutput =
    lower.includes("carbon") ||
    lower.includes("hydrogen") ||
    lower.includes("orchestrator");

  return {
    id,
    name: name || id,
    ...(description ? { description } : {}),
    thoughtLevels,
    ...(defaultThoughtLevel ? { defaultThoughtLevel } : {}),
    maxTokens: isClaude ? 1_000_000 : isGptOss ? 131_072 : 1_048_576,
    maxOutputTokens: isClaude ? 128_000 : isGptOss ? 32_768 : isLargeOutput ? 262_144 : 65_536,
    toolCall: true,
    reasoning: thoughtLevels.length > 0 || !lower.includes("2.5-flash-lite"),
    attachment: !isGptOss,
    source,
  };
}

function inferModelFamily(modelId: string): string {
  const lower = modelId.toLowerCase();
  if (lower.startsWith("claude-")) return "claude";
  if (lower.startsWith("gpt-")) return "gpt";
  if (lower.startsWith("gemini-")) return "gemini";
  return "antigravity";
}

export function toOpenCodeModelInfo(entry: AgyCatalogModelEntry): OpenCodeV2ModelInfo {
  const variants: OpenCodeV2ModelVariant[] = entry.thoughtLevels.map((level) => ({
    id: level,
    settings: {
      effort: level,
      thoughtLevel: level,
    },
    headers: {
      "x-agy-tier": level,
    },
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
      temperature: true,
    },
    variants,
    time: { released: 0 },
    cost: [
      {
        input: 0,
        output: 0,
        cache: { read: 0, write: 0 },
      },
    ],
    status: "active",
    enabled: true,
    limit: {
      context: entry.maxTokens,
      output: entry.maxOutputTokens,
    },
  };
}

export interface ResolvedAcpModelSelection {
  readonly modelId: string;
  readonly thoughtLevel?: string;
  readonly modelConfigId?: string;
  readonly thoughtConfigId?: string;
}

function splitTierFormattedModelId(
  rawModelId: string,
  knownBaseModels: ReadonlySet<string>,
): { baseModelId: string; suffixEffort?: string } {
  const trimmed = rawModelId.trim();
  if (trimmed.includes("@")) {
    const [base, tier] = trimmed.split("@");
    if (base && tier) {
      return { baseModelId: base, suffixEffort: tier.toLowerCase() };
    }
  }

  // Check `<base>-<tier>` against known base models BEFORE `knownBaseModels.has(trimmed)`
  // so legacy tier-suffixed IDs like `gemini-4-carbon-high` always map to `gemini-4-carbon` + `high`
  // while standalone IDs like `gpt-oss-120b-medium` (no `gpt-oss-120b` base) stay intact.
  const baseTierMatch = matchTierSuffixOfBase(trimmed, knownBaseModels);
  if (baseTierMatch) {
    return { baseModelId: baseTierMatch.baseId, suffixEffort: baseTierMatch.tier };
  }

  if (knownBaseModels.has(trimmed)) {
    return { baseModelId: trimmed };
  }

  // Check reverse TIER_MAPPING (e.g. `gemini-4-carbon-high` -> `gemini-4-carbon` + `high`)
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

function isAutomatedTestProcess(): boolean {
  return Boolean(process.env.VITEST || process.env.NODE_ENV === "test");
}

export class AgyCatalogStore {
  private readonly models = new Map<string, AgyCatalogModelEntry>();
  private defaultModelId: string | undefined;
  private hasLive = false;
  private readonly explicitCacheDir: string | undefined;

  constructor(options?: { cacheDir?: string }) {
    this.explicitCacheDir = options?.cacheDir;
    this.seedStaticFallback();
    this.tryLoadDiskCache();
  }

  get hasLiveCatalog(): boolean {
    return this.hasLive;
  }

  get defaultModel(): string | undefined {
    return this.defaultModelId;
  }

  private seedStaticFallback(): void {
    this.models.clear();
    for (const [id, meta] of Object.entries(STATIC_MODELS_SIMPLE)) {
      const efforts = getStaticModelEfforts(id);
      this.models.set(
        id,
        inferModelMetadata(id, meta.name, meta.description, efforts, undefined, "static"),
      );
    }
  }

  private getDiskCacheFilePath(): string | undefined {
    if (!this.explicitCacheDir && isAutomatedTestProcess()) {
      return undefined;
    }
    const dir = this.explicitCacheDir ?? getAgyCacheDir();
    return join(dir, DISK_CATALOG_FILENAME);
  }

  private buildPersistedSnapshot(): PersistedAgyCatalog {
    return {
      version: 1,
      updatedAt: Date.now(),
      ...(this.defaultModelId ? { defaultModelId: this.defaultModelId } : {}),
      models: [...this.models.values()].map((m) => ({
        id: m.id,
        name: m.name,
        ...(m.description ? { description: m.description } : {}),
        thoughtLevels: [...m.thoughtLevels],
        ...(m.defaultThoughtLevel ? { defaultThoughtLevel: m.defaultThoughtLevel } : {}),
      })),
    };
  }

  private tryLoadDiskCache(): void {
    const filePath = this.getDiskCacheFilePath();
    if (!filePath || !existsSync(filePath)) return;
    try {
      const raw = JSON.parse(readFileSync(filePath, "utf8")) as PersistedAgyCatalog;
      const res = this.applyPersistedPayload(raw, "cache");
      if (res.applied && res.wasSanitized) {
        try {
          writeFileSync(filePath, JSON.stringify(this.buildPersistedSnapshot(), null, 2), "utf8");
        } catch {
          // Ignore read-only cache dir
        }
      }
    } catch {
      // Ignore corrupt cache files
    }
  }

  async hydrateFromStorage(storage: OpenCodeV2StorageDomain | undefined): Promise<boolean> {
    if (!storage || this.hasLive) return false;
    try {
      const raw = await storage.get(AGY_STORAGE_CATALOG_KEY);
      if (raw && typeof raw === "object") {
        const res = this.applyPersistedPayload(raw as PersistedAgyCatalog, "cache");
        if (res.applied && res.wasSanitized) {
          await storage.set(AGY_STORAGE_CATALOG_KEY, this.buildPersistedSnapshot()).catch(() => {});
        }
        return res.applied;
      }
    } catch {
      // Ignore storage read failures
    }
    return false;
  }

  private applyPersistedPayload(
    payload: Partial<PersistedAgyCatalog>,
    source: "cache" | "live",
  ): { applied: boolean; wasSanitized: boolean } {
    if (!Array.isArray(payload.models) || payload.models.length === 0) {
      return { applied: false, wasSanitized: false };
    }

    const validItems = payload.models.filter(
      (item): item is NonNullable<(typeof payload.models)[number]> =>
        Boolean(item && typeof item.id === "string" && item.id.trim()),
    );
    const rawIdSet = new Set(validItems.map((item) => item.id.trim()));
    const mergedTiersFromDuplicates = new Map<string, Set<string>>();
    let wasSanitized = false;

    for (const item of validItems) {
      const id = item.id.trim();
      const dupMatch = matchTierSuffixOfBase(id, rawIdSet);
      if (dupMatch) {
        wasSanitized = true;
        let bucket = mergedTiersFromDuplicates.get(dupMatch.baseId);
        if (!bucket) {
          bucket = new Set<string>();
          mergedTiersFromDuplicates.set(dupMatch.baseId, bucket);
        }
        bucket.add(dupMatch.tier);
      }
    }

    const nextModels = new Map<string, AgyCatalogModelEntry>();
    for (const item of validItems) {
      const id = item.id.trim();
      if (matchTierSuffixOfBase(id, rawIdSet)) {
        continue;
      }

      const rawLevels = Array.isArray(item.thoughtLevels)
        ? (item.thoughtLevels as ReadonlyArray<unknown>).filter(
            (v: unknown): v is string => typeof v === "string",
          )
        : getStaticModelEfforts(id);
      const extraTiers = mergedTiersFromDuplicates.get(id);
      const levels = orderEfforts(
        extraTiers ? [...rawLevels, ...extraTiers] : rawLevels,
      );

      for (const lvl of levels) {
        registerDynamicTierVariant(id, lvl, `${id}-${lvl}`);
      }

      nextModels.set(
        id,
        inferModelMetadata(
          id,
          typeof item.name === "string" ? item.name : id,
          typeof item.description === "string" ? item.description : undefined,
          levels,
          typeof item.defaultThoughtLevel === "string" ? item.defaultThoughtLevel : undefined,
          source,
        ),
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
      this.defaultModelId =
        matchTierSuffixOfBase(trimmedDefault, baseSet)?.baseId ?? trimmedDefault;
    }
    if (source === "live") {
      this.hasLive = true;
    }
    return { applied: true, wasSanitized };
  }

  async applyDiscoveredCatalog(
    discovered: DiscoveredAgyCatalog,
    storage?: OpenCodeV2StorageDomain,
  ): Promise<boolean> {
    if (!discovered.models.length) {
      return false;
    }

    const persisted: PersistedAgyCatalog = {
      version: 1,
      updatedAt: Date.now(),
      ...(discovered.defaultModelId ? { defaultModelId: discovered.defaultModelId } : {}),
      models: discovered.models,
    };

    const res = this.applyPersistedPayload(persisted, "live");
    if (!res.applied) return false;
    const cleanSnapshot = res.wasSanitized ? this.buildPersistedSnapshot() : persisted;

    if (storage) {
      await storage.set(AGY_STORAGE_CATALOG_KEY, cleanSnapshot).catch(() => {});
    }

    const diskPath = this.getDiskCacheFilePath();
    if (diskPath) {
      try {
        const dir = this.explicitCacheDir ?? getAgyCacheDir();
        mkdirSync(dir, { recursive: true });
        writeFileSync(diskPath, JSON.stringify(cleanSnapshot, null, 2), "utf8");
      } catch {
        // Non-fatal disk cache write failure
      }
    }

    return true;
  }

  /**
   * Updates session-observed configOptions incrementally without dropping any
   * previously known catalog models (`#28433`).
   */
  applyIncrementalConfigOptions(
    configOptions: ReadonlyArray<AcpSessionConfigOption> | null | undefined,
  ): void {
    if (!Array.isArray(configOptions) || configOptions.length === 0) return;

    const modelOpt = findConfigOption(configOptions, "model");
    const thought = extractThoughtLevelsFromConfig(configOptions);

    if (modelOpt) {
      for (const opt of flattenSelectOptions(modelOpt)) {
        const id = opt.value.trim();
        if (!id) continue;
        const existing = this.models.get(id);
        const levels =
          modelOpt.currentValue === id && thought.levels.length > 0
            ? thought.levels
            : existing?.thoughtLevels ?? getStaticModelEfforts(id);
        this.models.set(
          id,
          inferModelMetadata(
            id,
            opt.name?.trim() || existing?.name || id,
            opt.description?.trim() ?? existing?.description,
            levels,
            modelOpt.currentValue === id ? thought.current : existing?.defaultThoughtLevel,
            "live",
          ),
        );
      }
    } else if (thought.levels.length > 0 && this.defaultModelId) {
      const existing = this.models.get(this.defaultModelId);
      if (existing) {
        this.models.set(this.defaultModelId, {
          ...existing,
          thoughtLevels: thought.levels,
          ...(thought.current ? { defaultThoughtLevel: thought.current } : {}),
        });
      }
    }
  }

  listEntries(): AgyCatalogModelEntry[] {
    return [...this.models.values()];
  }

  listOpenCodeModels(): OpenCodeV2ModelInfo[] {
    return this.listEntries().map(toOpenCodeModelInfo);
  }

  getEntry(modelId: string): AgyCatalogModelEntry | undefined {
    return this.models.get(modelId);
  }

  /**
   * Resolves an OpenCode model ID + requested effort/tier into the target ACP
   * `model` config option value and validated `thought_level` value.
   */
  resolveAcpModelAndThoughtLevel(
    requestedModelId: string,
    requestedEffort: string | undefined,
    sessionConfigOptions?: ReadonlyArray<AcpSessionConfigOption> | null,
  ): ResolvedAcpModelSelection {
    const modelOpt = findConfigOption(sessionConfigOptions, "model");
    const liveModelIds = new Set(
      flattenSelectOptions(modelOpt).map((o) => o.value.trim()).filter(Boolean),
    );
    const knownModels = new Set<string>([
      ...this.models.keys(),
      ...liveModelIds,
    ]);

    const { baseModelId, suffixEffort } = splitTierFormattedModelId(
      requestedModelId,
      knownModels,
    );

    const targetModelId =
      liveModelIds.size === 0 || liveModelIds.has(baseModelId)
        ? baseModelId
        : liveModelIds.has(requestedModelId)
          ? requestedModelId
          : baseModelId;

    const desiredEffort = (requestedEffort?.trim() || suffixEffort || "").toLowerCase() || undefined;

    const thoughtOpt = findConfigOption(sessionConfigOptions, "thought_level");
    const liveThoughtValues = flattenSelectOptions(thoughtOpt).map((o) => o.value);
    const catalogEntry = this.models.get(targetModelId);
    const allowedThoughts =
      liveThoughtValues.length > 0
        ? liveThoughtValues
        : catalogEntry?.thoughtLevels ?? [];

    let selectedThought: string | undefined;
    if (desiredEffort) {
      const exactMatch = allowedThoughts.find(
        (lvl) => lvl.toLowerCase() === desiredEffort,
      );
      if (exactMatch) {
        selectedThought = exactMatch;
      } else if (allowedThoughts.length === 0) {
        // When live thought_level options have not yet been queried for the new model,
        // pass the requested effort candidate to be validated after setting the model.
        selectedThought = desiredEffort;
      }
    }

    return {
      modelId: targetModelId,
      ...(selectedThought ? { thoughtLevel: selectedThought } : {}),
      ...(modelOpt?.id ? { modelConfigId: modelOpt.id } : {}),
      ...(thoughtOpt?.id ? { thoughtConfigId: thoughtOpt.id } : {}),
    };
  }
}
