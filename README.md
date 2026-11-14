# opencode-agy-auth

Minimal, zero-bloat **OpenCode v2** provider & grounded web search plugin for **Antigravity CLI (`google-agy`)**, powered by the official **`agy acp`** (Agent Client Protocol v1) transport.

Registers the `google-agy` AI SDK v3 provider (`aisdk:@opencode-agy/acp`), `agy acp --login` integration, OpenCode MCP tool bridge, live model + `thought_level` catalog discovery, and OpenCode v2's native `websearch` provider — zero slash commands, zero telemetry, zero external runtime dependencies.

## Prerequisites

Install **Antigravity CLI (`agy` `1.5.8+`)** and ensure `agy` is on your `PATH` (or set `OPENCODE_AGY_PATH=/path/to/agy`).

## Installation (OpenCode v2)

Add the plugin to your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["github:Saimo/opencode-agy-auth"]
}
```

Or load from a local directory:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/path/to/opencode-agy-auth"]
}
```

## Authentication

- **Zero Re-Auth (Existing `agy` Login)**: If you are already signed in to `agy` (`~/.gemini/antigravity-cli`), `google-agy` activates automatically on startup with zero duplicate login prompts.
- **Interactive / Headless Login**: Run `agy acp --login` directly (supports browser callback and headless/SSH URL paste) or run `opencode auth login` -> `Antigravity CLI` -> `Sign in with Antigravity CLI (agy acp --login)`.
- **Isolated Profiles & Enterprise ADC**: Optionally configure `geminiDir` (passes `--gemini-dir <dir> --app-data-dir antigravity-acp`) or `adcAuth: true` (`AGY_ADC_AUTH=true`).

## Dynamic Models & Reasoning Variants

At startup, `opencode-agy-auth` queries `agy acp` (`initialize` + `session/new` + `session/set_config_option`) to discover every model and per-model `thought_level` (`minimal`, `low`, `medium`, `high`, `xhigh`, `max`) available to your account, caching the catalog in OpenCode storage and `~/.cache/opencode/agy-acp-catalog.json` while providing an instant cold-start fallback catalog (`gemini-4-carbon`, `gemini-4-argon`, `gemini-4-hydrogen`, `gemini-pro-orchestrator`, `gemini-pro-orchestrator-argon`, `gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3-flash`, `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `claude-opus-5-5`, `claude-sonnet-5-5`, `gpt-oss-120b-medium`).

## Tool Execution Modes

- **`"opencode"` (Default)**: Disables `agy`'s internal file/shell tools (`_meta.disableBuiltInTools: true`) and bridges OpenCode's native tools (`bash`, `read`, `edit`, `glob`, `grep`, `task`, MCP tools, etc.) into `agy` via an ephemeral localhost MCP bridge with Pause-and-Yield execution — preserving 100% of OpenCode's permission prompts, diffs, snapshots, `/undo`, and custom tools.
- **`"hybrid"` (Optional)**: Enables `agy`'s built-in Cortex tools alongside OpenCode MCP tools, routing `agy` `session/request_permission` checks through OpenCode's `ctx.permission.assert`.

## Web Search (Enabled by Default, Opt-Out)

By default, `opencode-agy-auth` registers **`Antigravity CLI` (`google-agy`)** as OpenCode v2's native `websearch` provider using stateless `agy acp` sessions restricted strictly to `search_web` (`gemini-3.8-flash` / `gemini-3-flash` with `low` thinking effort and automatic `429` fallback to alternate models).

To opt out of Antigravity web search (or set `OPENCODE_AGY_WEBSEARCH=false`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "github:Saimo/opencode-agy-auth",
      "options": {
        "webSearch": false
      }
    }
  ]
}
```

## Plugin Options

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "github:Saimo/opencode-agy-auth",
      "options": {
        "binaryPath": "/home/user/.local/bin/agy",
        "toolMode": "opencode",
        "geminiDir": "/path/to/optional/isolated-gemini-dir",
        "adcAuth": false,
        "projectId": "optional-gcp-project-id",
        "webSearch": true
      }
    }
  ]
}
```

## Development

```bash
npm run typecheck
npm test
npm run build
npm run smoke:node-import
```

## License

MIT
