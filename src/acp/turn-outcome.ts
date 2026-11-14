import { existsSync } from "node:fs";

export const CORTEX_STEP_TYPE_ERROR_MESSAGE = 17;

export interface SqliteStepRow {
  readonly idx: number;
  readonly step_type: number;
  readonly status?: unknown;
  readonly step_payload?: Uint8Array | Buffer | string | null;
  readonly error_details?: Uint8Array | Buffer | string | null;
}

export interface AgyTurnErrorOutcome {
  readonly stepIdx: number;
  readonly message: string;
  readonly statusCode?: number;
  readonly retryAfterMs?: number;
  readonly quotaResetTimestamp?: string;
  readonly isInvalidThinkingSignature: boolean;
  readonly isRetryable: boolean;
}

const AI_SDK_ERROR_SYMBOL = Symbol.for("vercel.ai.error");
const AI_SDK_API_CALL_ERROR_SYMBOL = Symbol.for("vercel.ai.error.AI_APICallError");

export class AgyTurnOutcomeError extends Error {
  readonly [AI_SDK_ERROR_SYMBOL] = true;
  readonly [AI_SDK_API_CALL_ERROR_SYMBOL] = true;
  readonly url = "acp://agy/session/prompt";
  readonly requestBodyValues: Record<string, unknown> = {};
  readonly status?: number;
  readonly statusCode?: number;
  readonly retryAfterMs?: number;
  readonly quotaResetTimestamp?: string;
  readonly isInvalidThinkingSignature: boolean;
  readonly isRetryable: boolean;
  readonly responseHeaders?: Record<string, string>;
  readonly responseBody?: string;

  constructor(outcome: AgyTurnErrorOutcome) {
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
        ...(outcome.quotaResetTimestamp
          ? { quotaResetTimeStamp: outcome.quotaResetTimestamp }
          : {}),
        ...(outcome.retryAfterMs !== undefined
          ? { retryAfterMs: outcome.retryAfterMs }
          : {}),
      },
    });
    if (outcome.retryAfterMs !== undefined && outcome.retryAfterMs > 0) {
      this.responseHeaders = {
        "retry-after": String(Math.max(1, Math.ceil(outcome.retryAfterMs / 1000))),
        "retry-after-ms": String(outcome.retryAfterMs),
      };
    }
  }
}

interface ReadOnlySqliteHandle {
  queryAll(sql: string, ...params: unknown[]): Record<string, unknown>[];
  close(): void;
}

type SqliteDriverOpen = (targetPath: string) => ReadOnlySqliteHandle;

let cachedSqliteDriverPromise: Promise<SqliteDriverOpen | null> | undefined;

function getSqliteDriver(): Promise<SqliteDriverOpen | null> {
  if (!cachedSqliteDriverPromise) {
    cachedSqliteDriverPromise = (async (): Promise<SqliteDriverOpen | null> => {
      // 1. Prefer Node 22.5+/24+ built-in `node:sqlite` (lazy-loaded to avoid startup ExperimentalWarning)
      try {
        const modName = "node:sqlite";
        const sqliteMod = (await import(/* @vite-ignore */ modName)) as {
          DatabaseSync?: new (
            path: string,
            options?: { readOnly?: boolean; open?: boolean },
          ) => {
            prepare(sql: string): { all(...params: unknown[]): Record<string, unknown>[] };
            close(): void;
          };
        };
        if (typeof sqliteMod.DatabaseSync === "function") {
          const DatabaseSyncCtor = sqliteMod.DatabaseSync;
          return (targetPath: string): ReadOnlySqliteHandle => {
            const db = new DatabaseSyncCtor(targetPath, { readOnly: true });
            return {
              queryAll(sql: string, ...params: unknown[]) {
                return db.prepare(sql).all(...params);
              },
              close() {
                db.close();
              },
            };
          };
        }
      } catch {
        // Fallback to bun:sqlite when running inside OpenCode's Bun runtime if node:sqlite is unavailable
      }

      // 2. Fallback to Bun's built-in `bun:sqlite`
      try {
        const bunSqliteName = "bun:sqlite";
        const bunMod = (await import(/* @vite-ignore */ bunSqliteName)) as {
          Database?: new (
            path: string,
            options?: { readonly?: boolean },
          ) => {
            query(sql: string): { all(...params: unknown[]): Record<string, unknown>[] };
            close(): void;
          };
        };
        if (typeof bunMod.Database === "function") {
          const BunDatabaseCtor = bunMod.Database;
          return (targetPath: string): ReadOnlySqliteHandle => {
            const db = new BunDatabaseCtor(targetPath, { readonly: true });
            return {
              queryAll(sql: string, ...params: unknown[]) {
                return db.query(sql).all(...params);
              },
              close() {
                db.close();
              },
            };
          };
        }
      } catch {
        // Neither node:sqlite nor bun:sqlite available
      }

      return null;
    })();
  }

  return cachedSqliteDriverPromise;
}

async function openReadOnlySqlite(dbPath: string): Promise<ReadOnlySqliteHandle | undefined> {
  if (!existsSync(dbPath)) {
    return undefined;
  }

  const openDriver = await getSqliteDriver();
  if (!openDriver) {
    return undefined;
  }

  try {
    return openDriver(dbPath);
  } catch {
    return undefined;
  }
}

/**
 * Reads `MAX(idx)` from `<sessionId>.db` before sending `session/prompt` so
 * out-of-band inspection only considers steps produced by the current turn.
 */
export async function readPreTurnMaxStepIdx(dbPath: string): Promise<number> {
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
      // Ignore
    }
  }
}

/**
 * Inspects `<sessionId>.db` for terminal `step_type = 17` (`ERROR_MESSAGE`) rows
 * added after `preTurnMaxIdx`. Ignores transient mid-turn errors that were
 * superseded by a later non-error step (`idx > errorRow.idx`).
 */
export async function inspectTurnOutcomeFromDb(
  dbPath: string,
  preTurnMaxIdx: number,
): Promise<AgyTurnErrorOutcome | undefined> {
  const db = await openReadOnlySqlite(dbPath);
  if (!db) return undefined;
  try {
    const rows = db.queryAll(
      "SELECT idx, step_type, status, step_payload, error_details FROM steps WHERE idx > ? ORDER BY idx ASC",
      preTurnMaxIdx,
    ) as unknown as SqliteStepRow[];

    return evaluateTurnStepRows(rows);
  } catch {
    return undefined;
  } finally {
    try {
      db.close();
    } catch {
      // Ignore
    }
  }
}

/**
 * Pure evaluator over `steps` rows (`idx > preTurnMaxIdx`) — separated for deterministic unit testing.
 */
export function evaluateTurnStepRows(
  rows: ReadonlyArray<SqliteStepRow>,
): AgyTurnErrorOutcome | undefined {
  if (!rows.length) return undefined;

  let lastErrorRow: SqliteStepRow | undefined;
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

  if (!lastErrorRow) return undefined;

  // Ignore transient retried 429/5xx error rows superseded by a later successful step
  if (lastNonErrorIdx > Number(lastErrorRow.idx)) {
    return undefined;
  }

  return parseErrorStepRow(lastErrorRow);
}

export function parseErrorStepRow(row: SqliteStepRow): AgyTurnErrorOutcome {
  const stepIdx = Number(row.idx);
  const fragments: string[] = [];
  const candidateStatusCodes: number[] = [];

  if (row.error_details !== null && row.error_details !== undefined) {
    collectTextAndCodes(row.error_details, fragments, candidateStatusCodes);
  }
  if (row.step_payload !== null && row.step_payload !== undefined) {
    collectTextAndCodes(row.step_payload, fragments, candidateStatusCodes);
  }

  const combined = deduplicateFragments(fragments).join(" — ").trim();
  const message = combined || "Antigravity upstream request failed";

  const statusCode = inferHttpStatusCode(message, candidateStatusCodes);
  const quotaResetTimestamp = extractQuotaResetTimestamp(message);
  const retryAfterMs = extractRetryDelayMs(message, quotaResetTimestamp);
  const isInvalidThinkingSignature = isInvalidThinkingSignatureText(message);
  const isRetryable =
    !isInvalidThinkingSignature &&
    statusCode !== undefined &&
    (statusCode === 408 || statusCode === 429 || (statusCode >= 500 && statusCode <= 599));

  return {
    stepIdx,
    message,
    ...(statusCode !== undefined ? { statusCode } : {}),
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    ...(quotaResetTimestamp !== undefined ? { quotaResetTimestamp } : {}),
    isInvalidThinkingSignature,
    isRetryable,
  };
}

export function isInvalidThinkingSignatureText(text: string): boolean {
  if (!text) return false;
  return (
    /invalid[\s_`'-]*signature/i.test(text) ||
    /thinking[\s_`'-]*(?:block[\s_`'-]*)?signature/i.test(text) ||
    /signature[\s_`'-]*(?:is[\s_`'-]*)?(?:missing|invalid|corrupt|mismatch)/i.test(text) ||
    /corrupted[\s_`'-]*thought/i.test(text)
  );
}

function collectTextAndCodes(
  raw: Uint8Array | Buffer | string,
  outStrings: string[],
  outCodes: number[],
): void {
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

  // Check if bytes are plain UTF-8 JSON first
  if (bytes[0] === 0x7b || bytes[0] === 0x5b) {
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes).trim();
    if (tryExtractJsonDetails(decoded, outStrings, outCodes)) {
      return;
    }
  }

  const protoStrings: string[] = [];
  scanProtobufWire(bytes, 0, bytes.length, protoStrings, outCodes, 0);

  if (protoStrings.length > 0) {
    for (const str of protoStrings) {
      if (!tryExtractJsonDetails(str, outStrings, outCodes)) {
        outStrings.push(str);
      }
    }
    return;
  }

  // Fallback printable UTF-8 span extraction if payload was non-standard binary
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

function tryExtractJsonDetails(
  text: string,
  outStrings: string[],
  outCodes: number[],
): boolean {
  if (!(text.startsWith("{") || text.startsWith("["))) {
    return false;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    walkJsonErrorPayload(parsed, outStrings, outCodes);
    return true;
  } catch {
    return false;
  }
}

function walkJsonErrorPayload(
  node: unknown,
  outStrings: string[],
  outCodes: number[],
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walkJsonErrorPayload(item, outStrings, outCodes);
    return;
  }
  const obj = node as Record<string, unknown>;
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
    "retryDelay",
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

function readVarint(
  bytes: Uint8Array,
  offset: number,
  end: number,
): { value: bigint; nextOffset: number } | undefined {
  let result = 0n;
  let shift = 0n;
  let pos = offset;
  while (pos < end && shift <= 63n) {
    const byte = bytes[pos]!;
    pos += 1;
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { value: result, nextOffset: pos };
    }
    shift += 7n;
  }
  return undefined;
}

/**
 * Genuine protobuf wire-format scanner (`wireType` 0/1/2/5) that extracts nested
 * UTF-8 string fields and HTTP status varints without external dependencies.
 */
export function scanProtobufWire(
  bytes: Uint8Array,
  start: number,
  end: number,
  outStrings: string[],
  outCodes: number[],
  depth = 0,
): boolean {
  if (depth > 8 || start >= end) return false;
  let pos = start;
  let parsedFields = 0;

  while (pos < end) {
    const tag = readVarint(bytes, pos, end);
    if (!tag || tag.value === 0n) return false;
    pos = tag.nextOffset;

    const wireType = Number(tag.value & 0x07n);
    const fieldNo = Number(tag.value >> 3n);
    if (fieldNo <= 0 || fieldNo > 536_870_911) return false;

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
        const subStrings: string[] = [];
        const subCodes: number[] = [];
        const slice = bytes.subarray(pos, pos + length);
        const asUtf8 = decodePrintableUtf8(slice);

        if (asUtf8 !== undefined) {
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

function decodePrintableUtf8(bytes: Uint8Array): string | undefined {
  if (bytes.length < 2) return undefined;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
  let printable = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) {
      printable += 1;
    } else {
      return undefined;
    }
  }
  if (printable === 0) return undefined;
  const trimmed = text.trim();
  if (trimmed.length < 2) return undefined;
  return trimmed;
}

function deduplicateFragments(fragments: ReadonlyArray<string>): string[] {
  const unique: string[] = [];
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

function inferHttpStatusCode(message: string, candidates: ReadonlyArray<number>): number | undefined {
  const explicitHttpMatch = message.match(
    /\b(?:HTTP(?:\/\d(?:\.\d)?)?\s+|status(?:\s+code)?[:=\s]+)(4\d\d|5\d\d)\b/i,
  );
  if (explicitHttpMatch?.[1]) {
    return Number(explicitHttpMatch[1]);
  }
  if (/\b502\b.*bad gateway|bad gateway.*\b502\b/i.test(message)) return 502;
  if (/\b503\b.*service unavailable|service unavailable/i.test(message)) return 503;
  if (/\b504\b.*gateway timeout|gateway timeout/i.test(message)) return 504;
  if (/\b529\b|overloaded/i.test(message)) return 529;
  if (
    /\b429\b|RESOURCE_EXHAUSTED|QUOTA_EXHAUSTED|RATE_LIMIT_EXCEEDED|too many requests|quota.*exhausted|rate limit/i.test(
      message,
    )
  ) {
    return 429;
  }
  if (/\b401\b|UNAUTHENTICATED|authentication required/i.test(message)) return 401;
  if (/\b403\b|PERMISSION_DENIED/i.test(message)) return 403;
  if (/\b400\b|INVALID_ARGUMENT/i.test(message) || isInvalidThinkingSignatureText(message)) {
    return 400;
  }
  if (/\b500\b|INTERNAL\b/i.test(message)) return 500;

  for (const code of candidates) {
    if (
      code === 400 ||
      code === 401 ||
      code === 403 ||
      code === 404 ||
      code === 408 ||
      code === 429 ||
      code === 500 ||
      code === 502 ||
      code === 503 ||
      code === 504 ||
      code === 529
    ) {
      return code;
    }
  }
  return undefined;
}

function extractQuotaResetTimestamp(message: string): string | undefined {
  const kvMatch = message.match(
    /quotaResetTimeStamp[=:"'\s]+([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-]+Z?)/i,
  );
  if (kvMatch?.[1]) return kvMatch[1];

  const isoMatch = message.match(/\b([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z)\b/);
  if (isoMatch?.[1]) return isoMatch[1];

  return undefined;
}

function extractRetryDelayMs(
  message: string,
  quotaResetTimestamp?: string,
): number | undefined {
  const delayPatterns = [
    /retryDelay[=:"'\s]+([0-9.]+)(ms|s)\b/i,
    /Please retry in ([0-9.]+)(ms|s)\b/i,
    /retry after ([0-9.]+)(ms|s)\b/i,
  ];
  for (const pattern of delayPatterns) {
    const m = message.match(pattern);
    if (m?.[1] && m[2]) {
      const value = Number(m[1]);
      if (Number.isFinite(value) && value > 0) {
        return m[2].toLowerCase() === "ms" ? Math.round(value) : Math.round(value * 1000);
      }
    }
  }

  if (quotaResetTimestamp) {
    const targetMs = Date.parse(quotaResetTimestamp);
    if (Number.isFinite(targetMs)) {
      const delta = targetMs - Date.now();
      if (delta > 0 && delta < 24 * 3600_000) {
        return Math.round(delta);
      }
    }
  }

  return undefined;
}
