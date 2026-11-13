import { describe, expect, it } from "vitest";
import {
  AGY_PROVIDER_ID,
  AGY_CLIENT_ID,
  AGY_CLIENT_SECRET,
  AGY_SCOPES,
  AGY_REDIRECT_URI,
  AGY_CODE_ASSIST_ENDPOINT,
  AGY_GENERATIVE_LANGUAGE_ENDPOINT,
} from "../src/constants";
import { normalizeThinkingConfig } from "../src/sdk/request-helpers/thinking";
import { extractUsageMetadata, parseGeminiApiBody } from "../src/sdk/request-helpers/parsing";
import { enhanceGeminiErrorResponse, rewriteGeminiPreviewAccessError } from "../src/sdk/request-helpers/errors";

describe("src/constants", () => {
  it("exports expected API endpoints and OAuth configs", () => {
    expect(AGY_PROVIDER_ID).toBe("google-agy");
    expect(AGY_CLIENT_ID).toBeDefined();
    expect(AGY_CLIENT_SECRET).toBeDefined();
    expect(AGY_SCOPES.length).toBeGreaterThan(0);
    expect(AGY_REDIRECT_URI).toBe("https://antigravity.google/oauth-callback");
    expect(AGY_CODE_ASSIST_ENDPOINT).toContain("googleapis.com");
    expect(AGY_GENERATIVE_LANGUAGE_ENDPOINT).toBe("https://generativelanguage.googleapis.com/v1beta");
  });
});

describe("src/sdk/request-helpers/thinking", () => {
  it("normalizes thinkingConfig correctly", () => {
    expect(normalizeThinkingConfig(undefined)).toBeUndefined();
    expect(normalizeThinkingConfig("invalid")).toBeUndefined();
    expect(normalizeThinkingConfig({})).toBeUndefined();

    expect(normalizeThinkingConfig({ thinkingBudget: 2048 })).toEqual({
      thinkingBudget: 2048,
      includeThoughts: true,
    });
    expect(normalizeThinkingConfig({ thinkingBudget: 0 })).toEqual({
      thinkingBudget: 0,
      includeThoughts: false,
    });

    expect(normalizeThinkingConfig({ thinking_budget: 1024, include_thoughts: true })).toEqual({
      thinkingBudget: 1024,
      includeThoughts: true,
    });

    expect(normalizeThinkingConfig({ thinkingLevel: "HIGH" })).toEqual({
      thinkingBudget: 2048,
      includeThoughts: true,
    });
    expect(normalizeThinkingConfig({ thinkingLevel: "MEDIUM" })).toEqual({
      thinkingBudget: 1024,
      includeThoughts: true,
    });
    expect(normalizeThinkingConfig({ thinkingLevel: "LOW" })).toEqual({
      thinkingBudget: 512,
      includeThoughts: true,
    });
    expect(normalizeThinkingConfig({ thinkingLevel: "MINIMAL" })).toEqual({
      thinkingBudget: 0,
      includeThoughts: false,
    });
    expect(normalizeThinkingConfig({ thinkingLevel: "UNKNOWN" })).toEqual({
      thinkingBudget: 1024,
      includeThoughts: true,
    });
    expect(normalizeThinkingConfig({ thinkingLevel: 1 })).toEqual({
      thinkingBudget: 512,
      includeThoughts: true,
    });
    expect(normalizeThinkingConfig({ thinkingLevel: 2 })).toEqual({
      thinkingBudget: 1024,
      includeThoughts: true,
    });
    expect(normalizeThinkingConfig({ thinkingLevel: 3 })).toEqual({
      thinkingBudget: 2048,
      includeThoughts: true,
    });
    expect(normalizeThinkingConfig({ thinkingLevel: 4 })).toEqual({
      thinkingBudget: 0,
      includeThoughts: false,
    });
    expect(normalizeThinkingConfig({ thinkingLevel: 5 })).toEqual({
      thinkingBudget: 2048,
      includeThoughts: true,
    });
    expect(normalizeThinkingConfig({ thinkingLevel: 0 })).toBeUndefined();

    expect(normalizeThinkingConfig({ thinkingBudget: 2048, includeThoughts: false })).toEqual({
      thinkingBudget: 2048,
      includeThoughts: false,
    });
  });
});

describe("src/sdk/request-helpers/parsing", () => {
  it("parses valid and invalid JSON for gemini bodies", () => {
    expect(parseGeminiApiBody("invalid json")).toBeNull();
    expect(parseGeminiApiBody('{"candidates": []}')).toEqual({ candidates: [] });
    expect(parseGeminiApiBody('[{"candidates": []}, null]')).toEqual({ candidates: [] });
    expect(parseGeminiApiBody("[]")).toBeNull();
    expect(parseGeminiApiBody("123")).toBeNull();
  });

  it("extracts usage metadata correctly", () => {
    expect(extractUsageMetadata({} as any)).toBeNull();
    expect(
      extractUsageMetadata({
        response: {
          usageMetadata: {
            totalTokenCount: 100,
            promptTokenCount: 60,
            candidatesTokenCount: 40,
            cachedContentTokenCount: 0,
          },
        },
      }),
    ).toEqual({
      totalTokenCount: 100,
      promptTokenCount: 60,
      candidatesTokenCount: 40,
      cachedContentTokenCount: 0,
    });
  });
});

describe("src/sdk/request-helpers/errors", () => {
  it("rewrites preview access error for gemini 3 models on 404", () => {
    const non404 = rewriteGeminiPreviewAccessError({ error: { message: "Not found" } }, 500, "gemini-3.7-flash");
    expect(non404).toBeNull();

    const nonGemini3 = rewriteGeminiPreviewAccessError({ error: { message: "Not found" } }, 404, "gemini-2.5-flash");
    expect(nonGemini3).toBeNull();

    const rewritten = rewriteGeminiPreviewAccessError({ error: { message: "Model missing" } }, 404, "gemini-3.7-flash");
    expect(rewritten).not.toBeNull();
    expect(rewritten?.error?.message).toContain("preview access");

    const rewrittenFromMsg = rewriteGeminiPreviewAccessError({ error: { message: "gemini-3 model error" } }, 404);
    expect(rewrittenFromMsg).not.toBeNull();
  });

  it("enhances 403 validation errors and 429 quota errors", () => {
    expect(enhanceGeminiErrorResponse({}, 200)).toBeNull();

    // 403 with validation required
    const enhanced403 = enhanceGeminiErrorResponse(
      {
        error: {
          message: "Permission denied",
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.ErrorInfo",
              reason: "VALIDATION_REQUIRED",
              domain: "daily-cloudcode-pa.googleapis.com",
              metadata: {
                validation_link: "https://cloud.google.com/validate",
              },
            },
            {
              "@type": "type.googleapis.com/google.rpc.Help",
              links: [{ url: "https://support.google.com/article", description: "learn more" }],
            },
          ],
        },
      },
      403,
    );
    expect(enhanced403?.body?.error?.message).toContain("Complete validation:");

    // 429 rate limit exceeded
    const enhanced429 = enhanceGeminiErrorResponse(
      {
        error: {
          message: "Rate limit exceeded. Please retry in 2.5s",
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.ErrorInfo",
              reason: "RATE_LIMIT_EXCEEDED",
            },
            {
              "@type": "type.googleapis.com/google.rpc.RetryInfo",
              retryDelay: "2.5s",
            },
          ],
        },
      },
      429,
    );
    expect(enhanced429?.retryAfterMs).toBe(2500);
    expect(enhanced429?.body?.error?.message).toContain("Rate limit exceeded");

    // 429 quota exhausted
    const enhancedQuotaExhausted = enhanceGeminiErrorResponse(
      {
        error: {
          message: "Quota reached",
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.ErrorInfo",
              reason: "QUOTA_EXHAUSTED",
            },
          ],
        },
      },
      429,
    );
    expect(enhancedQuotaExhausted?.body?.error?.message).toContain("Quota exhausted for this account");

    // 429 violations daily check
    const enhancedDailyViolation = enhanceGeminiErrorResponse(
      {
        error: {
          message: "Quota reached",
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.QuotaFailure",
              violations: [{ description: "Daily limit exceeded" }],
            },
          ],
        },
      },
      429,
    );
    expect(enhancedDailyViolation?.body?.error?.message).toContain("Quota exhausted for this account");
  });
});
