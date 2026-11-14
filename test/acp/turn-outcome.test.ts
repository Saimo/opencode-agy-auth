import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  AgyTurnOutcomeError,
  CORTEX_STEP_TYPE_ERROR_MESSAGE,
  evaluateTurnStepRows,
  inspectTurnOutcomeFromDb,
  readPreTurnMaxStepIdx,
  scanProtobufWire,
} from "../../src/acp/turn-outcome";

function encodeVarint(value: number): Buffer {
  const bytes: number[] = [];
  let v = value >>> 0;
  while (v >= 0x80) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v);
  return Buffer.from(bytes);
}

function encodeProtoString(fieldNo: number, str: string): Buffer {
  const tag = encodeVarint((fieldNo << 3) | 2);
  const data = Buffer.from(str, "utf8");
  const len = encodeVarint(data.length);
  return Buffer.concat([tag, len, data]);
}

function encodeProtoVarintField(fieldNo: number, val: number): Buffer {
  const tag = encodeVarint((fieldNo << 3) | 0);
  return Buffer.concat([tag, encodeVarint(val)]);
}

function encodeProtoNestedMessage(fieldNo: number, inner: Buffer): Buffer {
  const tag = encodeVarint((fieldNo << 3) | 2);
  const len = encodeVarint(inner.length);
  return Buffer.concat([tag, len, inner]);
}

describe("acp/turn-outcome", () => {
  const tempDirs: string[] = [];

  function createStepsDb(): string {
    const dir = mkdtempSync(join(tmpdir(), "agy-sqlite-test-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "session.db");
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE steps (
        idx INTEGER PRIMARY KEY,
        step_type INTEGER NOT NULL,
        status INTEGER DEFAULT 0,
        step_payload BLOB,
        error_details BLOB
      );
    `);
    db.close();
    return dbPath;
  }

  afterEach(() => {
    for (const d of tempDirs.splice(0, tempDirs.length)) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("extracts nested protobuf wire-format status codes, messages, and quotaResetTimeStamp", () => {
    const innerDetail = Buffer.concat([
      encodeProtoString(1, "type.googleapis.com/google.rpc.ErrorInfo"),
      encodeProtoString(2, "QUOTA_EXHAUSTED"),
      encodeProtoString(3, "quotaResetTimeStamp=2099-05-01T12:00:00Z"),
      encodeProtoString(4, "retryDelay=4s"),
    ]);
    const outerProto = Buffer.concat([
      encodeProtoVarintField(1, 429),
      encodeProtoString(2, "You have exhausted your capacity on this model."),
      encodeProtoNestedMessage(3, innerDetail),
    ]);

    const strings: string[] = [];
    const codes: number[] = [];
    expect(scanProtobufWire(outerProto, 0, outerProto.length, strings, codes)).toBe(true);
    expect(codes).toContain(429);

    const outcome = evaluateTurnStepRows([
      {
        idx: 5,
        step_type: CORTEX_STEP_TYPE_ERROR_MESSAGE,
        step_payload: outerProto,
        error_details: null,
      },
    ]);

    expect(outcome).toBeDefined();
    expect(outcome!.statusCode).toBe(429);
    expect(outcome!.quotaResetTimestamp).toBe("2099-05-01T12:00:00Z");
    expect(outcome!.retryAfterMs).toBe(4000);
    expect(outcome!.isRetryable).toBe(true);
    expect(outcome!.isInvalidThinkingSignature).toBe(false);

    const apiErr = new AgyTurnOutcomeError(outcome!);
    expect((apiErr as unknown as Record<symbol, unknown>)[Symbol.for("vercel.ai.error")]).toBe(true);
    expect(
      (apiErr as unknown as Record<symbol, unknown>)[
        Symbol.for("vercel.ai.error.AI_APICallError")
      ],
    ).toBe(true);
    expect(apiErr.statusCode).toBe(429);
    expect(apiErr.responseHeaders?.["retry-after"]).toBe("4");
  });

  it("queries real SQLite .db files, respects preTurnMaxIdx, and ignores superseded transient errors", async () => {
    const dbPath = createStepsDb();
    expect(await readPreTurnMaxStepIdx(dbPath)).toBe(-1);

    const db = new DatabaseSync(dbPath);
    // Turn 1 error at idx=0 (historical)
    db.prepare(
      "INSERT INTO steps (idx, step_type, error_details) VALUES (?, ?, ?)",
    ).run(0, CORTEX_STEP_TYPE_ERROR_MESSAGE, Buffer.from("HTTP 502 Bad Gateway"));
    db.close();

    const preTurnIdx = await readPreTurnMaxStepIdx(dbPath);
    expect(preTurnIdx).toBe(0);

    // No new steps in Turn 2 -> historical error at idx=0 MUST be ignored
    expect(await inspectTurnOutcomeFromDb(dbPath, preTurnIdx)).toBeUndefined();

    // Turn 2 writes transient 429 at idx=1, then succeeds at idx=2 -> MUST return undefined
    const db2 = new DatabaseSync(dbPath);
    db2
      .prepare("INSERT INTO steps (idx, step_type, error_details) VALUES (?, ?, ?)")
      .run(1, CORTEX_STEP_TYPE_ERROR_MESSAGE, Buffer.from("HTTP 429 Too Many Requests"));
    db2
      .prepare("INSERT INTO steps (idx, step_type, step_payload) VALUES (?, ?, ?)")
      .run(2, 1, Buffer.from("Model response"));
    db2.close();

    expect(await inspectTurnOutcomeFromDb(dbPath, preTurnIdx)).toBeUndefined();

    // Turn 3 writes terminal 502 at idx=3 -> MUST be surfaced
    const db3 = new DatabaseSync(dbPath);
    db3
      .prepare("INSERT INTO steps (idx, step_type, error_details) VALUES (?, ?, ?)")
      .run(
        3,
        CORTEX_STEP_TYPE_ERROR_MESSAGE,
        Buffer.from(JSON.stringify({ error: { code: 502, message: "502 Bad Gateway" } })),
      );
    db3.close();

    const terminalOutcome = await inspectTurnOutcomeFromDb(dbPath, 2);
    expect(terminalOutcome).toBeDefined();
    expect(terminalOutcome!.stepIdx).toBe(3);
    expect(terminalOutcome!.statusCode).toBe(502);
    expect(terminalOutcome!.isRetryable).toBe(true);
  });

  it("classifies Claude 400 Invalid signature errors as non-retryable signature corruption (#28889)", () => {
    const outcome = evaluateTurnStepRows([
      {
        idx: 1,
        step_type: CORTEX_STEP_TYPE_ERROR_MESSAGE,
        error_details: JSON.stringify({
          error: {
            code: 400,
            message: "messages.1.content.0.thinking.signature: Invalid `signature` in `thinking` block",
          },
        }),
      },
    ]);

    expect(outcome).toBeDefined();
    expect(outcome!.statusCode).toBe(400);
    expect(outcome!.isInvalidThinkingSignature).toBe(true);
    expect(outcome!.isRetryable).toBe(false);
  });
});
