import { randomUUID } from "node:crypto";
import { AGY_CODE_ASSIST_ENDPOINT } from "../constants";
import modelsJson from "../../models.json";
import { agyFetch } from "../fetch";
import type { OpenCodeV2WebSearchResult } from "../plugin/types";
import { getModelEnum } from "./request/prepare";
import { buildAgyCliUserAgent } from "./user-agent";

const DEFAULT_WEB_SEARCH_MODELS: readonly string[] = (() => {
  const fromCatalog = Array.isArray((modelsJson as { webSearchModelIds?: unknown }).webSearchModelIds)
    ? ((modelsJson as { webSearchModelIds: unknown[] }).webSearchModelIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      ))
    : [];
  const fallbacks = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"];
  return Array.from(new Set([...fromCatalog, ...fallbacks]));
})();

const RETRYABLE_WEB_SEARCH_STATUSES = new Set([429, 500, 502, 503, 504]);

export interface AgyWebSearchRequestOptions {
  readonly query: string;
  readonly domain?: string;
  readonly accessToken: string;
  readonly projectId: string;
  readonly model?: string;
  readonly signal?: AbortSignal;
}

interface RawGroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

interface RawGroundingSupport {
  segment?: {
    partIndex?: number;
    startIndex?: number;
    endIndex?: number;
    text?: string;
  };
  groundingChunkIndices?: number[];
}

interface RawCandidate {
  content?: {
    parts?: Array<{
      text?: string;
      thought?: boolean;
    }>;
  };
  groundingMetadata?: {
    webSearchQueries?: string[];
    groundingChunks?: RawGroundingChunk[];
    groundingSupports?: RawGroundingSupport[];
  };
}

export interface DeduplicatedGroundingSource {
  readonly citationIndex: number;
  readonly uri: string;
  readonly title: string;
  readonly snippets: string[];
}

/**
 * Clamps a UTF-8 byte offset so it never lands in the middle of a multi-byte UTF-8 sequence.
 */
function clampUtf8Boundary(buf: Buffer, byteOffset: number): number {
  let idx = Math.max(0, Math.min(buf.length, Math.trunc(byteOffset)));
  while (idx > 0 && idx < buf.length && (buf[idx]! & 0xc0) === 0x80) {
    idx--;
  }
  return idx;
}

function extractDomainTitle(uri: string): string {
  try {
    return new URL(uri).hostname.replace(/^www\./i, "") || uri;
  } catch {
    return uri;
  }
}

/**
 * Injects sorted inline `[1][2]` markers at UTF-8 byte offsets from Gemini `groundingSupports`.
 */
export function injectInlineCitations(
  summaryText: string,
  supports: readonly RawGroundingSupport[],
  chunkToCitation: ReadonlyMap<number, number>,
): string {
  if (!summaryText || supports.length === 0 || chunkToCitation.size === 0) {
    return summaryText;
  }

  const utf8 = Buffer.from(summaryText, "utf8");
  const insertionsByOffset = new Map<number, Set<number>>();

  for (const support of supports) {
    const rawEnd = support?.segment?.endIndex;
    if (typeof rawEnd !== "number" || !Number.isFinite(rawEnd) || rawEnd <= 0) {
      continue;
    }
    const indices = support.groundingChunkIndices;
    if (!Array.isArray(indices) || indices.length === 0) {
      continue;
    }

    const citationNumbers: number[] = [];
    for (const chunkIdx of indices) {
      const citation = chunkToCitation.get(chunkIdx);
      if (citation !== undefined) {
        citationNumbers.push(citation);
      }
    }
    if (citationNumbers.length === 0) {
      continue;
    }

    const clampedOffset = clampUtf8Boundary(utf8, rawEnd);
    const bucket = insertionsByOffset.get(clampedOffset) ?? new Set<number>();
    for (const c of citationNumbers) {
      bucket.add(c);
    }
    insertionsByOffset.set(clampedOffset, bucket);
  }

  if (insertionsByOffset.size === 0) {
    return summaryText;
  }

  const sortedOffsets = Array.from(insertionsByOffset.keys()).sort((a, b) => a - b);
  const chunks: Buffer[] = [];
  let cursor = 0;

  for (const offset of sortedOffsets) {
    if (offset > cursor) {
      chunks.push(utf8.subarray(cursor, offset));
      cursor = offset;
    }
    const markerNums = Array.from(insertionsByOffset.get(offset)!).sort((a, b) => a - b);
    const marker = markerNums.map((n) => `[${n}]`).join("");
    chunks.push(Buffer.from(marker, "utf8"));
  }

  if (cursor < utf8.length) {
    chunks.push(utf8.subarray(cursor));
  }

  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Parses a Code Assist `:generateContent` grounded web search payload into OpenCode v2 `WebSearch.Result[]`.
 */
export function parseAgyWebSearchPayload(
  payload: unknown,
  query: string,
): OpenCodeV2WebSearchResult[] {
  const root =
    payload && typeof payload === "object" && "response" in payload
      ? (payload as { response?: unknown }).response
      : payload;

  if (!root || typeof root !== "object") {
    return [];
  }

  const candidates = (root as { candidates?: RawCandidate[] }).candidates;
  const candidate = Array.isArray(candidates) ? candidates[0] : undefined;
  if (!candidate) {
    return [];
  }

  // Filter out internal thought parts (`thought: true`), keeping final answer text parts
  const rawParts = Array.isArray(candidate.content?.parts) ? candidate.content!.parts : [];
  const summaryText = rawParts
    .filter((part) => part && part.thought !== true && typeof part.text === "string")
    .map((part) => part.text!)
    .join("")
    .trim();

  const rawChunks = Array.isArray(candidate.groundingMetadata?.groundingChunks)
    ? candidate.groundingMetadata!.groundingChunks
    : [];
  const rawSupports = Array.isArray(candidate.groundingMetadata?.groundingSupports)
    ? candidate.groundingMetadata!.groundingSupports
    : [];

  const sourcesByUri = new Map<string, DeduplicatedGroundingSource>();
  const chunkToCitation = new Map<number, number>();

  for (let i = 0; i < rawChunks.length; i++) {
    const web = rawChunks[i]?.web;
    const uri = typeof web?.uri === "string" ? web.uri.trim() : "";
    if (!uri) continue;

    let existing = sourcesByUri.get(uri);
    if (!existing) {
      const title = (typeof web?.title === "string" ? web.title.trim() : "") || extractDomainTitle(uri);
      existing = {
        citationIndex: sourcesByUri.size + 1,
        uri,
        title,
        snippets: [],
      };
      sourcesByUri.set(uri, existing);
    }
    chunkToCitation.set(i, existing.citationIndex);
  }

  // Attribute grounded segments to each source so individual source results carry context
  const sourcesByCitation = new Map<number, DeduplicatedGroundingSource>();
  for (const source of sourcesByUri.values()) {
    sourcesByCitation.set(source.citationIndex, source);
  }

  for (const support of rawSupports) {
    const snippet = typeof support?.segment?.text === "string" ? support.segment.text.trim() : "";
    if (!snippet || !Array.isArray(support.groundingChunkIndices)) continue;
    for (const chunkIdx of support.groundingChunkIndices) {
      const citation = chunkToCitation.get(chunkIdx);
      const source = citation !== undefined ? sourcesByCitation.get(citation) : undefined;
      if (source && !source.snippets.includes(snippet)) {
        source.snippets.push(snippet);
      }
    }
  }

  const orderedSources = Array.from(sourcesByUri.values());
  if (!summaryText && orderedSources.length === 0) {
    return [];
  }

  const citedSummary = injectInlineCitations(summaryText, rawSupports, chunkToCitation);
  const results: OpenCodeV2WebSearchResult[] = [];

  if (citedSummary) {
    const primaryUrl =
      orderedSources[0]?.uri ??
      `https://www.google.com/search?q=${encodeURIComponent(query.trim())}`;

    let fullContent = citedSummary;
    if (orderedSources.length > 0) {
      const sourceLines = orderedSources.map((s) => `[${s.citationIndex}] [${s.title}](${s.uri})`);
      const hasRedirectUrls = orderedSources.some((s) =>
        s.uri.includes("vertexaisearch.cloud.google.com/grounding-api-redirect"),
      );
      fullContent += `\n\nSources:\n${sourceLines.join("\n")}`;
      if (hasRedirectUrls) {
        fullContent +=
          "\n\nNote: Source URLs are HTTP redirects; follow the redirect if you need the canonical destination URL.";
      }
    }

    results.push({
      url: primaryUrl,
      title: `Antigravity Web Search: ${query.trim()}`,
      content: fullContent,
      time: {},
    });
  }

  for (const source of orderedSources) {
    results.push({
      url: source.uri,
      title: `[${source.citationIndex}] ${source.title}`,
      ...(source.snippets.length > 0 ? { content: source.snippets.join(" … ") } : {}),
      time: {},
    });
  }

  return results;
}

export function buildAgyWebSearchRequestBody(input: {
  query: string;
  domain?: string;
  projectId: string;
  model: string;
}): Record<string, unknown> {
  const trimmedQuery = input.query.trim();
  const trimmedDomain = input.domain?.trim();
  const promptText = trimmedDomain
    ? `${trimmedQuery}\n\nPrioritize authoritative results from domain: ${trimmedDomain}`
    : trimmedQuery;

  return {
    project: input.projectId,
    model: input.model,
    requestId: randomUUID(),
    userAgent: "antigravity",
    requestType: "web_search",
    request: {
      contents: [
        {
          role: "user",
          parts: [{ text: promptText }],
        },
      ],
      tools: [{ googleSearch: {} }],
      labels: {
        last_execution_id: randomUUID(),
        last_step_index: "0",
        model_enum: getModelEnum(input.model),
        trajectory_id: randomUUID(),
        used_claude: "false",
        used_claude_conservative: "false",
      },
    },
  };
}

/**
 * Executes a grounded web search through Antigravity's Code Assist API (`requestType: "web_search"`).
 */
export async function executeAgyWebSearch(
  options: AgyWebSearchRequestOptions,
): Promise<OpenCodeV2WebSearchResult[]> {
  const trimmedQuery = options.query.trim();
  if (!trimmedQuery) {
    return [];
  }

  const candidateModels = options.model?.trim()
    ? [options.model.trim()]
    : DEFAULT_WEB_SEARCH_MODELS;

  const url = `${AGY_CODE_ASSIST_ENDPOINT}/v1internal:generateContent`;
  let lastStatus = 0;
  let lastErrorText = "";

  for (let i = 0; i < candidateModels.length; i++) {
    const model = candidateModels[i]!;
    const body = buildAgyWebSearchRequestBody({
      query: trimmedQuery,
      domain: options.domain,
      projectId: options.projectId,
      model,
    });

    const response = await agyFetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        "User-Agent": buildAgyCliUserAgent(model),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (response.ok) {
      const payload = await response.json();
      return parseAgyWebSearchPayload(payload, trimmedQuery);
    }

    lastStatus = response.status;
    try {
      lastErrorText = (await response.text()).slice(0, 500);
    } catch {
      lastErrorText = "";
    }

    const hasNextFallback = i < candidateModels.length - 1;
    if (!hasNextFallback || !RETRYABLE_WEB_SEARCH_STATUSES.has(response.status)) {
      break;
    }
  }

  const error = new Error(
    `Antigravity web search failed (HTTP ${lastStatus})${lastErrorText ? `: ${lastErrorText}` : ""}`,
  ) as Error & { response?: { status: number } };
  error.response = { status: lastStatus };
  throw error;
}
