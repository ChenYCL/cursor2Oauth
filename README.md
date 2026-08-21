# Cursor2OAuth

> Convert your Cursor Pro subscription into an OpenAI & Anthropic compatible API. Zero degradation, zero extra cost.

## Features

- **OpenAI-compatible** — `/v1/chat/completions` + `/v1/models`, works with any OpenAI SDK
- **Anthropic-compatible** — `/v1/messages` with SSE streaming, works with Claude Code
- **142 Cursor models** — Claude Opus 5, GPT-5.3 Codex, Gemini 3.1 Pro, Grok, Kimi, GLM, and more
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
  -d '{"model":"claude-4.5-sonnet","messages":[{"role":"user","content":"Hello"}]}'

# Anthropic format
curl http://localhost:8010/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-4.5-sonnet","messages":[{"role":"user","content":"Hello"}],"max_tokens":100}'

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
  -v ~/.cursor:/root/.cursor \
  cursor2oauth
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
| `claude-3-opus` | `claude-opus-5-high` |
| `claude-3.5-sonnet` | `claude-4.5-sonnet` |
| `gemini-pro` | `gemini-3.1-pro` |

You can also pass Cursor model IDs directly (e.g. `claude-opus-5-thinking-high`, `gpt-5.3-codex-xhigh`).

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

## License

MIT