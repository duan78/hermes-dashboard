<h1 align="center">Hermes Dashboard</h1>

<p align="center">
  <strong>Web-based administration dashboard for <a href="https://github.com/nousresearch/hermes-agent">Hermes Agent</a></strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.12+-blue.svg" alt="Python">
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688.svg" alt="FastAPI">
  <img src="https://img.shields.io/badge/React-19-61DAFB.svg" alt="React">
  <img src="https://img.shields.io/badge/Vite-8-646CFF.svg" alt="Vite">
  <img src="https://img.shields.io/badge/Backend_Routers-47-F44336.svg" alt="Routers">
  <img src="https://img.shields.io/badge/Frontend_Pages-37-FF9800.svg" alt="Pages">
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License">
</p>

---

## Overview

Hermes Dashboard is a full-featured web UI for configuring, monitoring, and managing a [Hermes Agent](https://github.com/nousresearch/hermes-agent) instance. It provides a single interface to control every aspect of your AI agent — from model switching and chat sessions to project management, CRM, knowledge base, scheduled tasks, file management, backup/restore, Claude Code integration, MCP server management, and usage analytics.

The dashboard runs as a single service (FastAPI backend + built React frontend) and communicates with Hermes via CLI commands and direct file access to `~/.hermes/`.

## Features

### Core

| Page | Description |
|------|-------------|
| **Overview** | Dashboard home — gateway status, uptime, active model, session/message counts, installed skills, cron jobs, platform connections, recent logs, system metrics (CPU, RAM, Disk, Load) |
| **Chat** | Full chat interface with SSE streaming responses, session sidebar, markdown rendering, tool call indicators, and typing animation. Falls back to direct LLM API if gateway is unavailable |
| **Gateway Control** | Gateway service management — real-time status (PID, memory, CPU, tasks, uptime), start/stop/restart controls with confirmation modal, live log streaming (SSE), log filtering by level and search |
| **Configuration** | Edit `config.yaml` with a structured section-based editor (Model, Agent, Terminal, Browser, Display, Streaming, TTS, Memory, Cron, Privacy). Includes raw YAML editor, secret masking, and dot-notation key update endpoint |

### AI & Models

| Page | Description |
|------|-------------|
| **Models** | View current model and provider, browse available models, switch model with one click |
| **MOA Config** | Mixture of Agents configuration — manage reference models with per-model provider assignment (OpenRouter, custom providers), configure aggregator model/provider/temperature, add/remove reference models, estimate cost per call, multi-provider management with live connection testing, advanced settings (min successful references). Only visible if MOA toolset is enabled |
| **Claude Code** | Claude Code integration — monitor active tmux sessions with real-time status (working/idle/interrupted/completed), CPU and memory usage per session, send messages to sessions, create new sessions with custom workdir, stop/kill sessions, browse session history with project grouping, view session messages (JSONL), global stats (active sessions, total projects, last activity) |
| **MCP Servers** | Model Context Protocol server management — list configured servers with transport type (stdio/SSE/OAuth), add new servers, remove servers, test connection to individual servers, OAuth flow support |

### Project Management

| Page | Description |
|------|-------------|
| **Projects** | Project tracking — CRUD with types (webapp, library, infra, SEO, research, automation), statuses (active, paused, archived), descriptions, tags, GitHub links, and creation dates |
| **Backlog** | Task backlog with smart autofeed — create tasks with title, description, priority (haute/normale/basse), status (pending, blocked, waiting-human, in-progress, done), categories, tags. LLM-powered autofeed scans configured sources (GitHub repos, documentation sites) and suggests new tasks with confidence scoring |
| **Wiki** | Knowledge base with structured pages — organize content by type (entities, concepts, comparisons, queries) and source (articles, papers, transcripts). Markdown editing with live preview, full-text search |
| **Leads** | CRM pipeline — track leads through stages (new, contacted, qualified, proposal, negotiation, won, lost) with contact info, notes, value tracking, and statistics |
| **Tags** | Cross-entity tagging system — create, rename, delete tags used across projects, backlog items, and wiki pages |

### Agent Management

| Page | Description |
|------|-------------|
| **Sessions** | Browse all Hermes sessions with metadata, search across sessions, view full message history, delete or prune old sessions, export sessions, session stats with per-day chart and platform breakdown |
| **Memory & SOUL** | Multi-tab memory management — **MD Files** tab (SOUL.md, MEMORY.md, memory files CRUD), **Vector Memory** tab (LanceDB stats, semantic search, memory list, add/delete, source badges), **Honcho** tab (session-based memory, peer profiles, semantic search). Vector and Honcho tabs only appear when their providers are available |
| **Tools** | List all Hermes tools, enable/disable individual tools per platform (CLI, Telegram, Discord, etc.), tool configuration with env var management |
| **Skills** | List installed skills with category and metadata, inspect skill content, install and uninstall skills |
| **Skills Hub** | Skill marketplace — browse and search available skills, install with one click, enriched metadata with detail drawer |
| **Cron Jobs** | Manage scheduled tasks — create with cron expressions, pause/resume, trigger manually, delete |
| **Plugins** | Plugin management — list installed plugins (name, version, status, source), install from Git URL, remove, enable/disable, update to latest version |

### System Administration

| Page | Description |
|------|-------------|
| **Files** | File browser for `HERMES_HOME` — directory tree, file viewer/editor, create and delete files. Path traversal protection and binary file blocking |
| **Terminal** | WebSocket-based terminal emulator (xterm.js) with full interactive PTY, resize support, and custom color theme |
| **Platforms** | View connection status for all platforms (Telegram, Discord, WhatsApp, Signal, Slack, Matrix, DingTalk, Feishu, WeCom, Mattermost, Home Assistant), per-platform env var status, descriptions, configure API credentials, channel directory, pairing management |
| **Environment** | Environment variables management — list all vars from `~/.hermes/.env`, add/edit/delete variables, required variables status panel, sensitive value masking with reveal toggle |
| **API Keys** | Manage API keys — view, add, and remove keys for providers, tools, and platforms. Masked previews with reveal toggle |
| **Profiles** | Hermes profile management — list all profiles with active indicator, create new profiles, set active profile, rename, delete, export profile to archive |
| **Backup** | Backup and restore — create backup archives (config, SOUL.md, MEMORY.md, USER.md, skills, .env with optional exclusions), list backups with size and date, restore from backup, delete backups, download backup archives |
| **Diagnostics** | Run health checks on Hermes installation — quick check (file/status verification) or full diagnostics (`hermes doctor`). Grouped results with pass/warn/fail indicators |
| **Webhooks** | Manage Hermes webhooks — list active webhooks, create new (URL + events), delete |

### Analytics & Monitoring

| Page | Description |
|------|-------------|
| **Insights** | Usage analytics with configurable time period — model usage charts, platform distribution, top tools, activity patterns, notable sessions, hourly activity heatmap, top 10 skills, average response time, messages by platform, tokens by day |
| **Activity** | Audit log — chronological feed of all changes across projects, backlog items, wiki pages, tags, and system events. Filterable by entity type and action |
| **Search History** | Search query history — browse past searches with provider badges (Brave, Tavily, Exa, Firecrawl, Linkup, AgentReach), result counts, and timestamps |

### User Management

| Page | Description |
|------|-------------|
| **Users** | User administration — list registered users, approve/reject pending registrations, change roles (admin/user), revoke access |
| **Login** | Authentication page — username/password login with JWT token storage |
| **Register** | User self-registration — available when no users exist yet, first user becomes admin |
| **Auth & Pairing** | Device authentication pairing — list pending pairing codes and approved users, approve pending codes, revoke approved users, clear all pending codes |

### Other

| Page | Description |
|------|-------------|
| **Fine-Tune** | Collection of voice + transcription pairs for ASR fine-tuning — audio playback, transcript editing, stats. Only visible if fine-tune data exists |

**Additional features:** Dark/light theme toggle with system preference detection, responsive design with collapsible sidebar, command palette (Ctrl+K), global search bar, contextual tooltips, notification bell, page-level error boundaries, lazy-loaded routes for performance, TanStack React Query for data fetching and caching.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                       Browser (SPA)                       │
│                    React 19 + Vite 8                      │
│   TanStack Query │ React Router 7 │ xterm.js │ Markdown  │
└───────────────────────────┬──────────────────────────────┘
                            │ REST API / WebSocket / SSE
                            ▼
┌──────────────────────────────────────────────────────────┐
│                    FastAPI Backend                        │
│                 (Uvicorn, Python 3.12)                    │
├──────────────────────────────────────────────────────────┤
│  Auth Middleware  │  Security Headers  │  CORS  │  Rate   │
│  JWT Users       │  CSP               │        │  Limit  │
├──────────────────────────────────────────────────────────┤
│  47 API Routers  │  WebSocket Terminal  │  Static Files  │
│  + Autofeed      │  + SSE Streams       │  + SPA Fallback│
└──────────┬───────────────────────────────────────────────┘
           │                              │
           ▼                              ▼
    ┌──────────────┐            ┌──────────────────┐
    │  ~/.hermes/  │            │   Hermes CLI     │
    │  config.yaml │            │  (hermes command) │
    │  sessions.db │            │  Mutating ops    │
    │  SOUL.md     │            └──────────────────┘
    │  MEMORY.md   │
    │  skills/     │            ┌──────────────────┐
    │  memory/     │            │   Claude Code    │
    │  backups/    │            │  (tmux sessions) │
    │  projects/   │            └──────────────────┘
    │  wiki/       │            ┌──────────────────┐
    │  leads/      │            │   Honcho API     │
    │  backlog/    │            │  (memory cloud)  │
    │  users.db    │            └──────────────────┘
    │  .env        │
    └──────────────┘
```

- **Monorepo** structure — `backend/` (Python/FastAPI) and `frontend/` (React/Vite)
- Frontend builds to `backend/static/` — in production, FastAPI serves the SPA with catch-all routing
- Backend reads Hermes files directly and shells out to the `hermes` CLI for mutating operations
- Claude Code integration manages sessions via `tmux` and reads JSONL session files from `~/.claude/projects/`
- Honcho memory connects to the [Honcho](https://github.com/honcho-ai/honcho) cloud API for session-based memory
- **Authentication:** Dual-layer — optional Bearer token via `HERMES_DASHBOARD_TOKEN` env var (API gateway) + JWT-based user accounts with roles (admin/user)
- **Security:** CSP headers, path traversal protection, secret masking in config, binary file blocklist, 5MB file read limit, backup archive path traversal prevention, rate limiting

## Tech Stack

### Backend

| Component | Technology |
|-----------|-----------|
| Framework | FastAPI 0.115 |
| Server | Uvicorn 0.34 (with `[standard]` extras) |
| Config | PyYAML 6.0 |
| Environment | python-dotenv 1.0 |
| HTTP Client | httpx 0.28 (chat streaming, MOA provider testing) |
| Database | aiosqlite 0.20 (session store, users, projects, backlog, leads, wiki) |
| Auth | Bearer token middleware + JWT user accounts |

### Frontend

| Component | Technology |
|-----------|-----------|
| Framework | React 19 |
| Build | Vite 8 |
| Routing | react-router-dom 7 (HashRouter) |
| Data Fetching | @tanstack/react-query 5 |
| Terminal | @xterm/xterm 6 + addon-fit |
| Markdown | react-markdown 10 + remark-gfm 4 |
| Icons | lucide-react |
| Styling | Custom CSS with CSS custom properties |
| Testing | Vitest + React Testing Library |

## API Reference

All endpoints are prefixed with `/api/`. Authentication via `Authorization: Bearer ***` header (if `HERMES_DASHBOARD_TOKEN` is set) or JWT user token.

### Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/overview` | Dashboard overview stats |
| GET | `/api/overview/logs?lines=N` | Recent gateway logs |
| GET | `/api/overview/system` | System metrics (CPU, RAM, Disk, Load) |
| GET | `/api/overview/version` | Hermes version |
| POST | `/api/overview/update` | Update Hermes |
| GET | `/api/overview/changelog` | Hermes changelog |

### Gateway Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/gateway/status` | Gateway service status (state, PID, memory, CPU, uptime, tasks) |
| POST | `/api/gateway/start` | Start gateway service |
| POST | `/api/gateway/stop` | Stop gateway service |
| POST | `/api/gateway/restart` | Restart gateway service |
| GET | `/api/gateway/logs?lines=N&level=X&search=Y` | Get parsed log entries with filtering |
| GET | `/api/gateway/logs/stream?level=X` | SSE stream for real-time log viewing |

### Configuration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | Read config.yaml (secrets masked) |
| PUT | `/api/config` | Save raw YAML config |
| GET | `/api/config/sections` | Config broken into editable sections |
| POST | `/api/config/set` | Set a single config value via Hermes CLI |
| PUT | `/api/config/structured` | Save structured JSON config (preserves masked secrets) |
| POST | `/api/config/update` | Update a single config value using dot-notation key path |

### MOA Configuration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config/moa` | Get MOA (Mixture of Agents) configuration |
| PUT | `/api/config/moa` | Save MOA configuration |
| GET | `/api/config/moa/providers` | List all configured MOA providers with status |
| PUT | `/api/config/moa/providers` | Save MOA providers configuration |
| POST | `/api/config/moa/providers/test` | Test connection to a specific MOA provider |

### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List all projects |
| POST | `/api/projects` | Create a project |
| GET | `/api/projects/{id}` | Get project detail |
| PUT | `/api/projects/{id}` | Update a project |
| DELETE | `/api/projects/{id}` | Delete a project |

### Backlog

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/backlog` | List backlog items |
| POST | `/api/backlog` | Create a backlog item |
| GET | `/api/backlog/{id}` | Get backlog item detail |
| PUT | `/api/backlog/{id}` | Update a backlog item |
| DELETE | `/api/backlog/{id}` | Delete a backlog item |
| POST | `/api/backlog/{id}/autofeed` | Run autofeed scan for a backlog item |
| GET | `/api/backlog/autofeed/sources` | List configured autofeed sources |
| POST | `/api/backlog/autofeed/sources` | Add an autofeed source |
| DELETE | `/api/backlog/autofeed/sources` | Remove an autofeed source |

### Wiki

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/wiki` | List wiki pages |
| POST | `/api/wiki` | Create a wiki page |
| GET | `/api/wiki/{id}` | Get wiki page detail |
| PUT | `/api/wiki/{id}` | Update a wiki page |
| DELETE | `/api/wiki/{id}` | Delete a wiki page |
| GET | `/api/wiki/search?q=...` | Search wiki pages |

### Leads

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/leads` | List leads with filtering and pagination |
| POST | `/api/leads` | Create a lead |
| GET | `/api/leads/{id}` | Get lead detail |
| PUT | `/api/leads/{id}` | Update a lead |
| DELETE | `/api/leads/{id}` | Delete a lead |
| GET | `/api/leads/stats` | Lead pipeline statistics |

### Users & Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/users/register` | Register a new user |
| POST | `/api/users/login` | Login (returns JWT) |
| GET | `/api/users/list` | List all users (admin) |
| POST | `/api/users/{id}/approve` | Approve a pending user |
| POST | `/api/users/{id}/reject` | Reject a pending user |
| POST | `/api/users/{id}/role` | Change user role |
| GET | `/api/users/registration-status` | Check if registration is available |

### Activity & Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/activity` | List activity/audit log entries |
| GET | `/api/search` | Global search across entities |
| GET | `/api/search/history` | List search history entries |
| DELETE | `/api/search/history/{id}` | Delete a search history entry |
| GET | `/api/tags` | List all tags |
| POST | `/api/tags` | Create a tag |
| PUT | `/api/tags/{id}` | Rename a tag |
| DELETE | `/api/tags/{id}` | Delete a tag |

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
| GET | `/api/memory/all` | List all memory files |
| POST | `/api/memory/create` | Create new memory file |
| DELETE | `/api/memory/delete` | Delete memory file |

### Vector Memory (LanceDB)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/memory/vector/available` | Check if vector memory is available |
| GET | `/api/memory/vector/stats` | Vector memory statistics |
| GET | `/api/memory/vector/list` | List vector memories |
| GET | `/api/memory/vector/search` | Semantic search in vector memory |
| POST | `/api/memory/vector/store` | Store a new vector memory |
| DELETE | `/api/memory/vector/delete` | Delete a vector memory by ID |

### Honcho Memory

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/memory/honcho/status` | Check if Honcho memory is configured |
| GET | `/api/memory/honcho/stats` | Honcho memory statistics |
| GET | `/api/memory/honcho/profile` | Honcho user profile |
| GET | `/api/memory/honcho/memories?limit=N` | List recent Honcho sessions |
| GET | `/api/memory/honcho/search?q=...&top_k=N` | Semantic search in Honcho memory |

### Claude Code Integration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/claude-code/active` | List active Claude Code tmux sessions |
| GET | `/api/claude-code/history?limit=N&project=...` | List past sessions |
| GET | `/api/claude-code/stats` | Claude Code statistics |
| GET | `/api/claude-code/projects` | List all Claude Code projects |
| GET | `/api/claude-code/output?session=...&lines=N` | Capture current tmux output |
| GET | `/api/claude-code/session/{id}/messages?limit=N` | Read session JSONL messages |
| POST | `/api/claude-code/new` | Create a new Claude Code tmux session |
| POST | `/api/claude-code/send` | Send text to a session |
| POST | `/api/claude-code/stop` | Send Ctrl+C to a session |
| DELETE | `/api/claude-code/session` | Kill a tmux session |

### Environment Variables

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/env-vars/list` | List all environment variables |
| PUT | `/api/env-vars/set` | Set or update an environment variable |
| DELETE | `/api/env-vars/delete` | Delete an environment variable |
| GET | `/api/env-vars/required` | List required environment variables with status |

### MCP Servers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/mcp/list` | List configured MCP servers |
| POST | `/api/mcp/add` | Add a new MCP server |
| DELETE | `/api/mcp/remove` | Remove an MCP server |
| POST | `/api/mcp/test` | Test connection to an MCP server |

### Plugins

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/plugins/list` | List installed plugins |
| POST | `/api/plugins/install` | Install a plugin from Git URL |
| POST | `/api/plugins/remove` | Remove a plugin |
| POST | `/api/plugins/enable` | Enable a plugin |
| POST | `/api/plugins/disable` | Disable a plugin |
| POST | `/api/plugins/update` | Update a plugin to latest version |

### Auth & Pairing

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth-pairing/list` | List pending pairing codes and approved users |
| POST | `/api/auth-pairing/approve` | Approve a pending pairing code |
| POST | `/api/auth-pairing/revoke` | Revoke an approved user |
| POST | `/api/auth-pairing/clear-pending` | Clear all pending pairing codes |

### Profiles

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/profiles/list` | List all Hermes profiles |
| POST | `/api/profiles/create` | Create a new profile |
| POST | `/api/profiles/use` | Set a profile as active |
| POST | `/api/profiles/rename` | Rename a profile |
| DELETE | `/api/profiles/delete` | Delete a profile |
| POST | `/api/profiles/export` | Export a profile to archive |

### Backup & Restore

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/backup/create` | Create a backup archive |
| GET | `/api/backup/list` | List available backups |
| POST | `/api/backup/restore` | Restore from a backup |
| DELETE | `/api/backup/delete` | Delete a backup |
| GET | `/api/backup/download/{filename}` | Download a backup archive |

### API Keys

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-keys` | List all API key definitions |
| POST | `/api/api-keys/set` | Set an API key value |
| POST | `/api/api-keys/delete` | Remove an API key |

### Fine-Tune

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/fine-tune/available` | Check if fine-tune data exists |
| GET | `/api/fine-tune/pairs` | List voice + transcription pairs |
| PUT | `/api/fine-tune/pairs/{base_name}` | Update a pair's transcript |
| DELETE | `/api/fine-tune/pairs/{base_name}` | Delete a pair |
| GET | `/api/fine-tune/stats` | Global fine-tune statistics |
| GET | `/api/fine-tune/audio/{date}/{base_name}` | Serve audio file |

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

### Diagnostics

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/diagnostics/run` | Run full diagnostics |
| GET | `/api/diagnostics/quick` | Quick health checks |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/webhooks/list` | List configured webhooks |
| POST | `/api/webhooks/create` | Create a new webhook |
| DELETE | `/api/webhooks/delete` | Delete a webhook |

### WebSocket

| Protocol | Endpoint | Description |
|----------|----------|-------------|
| WS | `/ws/terminal` | Interactive PTY terminal session |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check (always unauthenticated) |

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
  -e HERMES_DASHBOARD_TOKEN=*** \
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

### Testing

```bash
cd frontend
npm test              # Run tests with Vitest
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HERMES_DASHBOARD_TOKEN` | _(none)_ | Bearer token for API gateway authentication. If not set, all access is open |
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
├── README.md
├── systemd/
│   └── hermes-dashboard.service
├── backend/
│   ├── requirements.txt
│   ├── static/                        # Built frontend (generated)
│   └── app/
│       ├── __init__.py
│       ├── main.py                    # FastAPI app, CORS, auth, security, static serving
│       ├── config.py                  # Environment & config loading
│       ├── auth.py                    # Bearer token middleware
│       ├── utils.py                   # hermes_path(), run_hermes(), mask_secrets()
│       └── routers/
│           ├── overview.py            # Dashboard overview, logs, system metrics, version
│           ├── config.py              # Config CRUD, MOA config & providers
│           ├── sessions.py            # Session management
│           ├── memory.py              # SOUL.md, MEMORY.md, memory files, vector, Honcho
│           ├── tools.py               # Tool listing, enable/disable, config
│           ├── skills.py              # Skill management & Skills Hub
│           ├── skills_security.py     # Skills security checks
│           ├── cron.py                # Cron job management
│           ├── models.py              # Model info & switching
│           ├── platforms.py           # Platform status, pairing, configure
│           ├── insights.py            # Usage analytics
│           ├── chat.py                # Chat sessions & SSE streaming
│           ├── files.py               # File browser & editor
│           ├── terminal.py            # WebSocket PTY terminal
│           ├── api_keys.py            # API key management
│           ├── fine_tune.py           # Fine-tune voice + transcription pairs
│           ├── gateway.py             # Gateway service control, logs, SSE streaming
│           ├── diagnostics.py         # Health checks, hermes doctor
│           ├── webhooks.py            # Webhook management
│           ├── env_vars.py            # Environment variables management
│           ├── plugins_router.py      # Plugin management
│           ├── mcp.py                 # MCP server management
│           ├── mcp_oauth.py           # MCP OAuth authentication flow
│           ├── auth_pairing.py        # Device pairing
│           ├── profiles.py            # Profile management
│           ├── backup.py              # Backup & restore
│           ├── claude_code.py         # Claude Code integration
│           ├── projects.py            # Project tracking CRUD
│           ├── backlog.py             # Task backlog with autofeed
│           ├── wiki.py                # Knowledge base pages
│           ├── leads.py               # CRM lead pipeline
│           ├── users.py               # User accounts, JWT auth, roles
│           ├── activity.py            # Audit log
│           ├── search.py              # Global search
│           ├── search_history.py      # Search query history
│           ├── tags.py                # Cross-entity tagging
│           ├── notifications.py       # Notification system
│           ├── export.py              # Data export
│           ├── context.py             # AI conversation context
│           ├── context_status.py      # Real-time context status
│           ├── code_execution.py      # Code execution sandbox
│           ├── delegation.py          # Task delegation
│           ├── approvals.py           # Approval workflows
│           ├── vision.py              # Computer vision
│           ├── rl_training.py         # RL training jobs
│           ├── tts_test.py            # TTS testing
│           ├── discord_listings.py    # Discord integration
│           └── github_config.py       # GitHub configuration
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── eslint.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── api.js                     # Centralized API client
        ├── index.css                  # Global styles & CSS custom properties
        ├── utils/
        │   └── format.js             # Formatting utilities
        ├── hooks/
        │   ├── useApi.js             # TanStack Query hooks for all endpoints
        │   └── useWebSocket.js       # WebSocket connection hook
        ├── contexts/
        │   ├── ThemeContext.jsx       # Dark/light theme provider
        │   └── ToastContext.jsx       # Toast notification provider
        ├── components/
        │   ├── Tooltip.jsx            # Reusable tooltip
        │   ├── ConfirmModal.jsx       # Confirmation dialog
        │   ├── ErrorBoundary.jsx      # Error boundary
        │   ├── PageErrorBoundary.jsx  # Per-page error boundary
        │   ├── CommandPalette.jsx     # Ctrl+K command palette
        │   ├── GlobalSearch.jsx       # Global search bar
        │   ├── TagSelector.jsx        # Cross-entity tag picker
        │   ├── NotificationBell.jsx   # Notification indicator
        │   ├── AutofeedIndicator.jsx  # Backlog autofeed status
        │   ├── PageHeader.jsx         # Reusable page header
        │   └── EmptyState.jsx         # Empty state placeholder
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
            ├── MemorySoul.jsx         # Multi-tab: MD Files, Vector Memory, Honcho
            ├── Models.jsx
            ├── Platforms.jsx
            ├── ApiKeys.jsx
            ├── FineTune.jsx
            ├── Insights.jsx
            ├── GatewayControl.jsx
            ├── Diagnostics.jsx
            ├── Webhooks.jsx
            ├── EnvVars.jsx
            ├── Plugins.jsx
            ├── McpServers.jsx
            ├── AuthPairing.jsx
            ├── Profiles.jsx
            ├── BackupRestore.jsx
            ├── ClaudeCode.jsx
            ├── MoaConfig.jsx
            ├── Projects.jsx           # Project tracking
            ├── Backlog.jsx            # Task backlog with autofeed
            ├── Wiki.jsx               # Knowledge base
            ├── Leads.jsx              # CRM pipeline
            ├── Users.jsx              # User administration
            ├── Activity.jsx           # Audit log
            ├── SearchHistory.jsx      # Search history
            ├── Login.jsx              # Authentication
            ├── Register.jsx           # User registration
            └── NotFound.jsx           # 404 page
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

---

## Francais — Resume du projet

**Hermes Dashboard** est une interface web d'administration pour [Hermes Agent](https://github.com/nousresearch/hermes-agent), l'agent IA de Nous Research. Configuration, surveillance et gestion complete depuis un navigateur.

### Chiffres cles

- **47 routeurs** API backend (FastAPI)
- **37 pages** frontend (React 19 + Vite 8)
- Authentification JWT avec gestion des roles (admin/user)
- Palette de commandes (Ctrl+K), recherche globale, notifications

### Fonctionnalites principales

- **Gestion de projets** : CRUD avec types, statuts, tags, liens GitHub
- **Backlog intelligent** : taches avec autofeed LLM (scan de sources, suggestions automatisees)
- **Wiki** : base de connaissances structuree (entites, concepts, comparaisons, requetes)
- **CRM/Leads** : pipeline commercial (new → won/lost) avec statistiques
- **Gestion utilisateurs** : inscription, approbation, roles admin/user
- **Claude Code** : surveillance et controle des sessions tmux
- **MOA** : Mixture of Agents multi-fournisseur avec test de connexion
- **MCP** : gestion des serveurs Model Context Protocol
- **Memoire multi-providers** : fichiers Markdown, LanceDB (vectoriel), Honcho (cloud)
- **Terminal integre** : emulateur via WebSocket (xterm.js)
- **Plugins, profils, sauvegardes, webhooks, cron jobs**
- **Analytics** : insights d'utilisation, journal d'activite, historique de recherche

### Installation rapide

```bash
git clone https://github.com/duan78/hermes-dashboard.git
cd hermes-dashboard
pip install -r backend/requirements.txt
cd frontend && npm install && npm run build && cd ..
PYTHONPATH=. python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 3100
```

Ouvrir [http://127.0.0.1:3100](http://127.0.0.1:3100).
