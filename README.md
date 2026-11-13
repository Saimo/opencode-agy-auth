# opencode-agy-auth

Minimal, zero-bloat **OpenCode v2** provider & grounded web search plugin for **Antigravity CLI (`google-agy`)** OAuth.

Registers the `google-agy` LLM provider, OAuth integration, Code Assist protocol hooks, and OpenCode v2's native `websearch` provider — zero slash commands, zero telemetry, zero toast spam, zero external runtime dependencies.

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

Connect the **Antigravity CLI** integration in OpenCode v2 (`opencode auth login` -> `Antigravity CLI`), complete Google sign-in in your browser, and paste the callback redirect URL (`https://antigravity.google/oauth-callback?code=...`) into OpenCode.

## Models & Variants

| Model ID | Name | Variants |
| --- | --- | --- |
| `google-agy/gemini-4-carbon` | Gemini 4 Carbon | `low`, `medium`, `high` |
| `google-agy/gemini-4-argon` | Gemini 4 Argon | `low`, `medium`, `high` |
| `google-agy/gemini-4-hydrogen` | Gemini 4 Hydrogen | `low`, `medium`, `high`, `xhigh` |
| `google-agy/gemini-pro-orchestrator` | Orchestrator (Carbon) | — |
| `google-agy/gemini-pro-orchestrator-argon` | Orchestrator (Argon) | — |
| `google-agy/gemini-3.8-flash` | Gemini 3.8 Flash | `low`, `medium`, `high` |
| `google-agy/gemini-3.5-flash-lite` | Gemini 3.5 Flash Lite | — |
| `google-agy/gemini-3.1-flash-lite` | Gemini 3.1 Flash Lite | — |
| `google-agy/gemini-3-flash` | Gemini 3 Flash | — |
| `google-agy/gemini-2.5-pro` | Gemini 2.5 Pro | — |
| `google-agy/gemini-2.5-flash` | Gemini 2.5 Flash | — |
| `google-agy/gemini-2.5-flash-lite` | Gemini 2.5 Flash Lite | — |
| `google-agy/claude-opus-5-5` | Claude Opus 5.5 | `low`, `medium`, `high` |
| `google-agy/claude-sonnet-5-5` | Claude Sonnet 5.5 | `low`, `medium`, `high` |
| `google-agy/gpt-oss-120b-medium` | GPT-OSS 120B (Medium) | — |

In addition to the built-in catalog, the plugin automatically queries `:fetchAvailableModels` in the background when authenticated so newly released `agy` models and tier variants appear automatically.

## Web Search (Enabled by Default, Opt-Out)

By default, `opencode-agy-auth` registers **`Antigravity CLI` (`google-agy`)** as OpenCode v2's native `websearch` provider using Code Assist's Google Search grounding (`requestType: "web_search"` on `gemini-3.5-flash-lite`) with inline `[1]`, `[2]` citations and source URLs.

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

## Optional Project ID

For paid or enterprise Google Cloud accounts that require an explicit Cloud project, set `OPENCODE_AGY_PROJECT_ID` (or `GOOGLE_CLOUD_PROJECT`) or configure `projectId` in `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["github:Saimo/opencode-agy-auth"],
  "providers": {
    "google-agy": {
      "settings": {
        "projectId": "your-gcp-project-id"
      }
    }
  }
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
