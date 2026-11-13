import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadManagedProject, onboardManagedProject } from "../src/sdk/fetch_project";
import { authorizeAgy, exchangeAgyWithVerifier } from "../src/sdk/oauth";
import * as fetchModule from "../src/fetch";
import { ProjectAccessDeniedError, ProjectIdRequiredError } from "../src/plugin/project/types";

describe("sdk/fetch_project and oauth", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("fetch_project", () => {
    it("loads managed project successfully", async () => {
      vi.spyOn(fetchModule, "agyFetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            cloudaicompanionProject: "managed-proj-123",
          }),
          { status: 200 },
        ),
      );

      const res = await loadManagedProject("fake-token", "user-proj");
      expect(res?.cloudaicompanionProject).toBe("managed-proj-123");
    });

    it("throws ProjectAccessDeniedError on 403 / 404 response", async () => {
      vi.spyOn(fetchModule, "agyFetch").mockResolvedValue(
        new Response("VPC-SC blocked request", { status: 403, statusText: "Forbidden" }),
      );

      await expect(loadManagedProject("fake-token", "blocked-proj")).rejects.toThrow(
        ProjectAccessDeniedError,
      );
    });

    it("returns null on 500 error", async () => {
      vi.spyOn(fetchModule, "agyFetch").mockRejectedValue(new Error("500 Server Error"));

      const res = await loadManagedProject("fake-token", "proj");
      expect(res).toBeNull();
    });

    it("onboards managed project with immediate completion", async () => {
      vi.spyOn(fetchModule, "agyFetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            done: true,
            response: {
              cloudaicompanionProject: { id: "onboarded-id" },
            },
          }),
          { status: 200 },
        ),
      );

      const id = await onboardManagedProject("fake-token", "free-tier", "proj-1");
      expect(id).toBe("onboarded-id");
    });

    it("onboards managed project with polling operation", async () => {
      let callCount = 0;
      vi.spyOn(fetchModule, "agyFetch").mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return new Response(
            JSON.stringify({
              done: false,
              name: "operations/123",
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            done: true,
            response: {
              cloudaicompanionProject: { id: "polled-id" },
            },
          }),
          { status: 200 },
        );
      });

      const id = await onboardManagedProject("fake-token", "free-tier", "proj-1", undefined, 2, 1);
      expect(id).toBe("polled-id");
    });

    it("throws ProjectIdRequiredError if not free tier and no project id", async () => {
      await expect(onboardManagedProject("fake-token", "paid-tier", undefined)).rejects.toThrow(
        ProjectIdRequiredError,
      );
    });
  });

  describe("oauth", () => {
    it("generates authorize URL with S256 PKCE and state", async () => {
      const auth = await authorizeAgy();
      expect(auth.url).toContain("accounts.google.com");
      expect(auth.url).toContain("code_challenge=");
      expect(auth.url).toContain("code_challenge_method=S256");
      expect(auth.verifier).toBeDefined();
      expect(auth.state).toBeDefined();
    });

    it("exchanges code for tokens successfully with integer expires", async () => {
      vi.spyOn(fetchModule, "agyFetch").mockImplementation(async (url) => {
        if (String(url).includes("oauth2.googleapis.com/token")) {
          return new Response(
            JSON.stringify({
              access_token: "<placeholder-access-token>",
              expires_in: 3600,
              refresh_token: "<placeholder-refresh-token>",
            }),
            { status: 200 },
          );
        }
        if (String(url).includes("googleapis.com/oauth2/v1/userinfo")) {
          return new Response(
            JSON.stringify({
              email: "test@example.com",
            }),
            { status: 200 },
          );
        }
        return new Response("Not found", { status: 404 });
      });

      const res = await exchangeAgyWithVerifier("test-code", "test-verifier");
      expect(res.type).toBe("success");
      if (res.type === "success") {
        expect(res.access).toBe("<placeholder-access-token>");
        expect(res.refresh).toBe("<placeholder-refresh-token>");
        expect(res.email).toBe("test@example.com");
        expect(Number.isInteger(res.expires)).toBe(true);
      }
    });

    it("returns failure when token exchange fails", async () => {
      vi.spyOn(fetchModule, "agyFetch").mockResolvedValue(
        new Response("invalid_grant", { status: 400 }),
      );

      const res = await exchangeAgyWithVerifier("bad-code", "bad-verifier");
      expect(res.type).toBe("failed");
      if (res.type === "failed") {
        expect(res.error).toBe("invalid_grant");
      }
    });

    it("returns failure when refresh token is missing", async () => {
      vi.spyOn(fetchModule, "agyFetch").mockImplementation(async (url) => {
        if (String(url).includes("oauth2.googleapis.com/token")) {
          return new Response(
            JSON.stringify({
              access_token: "<placeholder-access-token>",
              expires_in: 3600,
            }),
            { status: 200 },
          );
        }
        if (String(url).includes("googleapis.com/oauth2/v1/userinfo")) {
          return new Response(JSON.stringify({ email: "test@example.com" }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      });

      const res = await exchangeAgyWithVerifier("code", "verifier");
      expect(res.type).toBe("failed");
      if (res.type === "failed") {
        expect(res.error).toContain("Missing refresh token");
      }
    });
  });
});
