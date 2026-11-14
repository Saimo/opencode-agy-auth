import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { AGY_PROVIDER_ID, AGY_PROVIDER_NAME } from "../constants";
import {
  findConfigOption,
  flattenSelectOptions,
  mergeSessionConfigOptions,
} from "../acp/catalog";
import {
  cleanupSessionDbFiles,
  resolveSessionDbPath,
  type AcpClientPool,
  type AgySpawnConfig,
} from "../acp/client";
import {
  AgyTurnOutcomeError,
  inspectTurnOutcomeFromDb,
} from "../acp/turn-outcome";
import {
  AcpRpcError,
  type AcpPermissionOption,
  type AcpRequestPermissionParams,
  type AcpRequestPermissionResult,
  type AcpToolCallPayload,
} from "../acp/types";
import type {
  OpenCodeV2PluginContext,
  OpenCodeV2PluginOptions,
  OpenCodeV2Registration,
  OpenCodeV2WebSearchResult,
} from "./types";

export const AGY_WEBSEARCH_PROVIDER_ID = AGY_PROVIDER_ID;
export const AGY_WEBSEARCH_PROVIDER_NAME = AGY_PROVIDER_NAME;

const DEFAULT_WEBSEARCH_MODEL_CANDIDATES = [
  "gemini-3.8-flash",
  "gemini-3-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-4-argon",
] as const;

const MAX_WEBSEARCH_ATTEMPTS = 3;

export interface ResolvedWebSearchConfig {
  readonly enabled: boolean;
  readonly setDefault: boolean;
  readonly model?: string;
}

export function resolveWebSearchConfig(
  options?: OpenCodeV2PluginOptions,
): ResolvedWebSearchConfig {
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
    const customModel = typeof wsOpt.model === "string" && wsOpt.model.trim()
      ? wsOpt.model.trim()
      : undefined;
    return {
      enabled: true,
      setDefault: wsOpt.default !== false,
      ...(customModel ? { model: customModel } : {}),
    };
  }

  return { enabled: true, setDefault: true };
}

export interface DiscoveredWebSource {
  readonly url: string;
  readonly title?: string;
  readonly snippet?: string;
}

function isAllowedSearchWebTool(params: AcpRequestPermissionParams): boolean {
  const kind = (params.toolCall.kind ?? "").toLowerCase();
  const title = (params.toolCall.title ?? "").toLowerCase();
  if (
    /run_command|terminal|bash|edit_file|write_file|delete|grep|view_file|read_file/i.test(
      title,
    )
  ) {
    return false;
  }
  return (
    kind === "search" ||
    /\bsearch_web\b|\bweb[\s_-]*search\b|^search\b/i.test(title)
  );
}

function pickPermissionOutcome(
  options: ReadonlyArray<AcpPermissionOption>,
  allow: boolean,
): AcpRequestPermissionResult {
  if (allow) {
    const opt =
      options.find((o) => o.kind === "allow_once") ??
      options.find((o) => o.kind === "allow_always") ??
      options.find((o) => o.kind.startsWith("allow"));
    if (opt) {
      return { outcome: { outcome: "selected", optionId: opt.optionId } };
    }
  } else {
    const opt =
      options.find((o) => o.kind === "reject_once") ??
      options.find((o) => o.kind === "reject_always") ??
      options.find((o) => o.kind.startsWith("reject"));
    if (opt) {
      return { outcome: { outcome: "selected", optionId: opt.optionId } };
    }
  }
  return { outcome: { outcome: "cancelled" } };
}

function harvestSourcesFromUnknown(node: unknown, out: DiscoveredWebSource[]): void {
  if (!node) return;
  if (typeof node === "string") {
    for (const match of node.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g)) {
      if (match[2]) {
        out.push({
          url: match[2],
          title: match[1]?.trim() || undefined,
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
    const obj = node as Record<string, unknown>;
    const rawUrl =
      typeof obj.url === "string"
        ? obj.url
        : typeof obj.uri === "string"
          ? obj.uri
          : typeof obj.link === "string"
            ? obj.link
            : undefined;
    if (rawUrl && /^https?:\/\//i.test(rawUrl.trim())) {
      const title =
        typeof obj.title === "string" && obj.title.trim() ? obj.title.trim() : undefined;
      const snippet =
        typeof obj.snippet === "string" && obj.snippet.trim()
          ? obj.snippet.trim()
          : typeof obj.content === "string" && obj.content.trim()
            ? obj.content.trim()
            : typeof obj.description === "string" && obj.description.trim()
              ? obj.description.trim()
              : undefined;
      out.push({
        url: rawUrl.trim(),
        ...(title ? { title } : {}),
        ...(snippet ? { snippet } : {}),
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

function harvestSourcesFromToolPayload(
  payload: AcpToolCallPayload,
  out: DiscoveredWebSource[],
): void {
  if (payload.rawOutput !== undefined) {
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

function tryParseJsonBlock(text: string): Record<string, unknown> | undefined {
  const trimmed = text.trim();
  const candidates: string[] = [trimmed];

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
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try next candidate
    }
  }
  return undefined;
}

/**
 * Parses `agy acp` web search text output + harvested `search_web` tool sources
 * into OpenCode's `OpenCodeV2WebSearchResult[]` schema.
 */
export function parseAgyWebSearchOutput(
  rawText: string,
  query: string,
  toolSources: ReadonlyArray<DiscoveredWebSource> = [],
): OpenCodeV2WebSearchResult[] {
  const collected: DiscoveredWebSource[] = [...toolSources];
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

  // Also harvest bare https:// URLs if no structured sources were found yet
  if (collected.length === 0) {
    for (const bare of summary.matchAll(/\bhttps?:\/\/[^\s<>)"'`]+/g)) {
      const cleanUrl = bare[0].replace(/[.,;:!?]+$/, "");
      if (cleanUrl) {
        collected.push({ url: cleanUrl });
      }
    }
  }

  const dedupedByUrl = new Map<string, DiscoveredWebSource>();
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
        snippet: prev.snippet ?? src.snippet,
      });
    }
  }

  const uniqueSources = [...dedupedByUrl.values()];
  if (!summary && uniqueSources.length === 0) {
    return [];
  }

  const fallbackSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  const primaryUrl = uniqueSources[0]?.url ?? fallbackSearchUrl;

  const sourceListMarkdown =
    uniqueSources.length > 0
      ? `\n\nSources:\n${uniqueSources
          .map(
            (src, idx) =>
              `[${idx + 1}] [${src.title ?? src.url}](${src.url})`,
          )
          .join("\n")}`
      : "";

  const results: OpenCodeV2WebSearchResult[] = [];
  if (summary) {
    results.push({
      url: primaryUrl,
      title: `Antigravity Web Search: ${query}`,
      content: `${summary}${sourceListMarkdown}`,
      time: {},
    });
  }

  uniqueSources.forEach((src, index) => {
    results.push({
      url: src.url,
      title: src.title ? `[${index + 1}] ${src.title}` : `[${index + 1}] ${src.url}`,
      ...(src.snippet ? { content: src.snippet } : {}),
      time: {},
    });
  });

  return results;
}

export function buildWebSearchPrompt(query: string, domain?: string): string {
  const domainDirective = domain?.trim()
    ? `\nPrioritize authoritative results from domain: ${domain.trim()}`
    : "";

  return [
    `Use the search_web tool to search the live web for the following query and return grounded results.`,
    `Query: ${query.trim()}${domainDirective}`,
    `Do NOT execute shell commands or read/modify local files.`,
    `Return ONLY a JSON object with this exact shape:`,
    `{"summary":"Concise factual summary synthesized from search results","sources":[{"url":"https://...","title":"Page title","snippet":"Relevant excerpt"}]}`,
  ].join("\n");
}

function isRateLimitError(err: unknown): boolean {
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

export async function executeAgyWebSearch(input: {
  readonly query: string;
  readonly domain?: string;
  readonly model?: string;
  readonly signal?: AbortSignal;
  readonly pool: AcpClientPool;
  readonly spawnConfig: AgySpawnConfig;
}): Promise<OpenCodeV2WebSearchResult[]> {
  const trimmedQuery = input.query.trim();
  if (!trimmedQuery) {
    return [];
  }

  const candidateModels: string[] = [];
  if (input.model?.trim()) {
    candidateModels.push(input.model.trim());
  }
  for (const fallback of DEFAULT_WEBSEARCH_MODEL_CANDIDATES) {
    if (!candidateModels.includes(fallback)) {
      candidateModels.push(fallback);
    }
  }

  const triedModels = new Set<string>();
  let lastError: unknown;

  for (let attemptIdx = 0; attemptIdx < MAX_WEBSEARCH_ATTEMPTS; attemptIdx++) {
    try {
      const attempt = await runSingleWebSearchAttempt({
        query: trimmedQuery,
        domain: input.domain,
        candidateModels,
        triedModels,
        signal: input.signal,
        pool: input.pool,
        baseSpawnConfig: input.spawnConfig,
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

  throw lastError instanceof Error
    ? lastError
    : new Error("Antigravity ACP web search failed.");
}

function selectWebSearchModelForAttempt(
  availableValues: ReadonlyArray<string>,
  currentValue: string | undefined,
  candidateModels: ReadonlyArray<string>,
  triedModels: ReadonlySet<string>,
): string | undefined {
  if (availableValues.length === 0) {
    return candidateModels.find((m) => !triedModels.has(m));
  }

  // 1. Prefer configured/default Flash candidates that actually exist in this `agy` build
  for (const candidate of candidateModels) {
    if (availableValues.includes(candidate) && !triedModels.has(candidate)) {
      return candidate;
    }
  }

  // 2. Any other `*flash*` model available in the live catalog
  for (const liveId of availableValues) {
    if (/flash/i.test(liveId) && !triedModels.has(liveId)) {
      return liveId;
    }
  }

  // 3. Session's default model (or remaining available model) as last resort
  if (currentValue && availableValues.includes(currentValue) && !triedModels.has(currentValue)) {
    return currentValue;
  }

  return availableValues.find((m) => !triedModels.has(m));
}

async function runSingleWebSearchAttempt(params: {
  readonly query: string;
  readonly domain?: string;
  readonly candidateModels: ReadonlyArray<string>;
  readonly triedModels: Set<string>;
  readonly signal?: AbortSignal;
  readonly pool: AcpClientPool;
  readonly baseSpawnConfig: AgySpawnConfig;
}): Promise<
  | { readonly noUntriedModel: true; readonly results?: never }
  | { readonly noUntriedModel: false; readonly results: OpenCodeV2WebSearchResult[] }
> {
  const tempCwd = mkdtempSync(`${tmpdir()}/opencode-agy-websearch-`);
  // Keep the pooled worker's OS cwd on a persistent directory (`baseSpawnConfig.cwd ?? tmpdir()`)
  // so unlinking `tempCwd` in `finally` never leaves a pooled `agy` process in an unlinked cwd.
  const spawnConfig: AgySpawnConfig = {
    ...params.baseSpawnConfig,
    cwd: params.baseSpawnConfig.cwd ?? tmpdir(),
    includeDefaultCustomizations: false,
  };

  const { connection, release } = await params.pool.acquire(spawnConfig, {
    signal: params.signal,
  });

  let sessionId: string | undefined;
  let unsubscribeUpdates: (() => void) | undefined;
  let unsubscribePermissions: (() => void) | undefined;

  try {
    const setup = await connection.createSession(
      {
        cwd: tempCwd,
        mcpServers: [],
        _meta: {
          // Keep built-in tools enabled ONLY so `search_web` is available; all other
          // built-in tools are strictly denied by `setPermissionHandler` below.
          disableBuiltInTools: false,
        },
      },
      { signal: params.signal },
    );
    sessionId = setup.sessionId;

    let currentConfigOptions = setup.configOptions ? [...setup.configOptions] : [];
    const modelOpt = findConfigOption(currentConfigOptions, "model");
    const availableValues = flattenSelectOptions(modelOpt).map((o) => o.value);
    const chosenModel = selectWebSearchModelForAttempt(
      availableValues,
      modelOpt?.currentValue,
      params.candidateModels,
      params.triedModels,
    );

    if (!chosenModel) {
      return { noUntriedModel: true };
    }
    params.triedModels.add(chosenModel);

    if (modelOpt && modelOpt.currentValue !== chosenModel) {
      const updated = await connection.setConfigOption(sessionId, modelOpt.id, chosenModel, {
        signal: params.signal,
      });
      currentConfigOptions = mergeSessionConfigOptions(
        currentConfigOptions,
        updated.configOptions,
      );
    }

    // Use minimal/low thinking effort for fast websearch turnaround when supported
    const thoughtOpt = findConfigOption(currentConfigOptions, "thought_level");
    if (thoughtOpt) {
      const thoughtValues = flattenSelectOptions(thoughtOpt).map((o) => o.value);
      const fastThought = thoughtValues.includes("minimal")
        ? "minimal"
        : thoughtValues.includes("low")
          ? "low"
          : undefined;
      if (fastThought && thoughtOpt.currentValue !== fastThought) {
        await connection
          .setConfigOption(sessionId, thoughtOpt.id, fastThought, {
            signal: params.signal,
          })
          .catch(() => {});
      }
    }

    const toolSources: DiscoveredWebSource[] = [];
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
      },
    );

    const dbPath = resolveSessionDbPath(sessionId, {
      geminiDir: spawnConfig.geminiDir,
      appDataDir: spawnConfig.appDataDir,
      env: spawnConfig.env,
    });
    const preTurnMaxIdx = -1;

    let onAbort: (() => void) | undefined;
    if (params.signal) {
      onAbort = () => {
        if (sessionId) connection.cancelSession(sessionId);
      };
      params.signal.addEventListener("abort", onAbort, { once: true });
    }

    let promptError: unknown;
    try {
      await connection.prompt(
        {
          sessionId,
          prompt: [
            {
              type: "text",
              text: buildWebSearchPrompt(params.query, params.domain),
            },
          ],
        },
        { signal: params.signal },
      );
    } catch (err) {
      promptError = err;
    } finally {
      if (onAbort && params.signal) {
        params.signal.removeEventListener("abort", onAbort);
      }
    }

    if (
      !params.signal?.aborted &&
      (promptError || (!responseText.trim() && toolSources.length === 0))
    ) {
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
      results: parseAgyWebSearchOutput(responseText, params.query, toolSources),
    };
  } finally {
    unsubscribeUpdates?.();
    unsubscribePermissions?.();
    if (sessionId) {
      await connection.closeSession(sessionId).catch(() => {});
      cleanupSessionDbFiles(sessionId, {
        geminiDir: spawnConfig.geminiDir,
        appDataDir: spawnConfig.appDataDir,
        env: spawnConfig.env,
      });
    }
    release();
    try {
      rmSync(tempCwd, { recursive: true, force: true });
    } catch {
      // Ignore temp directory removal errors
    }
  }
}

export async function registerV2WebSearch(
  ctx: OpenCodeV2PluginContext,
  deps: {
    pool: AcpClientPool;
    getSpawnConfig: () => Promise<AgySpawnConfig> | AgySpawnConfig;
    cleanups: Array<() => Promise<void> | void>;
  },
): Promise<void> {
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
          spawnConfig,
        });
      },
    });

    if (config.setDefault) {
      const current = editor.default.get();
      if (!current) {
        editor.default.set(AGY_WEBSEARCH_PROVIDER_ID);
      }
    }
  });

  if (reg && typeof (reg as OpenCodeV2Registration).dispose === "function") {
    deps.cleanups.push(() => (reg as OpenCodeV2Registration).dispose());
  }
}
