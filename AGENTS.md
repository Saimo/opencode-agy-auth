# AGENTS.md

## Scope

`opencode-agy-auth` is a pure **OpenCode v2** provider & grounded web search plugin (`id: "google-agy"`) built strictly on top of the sanctioned **`agy acp`** (Agent Client Protocol v1 over stdio JSON-RPC 2.0) interface.

Keep this repository strictly scoped to the provider:
- **Always route through `agy acp`** — never call Google internal HTTP endpoints directly or embed OAuth client secrets.
- **Zero extra tools or slash commands** — never register `ctx.tool` or `ctx.command` extensions.
- **Zero telemetry / background pings / `models.dev` fetches / UI toasts / chat log files**.
- **Zero runtime `dependencies`**, with `dist/index.js` and `dist/index.d.ts` built so `"plugins": ["github:Saimo/opencode-agy-auth"]` works out-of-the-box under OpenCode v2's `Arborist({ ignoreScripts: true })` installer.
- **XDG cache persistence only** (`src/sdk/cache-dir.ts` -> `~/.cache/opencode` on Linux/macOS, `%LOCALAPPDATA%\opencode` on Windows). Never write transient caches into `~/.config/opencode` or mutate `.gitignore`.

## Architecture

- `index.ts`: Default-exports the OpenCode v2 plugin definition (`{ id: "google-agy", setup: setupOpenCodeV2 }`).
- `src/plugin/v2.ts`: Registers:
  1. `ctx.integration.transform` (`src/acp/auth.ts`) — `agy acp --login` `command` method + `~/.gemini` `external` method with live `initialize` + `session/new` readiness probing.
  2. `ctx.provider.transform` (`src/acp/catalog.ts`) — `google-agy` provider (`package: "aisdk:@opencode-agy/acp"`) and live-discovered `agy` models + per-model `thought_level` variants (with `STATIC_MODELS_SIMPLE` cold-start fallback).
  3. `ctx.aisdk.hook("sdk")` (`src/acp/language-model.ts`) — custom `@ai-sdk/provider` v3 `LanguageModelV3` transport (`@opencode-agy/acp`).
  4. `ctx.session.hook` (`model.request`, `context`, `generate`, `compaction`, `retry`) — stateful `session/resume` delta prompts, fork/rewind `<conversation-checkpoint>`, stateless auxiliary call `.db` cleanup, and `429`/`5xx` retry classification.
  5. `ctx.websearch.transform` (`src/plugin/v2-websearch.ts`) — opt-out grounded web search via stateless `agy acp` sessions permitting only `search_web`.
- `src/acp/`:
  - `client.ts`: Pooled `agy acp` stdio JSON-RPC 2.0 client, env sanitization, process-group cleanup, and `.db` path helpers.
  - `mcp-bridge.ts`: Ephemeral localhost `opencode` MCP bridge implementing Pause-and-Yield (`providerExecuted: false`), `toolSummary` stripping, and multimodal tool result forwarding.
  - `sessions.ts`: Stateful/stateless ACP session lifecycle, `"opencode"` & `"hybrid"` tool modes, Claude thinking signature recovery, and inactivity watchdog.
  - `turn-outcome.ts`: Read-only `node:sqlite` / `bun:sqlite` `<sessionId>.db` inspector (`step_type = 17` upstream status/quota extractor).

## Verification

```bash
npm run typecheck
npm test
npm run build
npm run smoke:node-import
```
