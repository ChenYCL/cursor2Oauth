# Cursor2OAuth

> Convert your Cursor Pro subscription into an OpenAI & Anthropic compatible API. Zero degradation, zero extra cost.

## Features

- **OpenAI-compatible** — `/v1/chat/completions` + `/v1/models`, works with any OpenAI SDK
- **Anthropic-compatible** — `/v1/messages` with SSE streaming, works with Claude Code
- **Cursor models without thinking-* clutter** — `/v1/models` exposes clean names (`claude-sonnet-5`, `claude-opus-5`). Thinking is mapped internally (default `thinking-high`) from the client's `thinking` / `reasoning_effort` fields.
- **Streaming** — Full SSE support for both OpenAI and Anthropic formats
- **Zero degradation** — Uses `cursor-agent` CLI as backend (same models, same prompts, same quality)
- **No IDE required** — Standalone CLI, works on any server
- **Docker-ready** — One-click deploy with Docker or docker-compose

## Quick Start

### 1. Install Cursor CLI

```bash
curl https://cursor.com/install -fsS | bash
```

### 2. Login

```bash
agent login
```

### 3. Install & Run

```bash
npm install
PORT=8010 node server.js
```

### 4. Test

```bash
# OpenAI format
curl http://localhost:8010/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-5","messages":[{"role":"user","content":"Hello"}]}'

# Anthropic format
curl http://localhost:8010/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-5","messages":[{"role":"user","content":"Hello"}],"max_tokens":100}'

# List models
curl http://localhost:8010/v1/models
```

## Docker Deploy

```bash
# One-click
./deploy.sh

# Or manual
docker build -t cursor2oauth .
docker run -d \
  --name cursor2oauth \
  --restart unless-stopped \
  -p 8010:8010 \
  -e XDG_CONFIG_HOME=/root/.cursor/xdg-config \
  -v ~/.cursor:/root/.cursor \
  cursor2oauth

# Headless login (prints a URL, tokens persist in ~/.cursor/xdg-config)
docker exec -e NO_OPEN_BROWSER=1 -it cursor2oauth agent login
```

## API

### OpenAI Compatible

| Endpoint | Method | Description |
|---|---|---|
| `/v1/chat/completions` | POST | Chat completions (stream + non-stream) |
| `/v1/models` | GET | List all available models |

### Anthropic Compatible

| Endpoint | Method | Description |
|---|---|---|
| `/v1/messages` | POST | Messages API (stream + non-stream) |
| `/health` | GET | Liveness probe (no auth) |

### Subscription usage

| Endpoint | Method | Description |
|---|---|---|
| `/usage` | GET | Current billing-period usage (requires auth if `API_KEY` is set) |

Calls Cursor's `aiserver.v1.DashboardService/GetCurrentPeriodUsage` and normalises
the reply. The `windows[]` shape matches ccLoad's `oauth_usage.windows[]`, so the
ccLoad desktop client can render it next to the other providers.

```bash
curl -s localhost:3000/usage | jq '.windows[0], .display_message'
```

```json
{
  "limit_name": "included",
  "used_percent": 90.06,
  "remaining_percent": 9.94,
  "reset_at": 1789181874,
  "limit_usd": 400,
  "spend_usd": 360.25,
  "remaining_usd": 39.75
}
"You've used 90% of your included usage"
```

The headline number is `totalSpend / limit`, which is what Cursor's own UI shows.
Do **not** use the `totalPercentUsed` field for that — it is a different metric
(measured 14.41 while the same response said "You've used 90%").

**Token resolution**, in order:

1. `CURSOR_ACCESS_TOKEN` env var — the only one guaranteed to work in Docker.
2. `$XDG_CONFIG_HOME` — scans JSON there for an `accessToken`-ish field, so a
   logged-in Cursor CLI in the container is picked up automatically.
3. The desktop app's `state.vscdb` — most convenient for local development.

### Authentication

Set `API_KEY` env var to enable Bearer token auth:

```bash
API_KEY=your-secret-key node server.js
```

## Model Mapping

Common model names are automatically mapped to Cursor models:

| Requested Model | Cursor Model |
|---|---|
| `gpt-4`, `gpt-4o` | `gpt-5.3-codex` |
| `claude-3-opus` | `claude-opus-5` |
| `claude-3.5-sonnet`, `claude-4.5-sonnet`, `claude-sonnet-4-5` | `claude-sonnet-5` (internally `claude-sonnet-5-thinking-high` unless `thinking` is disabled) |
| `gemini-pro` | `gemini-3.1-pro` |

Default model is `claude-sonnet-5`. Thinking is **not** part of the public model name: the proxy maps Anthropic `thinking` / OpenAI `reasoning_effort` onto Cursor's `-thinking-*` IDs. Default is thinking + effort `high`. Pass `"thinking":{"type":"disabled"}` to turn it off.

You can still pass Cursor IDs directly (e.g. `claude-sonnet-5-max`, `gpt-5.3-codex-xhigh`).

## Remote Deploy

Only `cursor-agent` CLI is needed on the remote server — no Cursor IDE required.

1. Install cursor-agent on the remote server
2. Run `agent login` (a browser URL will be shown)
3. Start the proxy

Or sync your local auth config:
```bash
rsync -av ~/.cursor/ user@server:~/.cursor/
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Listen port |
| `HOST` | `0.0.0.0` | Listen address |
| `API_KEY` | (empty) | Enable Bearer token auth |
| `CURSOR_API_KEY` | (empty) | Cursor user API key (skips `agent login`) |
| `XDG_CONFIG_HOME` | (unset) | Set to `/root/.cursor/xdg-config` in Docker so login survives rebuilds |

## License

MIT