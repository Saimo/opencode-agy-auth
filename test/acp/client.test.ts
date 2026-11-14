import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AcpClientPool,
  AcpConnection,
  buildAgyAcpArgs,
  buildSanitizedAgyEnv,
  cleanupSessionDbFiles,
  resolveAgyBinaryPath,
  resolveSessionDbPath,
  validateRelativeAppDataDir,
} from "../../src/acp/client";

const MOCK_AGY_PATH = resolve(__dirname, "../fixtures/mock-agy-acp.mjs");

describe("acp/client", () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "agy-client-test-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const d of tempDirs.splice(0, tempDirs.length)) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("validates relative --app-data-dir names and rejects absolute or traversal paths", () => {
    expect(validateRelativeAppDataDir("antigravity-acp")).toBe("antigravity-acp");
    expect(validateRelativeAppDataDir("  custom-profile  ")).toBe("custom-profile");

    expect(() => validateRelativeAppDataDir("")).toThrow(/Invalid Antigravity --app-data-dir/);
    expect(() => validateRelativeAppDataDir(".")).toThrow(/Invalid Antigravity --app-data-dir/);
    expect(() => validateRelativeAppDataDir("..")).toThrow(/Invalid Antigravity --app-data-dir/);
    expect(() => validateRelativeAppDataDir("/tmp/abs")).toThrow(/Invalid Antigravity --app-data-dir/);
    expect(() => validateRelativeAppDataDir("nested/dir")).toThrow(/Invalid Antigravity --app-data-dir/);
    expect(() => validateRelativeAppDataDir("C:\\Users\\foo")).toThrow(
      /Invalid Antigravity --app-data-dir/,
    );
  });

  it("resolves agy binary from symlink shims without calling realpath()", () => {
    const dir = makeTempDir();
    const realBinDir = join(dir, "real");
    const shimDir = join(dir, "shims");
    mkdirSync(realBinDir, { recursive: true });
    mkdirSync(shimDir, { recursive: true });

    const realTarget = join(realBinDir, "agy-real-1.5.8");
    writeFileSync(realTarget, "#!/usr/bin/env sh\nexit 0\n", "utf8");
    chmodSync(realTarget, 0o755);

    const shimPath = join(shimDir, "agy");
    symlinkSync(realTarget, shimPath);

    const resolvedFromPath = resolveAgyBinaryPath({
      env: { PATH: shimDir },
    });
    // Must preserve the shim path (argv[0]) rather than resolving symlink to `agy-real-1.5.8`
    expect(resolvedFromPath).toBe(shimPath);

    const missing = resolveAgyBinaryPath({
      binaryPath: join(dir, "does-not-exist"),
      env: { PATH: "" },
    });
    expect(missing).toBeUndefined();
  });

  it("sanitizes ambient Google/Gemini env vars while preserving explicit ADC and project overrides", () => {
    const dirtyEnv: NodeJS.ProcessEnv = {
      PATH: "/usr/bin",
      GEMINI_API_KEY: "secret-1",
      GOOGLE_API_KEY: "secret-2",
      GOOGLE_CLOUD_PROJECT: "wrong-ambient-project",
      GOOGLE_CLOUD_PROJECT_ID: "wrong-ambient-id",
      GOOGLE_CLOUD_LOCATION: "us-central1",
      GEMINI_HOME: "/wrong/home",
      AGY_ACP_CCPA_PROJECT: "wrong-ccpa",
      ANTIGRAVITY_HARNESS_PATH: "/wrong/harness",
      ELECTRON_RUN_AS_NODE: "1",
    };

    const sanitizedDefault = buildSanitizedAgyEnv({ env: dirtyEnv });
    expect(sanitizedDefault.GEMINI_API_KEY).toBeUndefined();
    expect(sanitizedDefault.GOOGLE_API_KEY).toBeUndefined();
    expect(sanitizedDefault.GOOGLE_CLOUD_PROJECT).toBeUndefined();
    expect(sanitizedDefault.GOOGLE_CLOUD_PROJECT_ID).toBeUndefined();
    expect(sanitizedDefault.GOOGLE_CLOUD_LOCATION).toBeUndefined();
    expect(sanitizedDefault.GEMINI_HOME).toBeUndefined();
    expect(sanitizedDefault.AGY_ACP_CCPA_PROJECT).toBeUndefined();
    expect(sanitizedDefault.ANTIGRAVITY_HARNESS_PATH).toBeUndefined();
    expect(sanitizedDefault.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(sanitizedDefault.AGY_CLI_AUTO_COMPACT_OVERRIDE).toBe("off");

    const sanitizedAdc = buildSanitizedAgyEnv({
      env: dirtyEnv,
      adcAuth: true,
      projectId: "enterprise-proj-123",
    });
    expect(sanitizedAdc.AGY_ADC_AUTH).toBe("true");
    expect(sanitizedAdc.GOOGLE_CLOUD_LOCATION).toBe("us-central1");
    expect(sanitizedAdc.GOOGLE_CLOUD_PROJECT).toBe("enterprise-proj-123");
    expect(sanitizedAdc.AGY_ACP_CCPA_PROJECT).toBe("enterprise-proj-123");
  });

  it("builds expected agy acp CLI flags", () => {
    expect(buildAgyAcpArgs()).toEqual(["acp", "--disable-telemetry"]);
    expect(
      buildAgyAcpArgs({
        geminiDir: "/tmp/iso",
        includeDefaultCustomizations: false,
      }),
    ).toEqual([
      "acp",
      "--disable-telemetry",
      "--include-default-customizations=false",
      "--gemini-dir",
      "/tmp/iso",
      "--app-data-dir",
      "antigravity-acp",
    ]);
  });

  it("pools ACP workers, replaces crashed workers, cancels pending permissions, and cleans up .db files", async () => {
    const geminiDir = makeTempDir();
    const pool = new AcpClientPool({ idleTimeoutMs: 60_000 });

    try {
      const lease1 = await pool.acquire({
        binaryPath: MOCK_AGY_PATH,
        geminiDir,
        env: {
          ...process.env,
          GEMINI_API_KEY: "must-be-stripped",
        },
      });
      const pid1 = lease1.connection.pid;
      expect(pid1).toBeDefined();

      const setup = await lease1.connection.createSession({
        cwd: geminiDir,
        mcpServers: [],
        _meta: { disableBuiltInTools: true },
      });

      let echoedEnvText = "";
      const unsub = lease1.connection.onSessionUpdate(setup.sessionId, (n) => {
        if (n.update.sessionUpdate === "agent_message_chunk" && n.update.content.type === "text") {
          echoedEnvText += n.update.content.text;
        }
      });

      await lease1.connection.prompt({
        sessionId: setup.sessionId,
        prompt: [{ type: "text", text: "[SCENARIO:echo_env]" }],
      });
      unsub();

      const parsedEnv = JSON.parse(echoedEnvText);
      expect(parsedEnv.GEMINI_API_KEY).toBeNull();
      expect(parsedEnv.AGY_CLI_AUTO_COMPACT_OVERRIDE).toBe("off");

      // Verify `.db` + `-wal`/`-shm` cleanup helper
      const dbPath = resolveSessionDbPath(setup.sessionId, { geminiDir });
      expect(existsSync(dbPath)).toBe(true);
      writeFileSync(`${dbPath}-wal`, "wal", "utf8");
      writeFileSync(`${dbPath}-shm`, "shm", "utf8");
      cleanupSessionDbFiles(setup.sessionId, { geminiDir });
      expect(existsSync(dbPath)).toBe(false);
      expect(existsSync(`${dbPath}-wal`)).toBe(false);
      expect(existsSync(`${dbPath}-shm`)).toBe(false);

      lease1.release();

      // Re-acquiring with identical config reuses the live worker PID
      const lease2 = await pool.acquire({
        binaryPath: MOCK_AGY_PATH,
        geminiDir,
        env: {
          ...process.env,
          GEMINI_API_KEY: "must-be-stripped",
        },
      });
      expect(lease2.connection.pid).toBe(pid1);

      // Simulate worker crash and verify pool spawns a replacement worker (#36181)
      await lease2.connection.close();
      lease2.release();

      const lease3 = await pool.acquire({
        binaryPath: MOCK_AGY_PATH,
        geminiDir,
        env: {
          ...process.env,
          GEMINI_API_KEY: "must-be-stripped",
        },
      });
      expect(lease3.connection.pid).not.toBe(pid1);
      lease3.release();
    } finally {
      await pool.dispose();
    }
  });

  it("cancels hanging permission handlers immediately on cancelSession()", async () => {
    const geminiDir = makeTempDir();
    const conn = new AcpConnection(
      MOCK_AGY_PATH,
      buildAgyAcpArgs({ geminiDir }),
      { geminiDir },
    );

    try {
      await conn.initialize();
      const setup = await conn.createSession({
        cwd: geminiDir,
        mcpServers: [],
        _meta: { disableBuiltInTools: false },
      });

      let permStarted = false;
      conn.setPermissionHandler(setup.sessionId, async () => {
        permStarted = true;
        // Hang forever unless cancelled by cancelSession()
        return await new Promise(() => {});
      });

      const promptPromise = conn.prompt({
        sessionId: setup.sessionId,
        prompt: [{ type: "text", text: "[SCENARIO:hybrid_native_tools]" }],
      });

      while (!permStarted) {
        await new Promise((r) => setTimeout(r, 10));
      }

      conn.cancelSession(setup.sessionId);
      const res = await promptPromise;
      expect(res.stopReason).toBe("end_turn");
    } finally {
      await conn.close();
    }
  });

  it("honors OPENCODE_AGY_GEMINI_DIR in args/paths and isolates pooled workers when env auth settings differ", async () => {
    const geminiDir = makeTempDir();
    const envWithGeminiDir = {
      ...process.env,
      OPENCODE_AGY_GEMINI_DIR: geminiDir,
    };

    expect(buildAgyAcpArgs({ env: envWithGeminiDir })).toEqual([
      "acp",
      "--disable-telemetry",
      "--gemini-dir",
      geminiDir,
      "--app-data-dir",
      "antigravity-acp",
    ]);

    const pool = new AcpClientPool({ idleTimeoutMs: 60_000 });
    try {
      const defaultLease = await pool.acquire({
        binaryPath: MOCK_AGY_PATH,
        geminiDir,
        env: { ...process.env },
      });
      const adcEnvLease = await pool.acquire({
        binaryPath: MOCK_AGY_PATH,
        geminiDir,
        env: { ...process.env, AGY_ADC_AUTH: "true" },
      });
      const projectEnvLease = await pool.acquire({
        binaryPath: MOCK_AGY_PATH,
        geminiDir,
        env: { ...process.env, OPENCODE_AGY_PROJECT_ID: "custom-gcp-proj" },
      });

      expect(adcEnvLease.connection.pid).not.toBe(defaultLease.connection.pid);
      expect(projectEnvLease.connection.pid).not.toBe(defaultLease.connection.pid);
      expect(projectEnvLease.connection.pid).not.toBe(adcEnvLease.connection.pid);

      defaultLease.release();
      adcEnvLease.release();
      projectEnvLease.release();
    } finally {
      await pool.dispose();
    }
  });
});
