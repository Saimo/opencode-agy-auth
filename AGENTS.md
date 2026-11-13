# AGENTS.md

## Scope

`opencode-agy-auth` is a pure **OpenCode v2** provider plugin (`id: "google-agy"`).

Keep this repository strictly scoped to the provider:
- **Zero extra tools or slash commands** — never register `ctx.tool` or `ctx.command` extensions.
- **Zero telemetry / background pings / `models.dev` fetches / UI toasts / chat log files**.
- **Zero runtime `dependencies`**, with `dist/index.js` and `dist/index.d.ts` committed so `"plugin": ["github:Saimo/opencode-agy-auth"]` works out-of-the-box under OpenCode v2's `Arborist({ ignoreScripts: true })` installer.
- **XDG cache persistence only** (`src/sdk/cache-dir.ts` -> `~/.cache/opencode` on Linux/macOS, `%LOCALAPPDATA%\opencode` on Windows). Never write transient caches into `~/.config/opencode` or mutate `.gitignore`.

## Architecture

- `index.ts`: Default-exports the OpenCode v2 plugin definition (`{ id: "google-agy", setup: setupOpenCodeV2 }`).
- `src/plugin/v2.ts`: Registers:
  1. `ctx.integration.transform` — OAuth code + PKCE (`S256`) `authorize` flow, native `refresh(credential)`, and email `label(credential)`.
  2. `ctx.provider.transform` — `google-agy` provider (`package: "@opencode/ai/providers/google"`, `activation: "auto"`, `integrationID: "google-agy"`) and static models/variants.
  3. `ctx.session.hook` via `src/plugin/v2-session.ts` — `http.request`, `http.response`, and `retry` hooks scoped to `{ providerID: "google-agy" }`.
- `src/sdk/`: Google OAuth PKCE (`node:crypto`), Cloud Code Assist project onboarding, Gemini/Claude/GPT request & SSE response translation, tool schema sanitization, multi-turn thinking signature caching, and retry/quota classification.

## Verification

```bash
npm run typecheck
npm test
npm run build
npm run smoke:node-import
```
