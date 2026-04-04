<h1 align="center">Hermes Dashboard</h1>

<p align="center">
  <strong>Web-based administration dashboard for <a href="https://github.com/nousresearch/hermes-agent">Hermes Agent</a></strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.12+-blue.svg" alt="Python">
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688.svg" alt="FastAPI">
  <img src="https://img.shields.io/badge/React-19-61DAFB.svg" alt="React">
  <img src="https://img.shields.io/badge/Vite-8-646CFF.svg" alt="Vite">
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License">
</p>

---

## Overview

Hermes Dashboard is a full-featured web UI for configuring, monitoring, and managing a [Hermes Agent](https://github.com/nousresearch/hermes-agent) instance. It provides a single interface to control every aspect of your AI agent — from model switching and chat sessions to scheduled tasks, file management, and usage analytics.

The dashboard runs as a single service (FastAPI backend + built React frontend) and communicates with Hermes via CLI commands and direct file access to `~/.hermes/`.

## Screenshots

<p align="center">
</p>

## Features

| Page | Description |
|------|-------------|
| **Overview** | Dashboard home — gateway status, uptime, active model, session/message counts, installed skills, cron jobs, platform connections, recent logs, system metrics (CPU, RAM, Disk, Load) |
| **Gateway Control** | Gateway service management — real-time status (PID, memory, CPU, tasks, uptime), start/stop/restart controls with confirmation modal, live log streaming (SSE), log filtering by level and search |
| **Chat** | Full chat interface with SSE streaming responses, session sidebar, markdown rendering, tool call indicators, and typing animation. Falls back to direct LLM API if gateway is unavailable |
| **Configuration** | Edit `config.yaml` with a structured section-based editor (Model, Agent, Terminal, Browser, Display, Streaming, TTS, Memory, Cron, Privacy). Includes raw YAML editor and secret masking |
| **Sessions** | Browse all Hermes sessions with metadata, search across sessions, view full message history, delete or prune old sessions, export sessions, session stats with per-day chart and platform breakdown |
| **Files** | File browser for `HERMES_HOME` — directory tree, file viewer/editor, create and delete files. Path traversal protection and binary file blocking |
| **Terminal** | WebSocket-based terminal emulator (xterm.js) with full interactive PTY, resize support, and custom color theme |
| **Tools** | List all Hermes tools, enable/disable individual tools per platform (CLI, Telegram, Discord, etc.) |
| **Skills** | List installed skills with category and metadata, inspect skill content, install and uninstall skills |
| **Skills Hub** | Skill marketplace — browse and search available skills, install with one click, enriched metadata with detail drawer |
| **Cron Jobs** | Manage scheduled tasks — create with cron expressions, pause/resume, trigger manually, delete |
| **Memory & SOUL** | Edit `SOUL.md` (agent personality) and `MEMORY.md` (agent memory), browse and edit memory files |
| **Vector Memory** | Visualize LanceDB vector memory — stats, semantic search, memory list, add/delete. Color-coded source badges. Only visible if hermes-memory is installed |
| **Models** | View current model and provider, browse available models, switch model with one click |
| **Platforms** | View connection status for all platforms (Telegram, Discord, WhatsApp, Signal, Slack, Matrix, DingTalk, Feishu, WeCom, Mattermost, Home Assistant), per-platform env var status, descriptions, configure API credentials, channel directory, pairing management |
| **API Keys** | Manage API keys — view, add, and remove keys for providers, tools, and platforms. Masked previews with reveal toggle |
| **Fine-Tune** | Collection of voice + transcription pairs for ASR fine-tuning — audio playback, transcript editing, stats. Only visible if fine-tune data exists |
| **Insights** | Usage analytics with configurable time period — model usage charts, platform distribution, top tools, activity patterns, notable sessions, hourly activity heatmap, top 10 skills, average response time, messages by platform, tokens by day |
| **Diagnostics** | Run health checks on Hermes installation — quick check (file/status verification) or full diagnostics (`hermes doctor`). Grouped results with pass/warn/fail indicators |
| **Webhooks** | Manage Hermes webhooks — list active webhooks, create new (URL + events), delete |

**Additional:** Dark/light theme toggle with system preference detection, responsive design with collapsible sidebar, contextual tooltips throughout the UI.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser (SPA)                     │
│                  React 19 + Vite 8                   │
└──────────────────────┬──────────────────────────────┘
                       │ REST API / WebSocket / SSE
                       ▼
┌─────────────────────────────────────────────────────┐
│                 FastAPI Backend                      │
│              (Uvicorn, Python 3.12)                  │
├─────────────────────────────────────────────────────┤
│  Auth Middleware  │  Security Headers  │  CORS       │
├─────────────────────────────────────────────────────┤
│  18 API Routers  │  WebSocket Terminal  │  Static   │
└──────────┬──────────────────────────────────────────┘
           │                              │
           ▼                              ▼
    ┌──────────────┐            ┌──────────────────┐
    │  ~/.hermes/  │            │   Hermes CLI     │
    │  config.yaml │            │  (hermes command) │
    │  sessions.db │            │  Mutating ops    │
    │  SOUL.md     │            └──────────────────┘
    │  MEMORY.md   │
    │  skills/     │
    │  memory/     │
    └──────────────┘
```

- **Monorepo** structure — `backend/` (Python/FastAPI) and `frontend/` (React/Vite)
- Frontend builds to `backend/static/` — in production, FastAPI serves the SPA with catch-all routing
- Backend reads Hermes files directly and shells out to the `hermes` CLI for mutating operations
- **Authentication:** Bearer token via `HERMES_DASHBOARD_TOKEN` env var (optional — if not set, all access is open)
- **Security:** CSP headers, path traversal protection, secret masking in config, binary file blocklist, 5MB file read limit

## Tech Stack

### Backend

| Component | Technology |
|-----------|-----------|
| Framework | FastAPI 0.115 |
| Server | Uvicorn (with `[standard]` extras) |
| Config | PyYAML |
| Environment | python-dotenv |
| HTTP Client | httpx (chat streaming) |
| Database | aiosqlite (session store) |
| Auth | Bearer token middleware |

### Frontend

| Component | Technology |
|-----------|-----------|
| Framework | React 19 |
| Build | Vite 8 |
| Routing | react-router-dom 7 (HashRouter) |
| Terminal | @xterm/xterm + addon-fit |
| Markdown | react-markdown + remark-gfm |
| Icons | lucide-react |
| Styling | Custom CSS with CSS custom properties |

## API Reference

All endpoints are prefixed with `/api/`. Authentication via `Authorization: Bearer <token>` header (if `HERMES_DASHBOARD_TOKEN` is set).

### Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/overview` | Dashboard overview stats |
| GET | `/api/overview/logs?lines=N` | Recent gateway logs |
| GET | `/api/overview/system` | System metrics (CPU, RAM, Disk, Load) |

### Gateway Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/gateway/status` | Gateway service status via systemctl |
| POST | `/api/gateway/restart` | Restart the gateway service |
| POST | `/api/gateway/stop` | Stop the gateway service |
| POST | `/api/gateway/start` | Start the gateway service |
| GET | `/api/gateway/logs?lines=N&level=X&search=Y` | Parsed gateway log entries |
| GET | `/api/gateway/logs/stream?level=X` | SSE streaming gateway logs |

### Diagnostics

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/diagnostics/run` | Run full `hermes doctor` diagnostics |
| GET | `/api/diagnostics/quick` | Quick health checks (file/status verification) |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/webhooks/list` | List configured webhooks |
| POST | `/api/webhooks/create` | Create a new webhook |
| DELETE | `/api/webhooks/delete` | Delete a webhook |

### Configuration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | Read config.yaml (secrets masked) |
| PUT | `/api/config` | Save raw YAML config |
| GET | `/api/config/sections` | Config broken into editable sections |
| POST | `/api/config/set` | Set a single config value via Hermes CLI |
| PUT | `/api/config/structured` | Save structured JSON config |

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sessions` | List all sessions |
| GET | `/api/sessions/search?q=...` | Search sessions by content |
| GET | `/api/sessions/stats` | Global session statistics |
| GET | `/api/sessions/{id}` | Session detail with messages |
| DELETE | `/api/sessions/{id}` | Delete a session |
| POST | `/api/sessions/prune?days=N` | Prune sessions older than N days |
| GET | `/api/sessions/{id}/export` | Export a session |

### Memory

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/memory/soul` | Read SOUL.md |
| PUT | `/api/memory/soul` | Save SOUL.md |
| GET | `/api/memory/memory` | Read MEMORY.md |
| PUT | `/api/memory/memory` | Save MEMORY.md |
| GET | `/api/memory/files` | List memory files |
| GET | `/api/memory/files/{name}` | Read a memory file |
| PUT | `/api/memory/files/{name}` | Save a memory file |

### Vector Memory

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/memory/vector/available` | Check if vector memory (LanceDB) is available |
| GET | `/api/memory/vector/stats` | Vector memory statistics |
| GET | `/api/memory/vector/list` | List vector memories |
| GET | `/api/memory/vector/search` | Semantic search in vector memory |
| POST | `/api/memory/vector/store` | Store a new vector memory |
| DELETE | `/api/memory/vector/delete` | Delete a vector memory by ID |
| GET | `/api/memory/vector/usage` | Estimate embedding API usage |

### API Keys

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-keys` | List all API key definitions with status |
| POST | `/api/api-keys/set` | Set an API key value |
| POST | `/api/api-keys/delete` | Remove an API key |

### Fine-Tune

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/fine-tune/available` | Check if fine-tune training data exists |
| GET | `/api/fine-tune/pairs` | List voice + transcription pairs |
| PUT | `/api/fine-tune/pairs/{base_name}` | Update a pair's transcript |
| DELETE | `/api/fine-tune/pairs/{base_name}` | Delete a pair (audio + transcript) |
| GET | `/api/fine-tune/stats` | Global fine-tune statistics |
| GET | `/api/fine-tune/audio/{date}/{base_name}` | Serve audio file for playback |

### Tools

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tools` | List all tools |
| GET | `/api/tools/{platform}` | List tools for a platform |
| POST | `/api/tools/enable` | Enable a tool |
| POST | `/api/tools/disable` | Disable a tool |

### Skills

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/skills` | List installed skills |
| GET | `/api/skills/list` | List skills with enriched metadata |
| GET | `/api/skills/browse?query=...` | Browse/search available skills |
| GET | `/api/skills/{name}` | Inspect a skill |
| GET | `/api/skills/detail/{name}` | Full skill detail |
| POST | `/api/skills/install` | Install a skill |
| POST | `/api/skills/uninstall` | Uninstall a skill |

### Cron Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cron` | List cron jobs |
| POST | `/api/cron` | Create a cron job |
| GET | `/api/cron/{id}` | Get job detail |
| POST | `/api/cron/{id}/pause` | Pause a job |
| POST | `/api/cron/{id}/resume` | Resume a job |
| POST | `/api/cron/{id}/run` | Trigger a job manually |
| DELETE | `/api/cron/{id}` | Delete a job |

### Models

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/models` | Get current model info |
| GET | `/api/models/available` | List available models |
| POST | `/api/models/switch` | Switch model |

### Platforms

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/platforms/status` | Platform connection statuses |
| GET | `/api/platforms/channels` | Channel directory |
| GET | `/api/platforms/pairing` | List pairing codes |
| POST | `/api/platforms/pairing/approve` | Approve a pairing request |
| POST | `/api/platforms/pairing/revoke` | Revoke a pairing |

### Insights

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/insights?days=N` | Usage analytics (1/7/14/30 days) |

### Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/chat/sessions` | List chat sessions |
| GET | `/api/chat/sessions/{id}/messages` | Get session messages |
| POST | `/api/chat/stream` | Stream chat (SSE) |

### Files

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/files?path=...` | List files at path |
| GET | `/api/files/tree` | Top-level directory tree |
| GET | `/api/files/read?path=...` | Read file content |
| PUT | `/api/files/write` | Write file content |
| DELETE | `/api/files?path=...` | Delete a file |

### WebSocket

| Protocol | Endpoint | Description |
|----------|----------|-------------|
| WS | `/ws/terminal` | Interactive PTY terminal session |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check (always unauthenticated) |

### Gateway Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/gateway/status` | Gateway service status (state, PID, memory, CPU, uptime, tasks) |
| POST | `/api/gateway/restart` | Restart gateway service |
| POST | `/api/gateway/stop` | Stop gateway service |
| POST | `/api/gateway/start` | Start gateway service |
| GET | `/api/gateway/logs?lines=N&level=X&search=Y` | Get parsed log entries with filtering |
| GET | `/api/gateway/logs/stream?level=X` | SSE stream for real-time log viewing |

### System Metrics (Overview)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/overview/system` | CPU usage, RAM, Disk, Load average metrics |

### Diagnostics

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/diagnostics/run` | Run `hermes doctor` full diagnostics |
| GET | `/api/diagnostics/quick` | Quick health checks (gateway, config, env, files, disk) |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/webhooks/list` | List configured webhooks |
| POST | `/api/webhooks/create` | Create a new webhook (URL + events) |
| DELETE | `/api/webhooks/delete` | Delete a webhook by URL |

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 20+
- [Hermes Agent](https://github.com/nousresearch/hermes-agent) installed with `hermes` CLI available
- Hermes configured with `~/.hermes/` directory and `config.yaml`

### Option 1: Manual Installation

```bash
# Clone the repository
git clone https://github.com/duan78/hermes-dashboard.git
cd hermes-dashboard

# Install backend dependencies
pip install -r backend/requirements.txt

# Build the frontend
cd frontend
npm install
npm run build    # outputs to backend/static/

# Configure (optional)
cp .env.example .env
# Edit .env to set HERMES_DASHBOARD_TOKEN and HERMES_HOME

# Run
cd ..
PYTHONPATH=. python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 3100
```

Open [http://127.0.0.1:3100](http://127.0.0.1:3100) in your browser.

### Option 2: Docker

```bash
git clone https://github.com/duan78/hermes-dashboard.git
cd hermes-dashboard

docker build -t hermes-dashboard .

docker run -d \
  -p 3100:3100 \
  -e HERMES_DASHBOARD_TOKEN=your-token-here \
  -v ~/.hermes:/root/.hermes \
  hermes-dashboard
```

### Option 3: Systemd

```bash
git clone https://github.com/duan78/hermes-dashboard.git
cd hermes-dashboard

# Install and build
pip install -r backend/requirements.txt
cd frontend && npm install && npm run build && cd ..

# Install service
cp systemd/hermes-dashboard.service /etc/systemd/system/
# Edit the service file to match your paths
sudo systemctl daemon-reload
sudo systemctl enable --now hermes-dashboard
```

## Development

Run the backend and frontend separately for hot reloading:

```bash
# Terminal 1 — Backend (auto-reload)
PYTHONPATH=. python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 3100 --reload

# Terminal 2 — Frontend (Vite dev server with API proxy)
cd frontend
npm run dev    # http://localhost:5173, proxies /api to backend
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HERMES_DASHBOARD_TOKEN` | _(none)_ | Bearer token for API authentication. If not set, all access is open |
| `HERMES_HOME` | `~/.hermes` | Path to the Hermes Agent configuration directory |
| `HERMES_BIN` | `/root/.local/bin/hermes` | Path to the Hermes CLI binary |
| `HERMES_PYTHON` | `/root/.hermes/hermes-agent/venv/bin/python` | Path to the Hermes Agent virtualenv python |
| `HERMES_AGENT_DIR` | `/root/.hermes/hermes-agent` | Path to the Hermes Agent directory |
| `HERMES_MEMORY_PATH` | `/root/hermes-memory` | Path to the hermes-memory module |

## Project Structure

```
hermes-dashboard/
├── Dockerfile
├── .env.example
├── .gitignore
├── systemd/
│   └── hermes-dashboard.service
├── backend/
│   ├── requirements.txt
│   ├── static/                    # Built frontend (generated)
│   └── app/
│       ├── __init__.py
│       ├── main.py                # FastAPI app, CORS, auth, security, static serving
│       ├── config.py              # Environment & config loading
│       ├── auth.py                # Bearer token middleware
│       ├── utils.py               # hermes_path(), run_hermes(), mask_secrets()
│       └── routers/
│           ├── overview.py        # Dashboard overview & logs
│           ├── config.py          # Config CRUD
│           ├── sessions.py        # Session management
│           ├── memory.py          # SOUL.md, MEMORY.md, memory files, vector memory
│           ├── tools.py           # Tool listing & enable/disable
│           ├── skills.py          # Skill management & Skills Hub
│           ├── cron.py            # Cron job management
│           ├── models.py          # Model info & switching
│           ├── platforms.py       # Platform status & pairing
│           ├── insights.py        # Usage analytics
│           ├── chat.py            # Chat sessions & SSE streaming
│           ├── files.py           # File browser & editor
│           ├── terminal.py        # WebSocket PTY terminal
│           ├── api_keys.py        # API key management
│           ├── fine_tune.py       # Fine-tune voice + transcription pairs
│           ├── gateway.py       # Gateway service control, logs, SSE streaming
│           ├── diagnostics.py  # Health checks, hermes doctor integration
│           └── webhooks.py     # Webhook management
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── eslint.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx                # Layout, sidebar, routing
        ├── api.js                 # Centralized API client
        ├── index.css              # Global styles & CSS custom properties
        ├── contexts/
        │   └── ThemeContext.jsx    # Dark/light theme provider
        ├── components/
        │   ├── Tooltip.jsx
        │   └── tooltip.css
        └── pages/
            ├── Overview.jsx
            ├── Chat.jsx
            ├── Config.jsx
            ├── Sessions.jsx
            ├── Files.jsx
            ├── TerminalPage.jsx
            ├── Tools.jsx
            ├── Skills.jsx
            ├── SkillsHub.jsx
            ├── CronJobs.jsx
            ├── MemorySoul.jsx         # Memory & SOUL + Vector Memory tabs
            ├── Models.jsx
            ├── Platforms.jsx
            ├── ApiKeys.jsx
            ├── FineTune.jsx            # Voice + transcription pairs
            ├── Insights.jsx
            ├── GatewayControl.jsx      # Gateway service control, live logs
            ├── Diagnostics.jsx       # Health checks & diagnostics
            ├── Webhooks.jsx          # Webhook management
            ├── GatewayControl.jsx   # Gateway service control & live logs
            ├── Diagnostics.jsx     # Health checks
            ├── Webhooks.jsx        # Webhook management            ├── memory.css
            └── fine-tune.css
```

## Reverse Proxy

The dashboard works behind Nginx or any reverse proxy. For WebSocket support (terminal), make sure to proxy `/ws/` with upgrade headers:

```nginx
server {
    listen 443 ssl;
    server_name dashboard.example.com;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
