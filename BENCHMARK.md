# Hermes Dashboard — Competitive Benchmark

## Current State

### Pages (14 pages, 13 routers)
| Page | Status | Description |
|------|--------|-------------|
| Overview | ✅ Working | Gateway health, uptime, model, session count, logs |
| Chat | ✅ Working | Full chat interface with streaming, session history |
| Configuration | ✅ Working | YAML config editor, structured config, sections |
| Sessions | ✅ Working | Session list, detail view, prune, stats |
| Files | ✅ Working | File browser, tree view, read/write files |
| Terminal | ✅ Working | WebSocket terminal emulator |
| Tools | ✅ Working | Tool listing, enable/disable per platform |
| Skills | ✅ Working | Installed skills, enable/disable |
| Skills Hub | ✅ Working | Browse, search, install skills from registry |
| Cron Jobs | ✅ Working | List, create, pause/resume, run, delete |
| Memory & SOUL | ✅ Working | SOUL.md + MEMORY.md editor, memory file browser |
| Models | ✅ Working | Current model, available models, switch |
| Platforms | ✅ Working | Platform status (Telegram, Discord, etc.), channels, pairing |
| Insights | ✅ Working | Usage analytics (sessions, tokens, costs, activity patterns) |

### Tech Stack
- Backend: FastAPI (Python), 13 routers
- Frontend: React + Vite, Lucide icons, custom CSS
- Auth: JWT token-based
- Terminal: WebSocket (xterm.js)

---

## Competitive Landscape

### 1. Cline (59.8k ⭐)
**Type:** VS Code extension (IDE-embedded)

**Key Features:**
- ✅ Chat interface with task history
- ✅ File creation/editing with diff view
- ✅ Terminal command execution (VS Code shell integration)
- ✅ Browser automation (headless browser for testing)
- ✅ MCP (Model Context Protocol) support
- ✅ Multi-provider model support (OpenRouter, Anthropic, OpenAI, Gemini, Bedrock, Azure, Vertex, Cerebras, Groq, Ollama, LM Studio)
- ✅ Token + cost tracking per task and total
- ✅ Permission system (approve each action)
- ✅ Image/screenshot support (paste mockups → code)
- ✅ Linter/compiler error monitoring
- ✅ Git integration (auto-commits)
- ✅ `.clinerules` project-level config
- ✅ Skills system (`.agents/skills/`)
- ✅ Multi-language README (7 languages)
- ✅ Diff view editing + Timeline tracking
- ✅ Long-running process support ("Proceed While Running")

**What we DON'T have:**
- ❌ Diff view for file changes
- ❌ Git integration (commit history, branch management)
- ❌ Permission/approval UI per action
- ❌ Linter error monitoring
- ❌ Screenshot/image upload in chat

---

### 2. OpenHands (OpenDevin) (45k+ ⭐)
**Type:** Web GUI + CLI + SDK

**Key Features:**
- ✅ Web-based chat interface
- ✅ File browser + editor
- ✅ Terminal execution in sandboxed environment
- ✅ Multi-provider model support
- ✅ REST API + React SPA
- ✅ **Cloud version** with multi-user, RBAC, permissions
- ✅ **Slack, Jira, Linear integrations**
- ✅ **Collaboration features** (conversation sharing)
- ✅ Docker-based execution sandbox
- ✅ Chrome extension
- ✅ Theory-of-Mind module
- ✅ SDK for programmatic use
- ✅ Enterprise version (Kubernetes deployment)
- ✅ Multi-language README (9 languages)

**What we DON'T have:**
- ❌ Multi-user support / RBAC
- ❌ Conversation sharing
- ❌ External integrations (Jira, Linear, Slack)
- ❌ Docker sandbox execution
- ❌ SDK/API for programmatic use
- ❌ User management

---

### 3. Aider (28k+ ⭐)
**Type:** Terminal TUI

**Key Features:**
- ✅ Terminal chat interface
- ✅ Auto file editing with SEARCH/REPLACE blocks
- ✅ Multi-provider model support (Anthropic, OpenAI, local)
- ✅ Git auto-commits per edit
- ✅ Repo-map (automatic codebase context)
- ✅ Lint/test commands (auto-run after edits)
- ✅ Voice-to-code
- ✅ Image + URL input
- ✅ Prompt caching
- ✅ IDE integration (VS Code, Neovim)
- ✅ Browser mode
- ✅ Notifications
- ✅ Coding conventions config
- ✅ `/commands` system (similar to our slash commands)
- ✅ LLM Leaderboards

**What we DON'T have:**
- ❌ Voice-to-code
- ❌ Auto git commits
- ❌ Lint/test auto-run
- ❌ Repo-map / codebase context visualization
- ❌ Image/URL input in chat

---

### 4. Claude Code CLI (Anthropic)
**Type:** Terminal TUI

**Key Features:**
- ✅ Terminal chat with rich formatting
- ✅ File read/write/search/patch
- ✅ Terminal command execution
- ✅ Browser automation (Browserbase)
- ✅ Git integration (diff, commit, PR)
- ✅ MCP support
- ✅ Permission modes (auto, plan, approve)
- ✅ Context window management (auto-summarization)
- ✅ Multi-turn conversations
- ✅ `/commands` system
- ✅ Memory system (CLAUDE.md)
- ✅ Background agents (headless mode)
- ✅ JSON output mode
- ✅ Token tracking

**What we DON'T have (but should):**
- ❌ Git integration in dashboard
- ❌ Permission mode visualization
- ❌ Background agent monitoring
- ❌ Context window usage visualization

---

### 5. Cursor / Windsurf Cascade
**Type:** IDE (forked VS Code)

**Key Features:**
- ✅ Chat interface embedded in IDE
- ✅ File editing with inline diff
- ✅ Multi-file editing
- ✅ Codebase indexing (embeddings)
- ✅ @-mentions (files, symbols, docs, web)
- ✅ Agent mode (autonomous multi-step)
- ✅ Tab completion ( Copilot++ )
- ✅ Terminal integration
- ✅ Git integration
- ✅ Rules system (.cursorrules)
- ❌ No standalone dashboard/web UI

**What we DON'T have:**
- ❌ Codebase indexing/search
- ❌ @-mentions system
- ❌ Multi-file editing visualization

---

## Feature Gap Analysis — What to Add

### HIGH PRIORITY (makes dashboard competitive)
| Feature | Cline | OpenHands | Aider | Claude Code | Us |
|---------|:-----:|:---------:|:-----:|:-----------:|:--:|
| **Git integration** (commit history, diff, branches) | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Real-time activity feed** (live tool calls, agent actions) | ✅ | ✅ | — | ✅ | ⚠️ partial |
| **Token usage dashboard** (per-session, per-model, costs) | ✅ | — | — | ✅ | ⚠️ partial |
| **Dark/Light theme** | ✅ | ✅ | — | ✅ | ⚠️ dark only |
| **Search across sessions** | — | — | — | — | ❌ |

### MEDIUM PRIORITY (nice to have)
| Feature | Cline | OpenHands | Aider | Claude Code | Us |
|---------|:-----:|:---------:|:-----:|:-----------:|:--:|
| **Image upload in chat** | ✅ | — | ✅ | — | ❌ |
| **Markdown rendering** (chat messages) | ✅ | ✅ | — | ✅ | ⚠️ partial |
| **Conversation export** (JSON, Markdown) | — | ✅ | — | — | ❌ |
| **Notification center** (alerts, errors) | — | — | ✅ | — | ❌ |
| **Keyboard shortcuts** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Settings/Preferences page** | ✅ | ✅ | — | — | ⚠️ config page |
| **Provider/API key management** | ✅ | ✅ | ✅ | ✅ | ⚠️ partial |

### LOW PRIORITY (differentiator features)
| Feature | Description |
|---------|-------------|
| **Multi-user / RBAC** | OpenHands Cloud feature — not needed for open-source single-user |
| **Plugin system** | MCP-like extensibility from dashboard |
| **Mobile responsive** | PWA or responsive layout for phone/tablet |
| **Webhook management** | Configure webhooks for events |
| **Backup/Restore** | Export/import all Hermes config |

---

## Proposed Feature Roadmap

### Phase 1 — Must Have (before GitHub open-source)
1. **Git Integration Page** — commit log, diff viewer, branch selector
2. **Live Activity Feed** — real-time WebSocket feed of agent actions
3. **Token Usage Dashboard** — per-session, per-model, cost charts
4. **Dark/Light Theme Toggle** — with system preference detection
5. **Session Search** — full-text search across all sessions
6. **English-first labels** — already done, verify all pages

### Phase 2 — Should Have
7. **Image Upload in Chat** — paste/drag images
8. **Conversation Export** — JSON, Markdown, PDF
9. **Notification Center** — alerts badge, error log
10. **Keyboard Shortcuts** — global shortcuts page
11. **Markdown Rendering** — full markdown in chat responses
12. **Provider Management** — add/edit/remove API providers + keys

### Phase 3 — Nice to Have
13. **Mobile Responsive Layout** — sidebar collapse, touch-friendly
14. **Settings Page** — user preferences (theme, language, default model)
15. **Webhook Configuration** — create/manage webhooks
16. **Backup/Restore** — export/import config, memory, skills
17. **Plugin Marketplace** — browse and install MCP servers

---

## Language / i18n Status

**Current state:** The dashboard is already **English-first**. All labels, tooltips, and UI text are in English.

**What's needed:**
- No i18n framework currently installed (no react-i18next, no locale files)
- For v1 open-source: English-only is fine
- For v2: add react-i18next with en.json + fr.json
- Structure: extract all hardcoded strings to translation keys
- Sidebar labels are in English: Overview, Chat, Configuration, Sessions, Files, Terminal, Tools, Skills, Skills Hub, Cron Jobs, Memory & SOUL, Models, Platforms, Insights ✅

---

## Summary

**Hermes Dashboard strengths vs competition:**
- More comprehensive than any single competitor
- Only dashboard that covers ALL aspects: chat, config, sessions, tools, skills, cron, memory, models, platforms, insights, files, terminal
- WebSocket terminal built-in
- Skills Hub with install/browse
- Cron job management
- Memory/SOUL editing

**Gaps to close before open-source:**
- Git integration (biggest gap — every competitor has it)
- Token usage visualization (we have raw data in Insights, need charts)
- Dark/Light theme toggle
- Session search
