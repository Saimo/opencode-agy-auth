import { afterEach, describe, expect, it, vi } from "vitest";
import { AGY_PROVIDER_ID } from "../../src/constants";
import {
  createV2HttpRequestHook,
  createV2HttpResponseHook,
  createV2RetryHook,
  registerV2SessionHooks,
} from "../../src/plugin/v2-session";
import { setStoredAuthOverrideForTesting } from "../../src/plugin/v2-storage";
import type {
  OpenCodeV2SessionHttpRequest,
  OpenCodeV2SessionHttpResponse,
  OpenCodeV2SessionRetry,
} from "../../src/plugin/types";

describe("OpenCode v2 session hooks", () => {
  afterEach(() => {
    setStoredAuthOverrideForTesting(undefined);
    vi.restoreAllMocks();
  });

  it("registers http.request, http.response, and retry hooks scoped to google-agy", async () => {
    const hooks: Record<string, Function> = {};
    const mockCtx = {
      session: {
        hook: vi.fn(async (event: string, handler: Function) => {
          hooks[event] = handler;
        }),
      },
      integration: {
        transform: vi.fn(async () => {}),
      },
    };

    await registerV2SessionHooks(mockCtx);

    expect(mockCtx.session.hook).toHaveBeenCalledWith("http.request", expect.any(Function), {
      providerID: AGY_PROVIDER_ID,
    });
    expect(mockCtx.session.hook).toHaveBeenCalledWith("http.response", expect.any(Function), {
      providerID: AGY_PROVIDER_ID,
    });
    expect(mockCtx.session.hook).toHaveBeenCalledWith("retry", expect.any(Function), {
      providerID: AGY_PROVIDER_ID,
    });
    expect(typeof hooks["http.request"]).toBe("function");
    expect(typeof hooks["http.response"]).toBe("function");
    expect(typeof hooks["retry"]).toBe("function");
  });

  describe("http.request hook", () => {
    it("ignores non-google requests", async () => {
      const hook = createV2HttpRequestHook();
      const request = new Request("https://api.openai.com/v1/chat/completions", {
        headers: { "x-api-key": "secret" },
      });
      const event: OpenCodeV2SessionHttpRequest = {
        sessionID: "ses_1",
        providerID: AGY_PROVIDER_ID,
        model: { id: "gpt-4o", providerID: AGY_PROVIDER_ID },
        attempt: 1,
        request,
      };

      await hook(event);

      expect(event.request).toBe(request);
      expect(event.request.headers.get("x-api-key")).toBe("secret");
    });

    it("rewrites Generative Language requests to Code Assist with active OAuth credential and variant tier", async () => {
      const tracked = new WeakMap();
      const hook = createV2HttpRequestHook(tracked, {
        integration: {
          transform: vi.fn(async () => {}),
          connection: {
            active: vi.fn(async () => ({ id: "conn_active" })),
            resolve: vi.fn(async () => ({
              type: "credential" as const,
              credential: {
                type: "oauth" as const,
                methodID: "oauth",
                access: "live-access-token",
                refresh: "live-refresh|proj-123|managed-proj-123",
                expires: Date.now() + 3600_000,
              },
            })),
          },
        },
      });

      const request = new Request(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-4-hydrogen:streamGenerateContent?alt=sse&key=dummy",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "user-agent": "opencode/2.0.0",
            "x-goog-api-key": "opencode-dummy-key",
            "x-opencode-session": "ses_abc",
            "x-opencode-request": "req_1",
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "hello" }] }],
            tools: [
              {
                functionDeclarations: [
                  {
                    name: "read_file",
                    description: "Read file",
                    parametersJsonSchema: {
                      type: "object",
                      properties: { path: { type: "string" } },
                      required: ["path"],
                    },
                  },
                ],
              },
            ],
          }),
        },
      );

      const event: OpenCodeV2SessionHttpRequest = {
        sessionID: "ses_abc",
        providerID: AGY_PROVIDER_ID,
        model: { id: "gemini-4-hydrogen", providerID: AGY_PROVIDER_ID, variant: "xhigh" },
        attempt: 1,
        request,
      };

      await hook(event);

      expect(event.request.url).toBe(
        "https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse",
      );
      expect(event.request.headers.get("authorization")).toBe("Bearer live-access-token");
      expect(event.request.headers.get("x-goog-api-key")).toBeNull();
      expect(event.request.headers.get("x-agy-tier")).toBeNull();
      expect(event.request.headers.get("x-opencode-session")).toBeNull();
      expect(event.request.headers.get("user-agent")).toContain("antigravity/cli/");

      const body = JSON.parse(await event.request.clone().text());
      expect(body.project).toBe("proj-123");
      expect(body.model).toBe("gemini-4-hydrogen-xhigh");
      expect(body.request.session_id).toBe("ses_abc");
      expect(body.request.tools[0].functionDeclarations[0].parameters).toBeDefined();
      expect(body.request.tools[0].functionDeclarations[0].parametersJsonSchema).toBeUndefined();
    });

    it("strips sensitive headers and sets CLI User-Agent even when unauthenticated", async () => {
      setStoredAuthOverrideForTesting(null);
      const hook = createV2HttpRequestHook();
      const request = new Request(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=secret",
        {
          method: "POST",
          headers: {
            "x-goog-api-key": "dummy",
            "user-agent": "opencode/2.0.0",
          },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "hi" }] }] }),
        },
      );

      const event: OpenCodeV2SessionHttpRequest = {
        sessionID: "ses_unauth",
        providerID: AGY_PROVIDER_ID,
        model: { id: "gemini-3.8-flash", providerID: AGY_PROVIDER_ID },
        attempt: 1,
        request,
      };

      await hook(event);

      expect(event.request.url).not.toContain("key=");
      expect(event.request.headers.get("x-goog-api-key")).toBeNull();
      expect(event.request.headers.get("user-agent")).toContain("antigravity/cli/");
    });
  });

  describe("http.response hook", () => {
    it("passes through non-code-assist responses untouched", async () => {
      const hook = createV2HttpResponseHook();
      const request = new Request("https://api.openai.com/v1/chat/completions");
      const response = new Response("ok", { status: 200 });
      const event: OpenCodeV2SessionHttpResponse = {
        sessionID: "ses_1",
        providerID: AGY_PROVIDER_ID,
        model: { id: "gpt-4o", providerID: AGY_PROVIDER_ID },
        attempt: 1,
        request,
        response,
        duration: 15,
      };

      await hook(event);
      expect(event.response).toBe(response);
    });

    it("isolates concurrent sessions via WeakMap<Request, TrackedRequestMeta> and unwraps SSE responses", async () => {
      setStoredAuthOverrideForTesting({
        type: "oauth",
        access: "tok",
        refresh: "ref|proj-a|mproj-a",
        expires: Date.now() + 3600_000,
      });

      const tracked = new WeakMap();
      const reqHook = createV2HttpRequestHook(tracked);
      const resHook = createV2HttpResponseHook(tracked);

      const eventA: OpenCodeV2SessionHttpRequest = {
        sessionID: "session-A",
        providerID: AGY_PROVIDER_ID,
        model: { id: "gemini-3.8-flash", providerID: AGY_PROVIDER_ID },
        attempt: 1,
        request: new Request(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "from A" }] }] }),
          },
        ),
      };

      const eventB: OpenCodeV2SessionHttpRequest = {
        sessionID: "session-B",
        providerID: AGY_PROVIDER_ID,
        model: { id: "gemini-4-argon", providerID: AGY_PROVIDER_ID },
        attempt: 1,
        request: new Request(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-4-argon:generateContent",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "from B" }] }] }),
          },
        ),
      };

      await Promise.all([reqHook(eventA), reqHook(eventB)]);

      const sseBody =
        'data: {"response":{"candidates":[{"content":{"parts":[{"thought":true,"text":"step 1"}]}}]}}\n\n' +
        'data: {"response":{"candidates":[{"content":{"parts":[{"thought":true,"text":"step 1","thoughtSignature":"sig-final"},{"text":"Answer A"}]}}]}}\n\n';

      const resEventA: OpenCodeV2SessionHttpResponse = {
        sessionID: "session-A",
        providerID: AGY_PROVIDER_ID,
        model: { id: "gemini-3.8-flash", providerID: AGY_PROVIDER_ID },
        attempt: 1,
        request: eventA.request,
        response: new Response(sseBody, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
        duration: 42,
      };

      await resHook(resEventA);
      const textA = await resEventA.response.text();
      expect(textA).toContain("step 1");
      expect(textA).toContain("sig-final");
      expect(textA).toContain("Answer A");
    });
  });

  describe("retry hook", () => {
    it("marks terminal QUOTA_EXHAUSTED 429 as { retry: false }", async () => {
      const hook = createV2RetryHook();
      const event: OpenCodeV2SessionRetry = {
        sessionID: "ses_1",
        providerID: AGY_PROVIDER_ID,
        model: { id: "gemini-3.8-flash", providerID: AGY_PROVIDER_ID },
        attempt: 1,
        error: {
          message: "Quota exhausted",
          status: 429,
          retryable: true,
          response: {
            status: 429,
            body: JSON.stringify({
              error: {
                details: [
                  {
                    "@type": "type.googleapis.com/google.rpc.ErrorInfo",
                    domain: "daily-cloudcode-pa.googleapis.com",
                    reason: "QUOTA_EXHAUSTED",
                  },
                ],
              },
            }),
          },
        },
        decision: { retry: true, delay: 2000 },
      };

      await hook(event);
      expect(event.decision).toEqual({ retry: false });
    });

    it("schedules retry with server RetryInfo delay on RATE_LIMIT_EXCEEDED 429", async () => {
      const hook = createV2RetryHook();
      const event: OpenCodeV2SessionRetry = {
        sessionID: "ses_1",
        providerID: AGY_PROVIDER_ID,
        model: { id: "gemini-3.8-flash", providerID: AGY_PROVIDER_ID },
        attempt: 1,
        error: {
          message: "Rate limit exceeded",
          status: 429,
          retryable: true,
          response: {
            status: 429,
            body: JSON.stringify({
              error: {
                details: [
                  {
                    "@type": "type.googleapis.com/google.rpc.ErrorInfo",
                    domain: "daily-cloudcode-pa.googleapis.com",
                    reason: "RATE_LIMIT_EXCEEDED",
                  },
                  {
                    "@type": "type.googleapis.com/google.rpc.RetryInfo",
                    retryDelay: "3.5s",
                  },
                ],
              },
            }),
          },
        },
        decision: { retry: true, delay: 2000 },
      };

      await hook(event);
      expect(event.decision).toEqual({ retry: true, delay: 3500 });
    });

    it("sets retry decision with backoff for 5xx responses and transient socket disconnects", async () => {
      const hook = createV2RetryHook();

      const event502: OpenCodeV2SessionRetry = {
        sessionID: "ses_1",
        providerID: AGY_PROVIDER_ID,
        model: { id: "gemini-3.8-flash", providerID: AGY_PROVIDER_ID },
        attempt: 1,
        error: {
          message: "Bad Gateway",
          status: 502,
          retryable: true,
          retryAfterMs: 4200,
        },
        decision: { retry: false },
      };
      await hook(event502);
      expect(event502.decision).toEqual({ retry: true, delay: 4200 });

      const eventNet: OpenCodeV2SessionRetry = {
        sessionID: "ses_1",
        providerID: AGY_PROVIDER_ID,
        model: { id: "gemini-3.8-flash", providerID: AGY_PROVIDER_ID },
        attempt: 1,
        error: {
          message: "http2: client connection lost",
          retryable: false,
        },
        decision: { retry: false },
      };
      await hook(eventNet);
      expect(eventNet.decision.retry).toBe(true);
      if (eventNet.decision.retry) {
        expect(eventNet.decision.delay).toBeGreaterThan(0);
      }
    });

    it("preserves decision for non-retryable 400 client errors", async () => {
      const hook = createV2RetryHook();
      const event: OpenCodeV2SessionRetry = {
        sessionID: "ses_1",
        providerID: AGY_PROVIDER_ID,
        model: { id: "gemini-3.8-flash", providerID: AGY_PROVIDER_ID },
        attempt: 1,
        error: {
          message: "Invalid argument",
          status: 400,
          retryable: false,
        },
        decision: { retry: false },
      };

      await hook(event);
      expect(event.decision).toEqual({ retry: false });
    });
  });
});
