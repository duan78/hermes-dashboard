# AUDIT COMPLET 2026 — Hermes Dashboard

**Date :** 2026-04-07  
**Repo :** https://github.com/duan78/hermes-dashboard  
**Auditor :** Sam (Hermes Agent)  
**Stack :** FastAPI (Python) + React (Vite + Tailwind)  
**Déploiement :** systemd + Nginx basic auth sur port 3100

---

## TABLEAU DE BORD DES SCORES

| # | Critère | Score | Statut |
|---|---------|-------|--------|
| 1 | Backend — Architecture & Code | 6.5/10 | 🟡 |
| 2 | Backend — Sécurité | 5.0/10 | 🔴 |
| 3 | Backend — API Design | 6.0/10 | 🟡 |
| 4 | Frontend — Architecture & Code | 6.0/10 | 🟡 |
| 5 | Frontend — Performance | 4.5/10 | 🔴 |
| 6 | Features — Couverture Hermes | 9.0/10 | 🟢 |
| 7 | UX / UI | 7.5/10 | 🟢 |
| 8 | React — Bonnes pratiques | 6.5/10 | 🟡 |
| 9 | DevOps & Déploiement | 6.0/10 | 🟡 |
| 10 | Documentation | 8.5/10 | 🟢 |
| | **SCORE GLOBAL** | **6.6/10** | 🟡 |

---

## RÉPARTITION PAR PILIER

| Piler | Score | Critères |
|-------|-------|----------|
| **Backend** | 5.8/10 | Architecture 6.5, Sécurité 5, API Design 6 |
| **Frontend** | 5.7/10 | Architecture 6, Performance 4.5, React 6.5 |
| **Fonctionnel** | 9.0/10 | Features 9 (25 routeurs, 27 pages) |
| **UX/Docs** | 8.0/10 | UX 7.5, Documentation 8.5 |
| **DevOps** | 6.0/10 | Déploiement 6 |

---

## TOP 10 ACTIONS PRIORITAIRES

| # | Action | Critère | Impact | Effort |
|---|--------|---------|--------|--------|
| 1 | **Sécuriser le WebSocket terminal** | Sécurité | CRITIQUE — root shell sans auth | Moyen |
| 2 | **Ajouter Error Boundaries React** | React | App entière crash sur erreur | Faible |
| 3 | **Code splitting (React.lazy)** | Performance | 1 MB JS → ~300 KB au chargement | Moyen |
| 4 | **Ajouter rate limiting** | Sécurité | Protection brute-force/DDoS | Faible |
| 5 | **Ajouter Pydantic models** | API | Validation inputs + Swagger docs | Moyen |
| 6 | **Ajouter tests (Vitest)** | React | 0 tests sur 10 362 lignes JSX | Moyen |
| 7 | **Fix auto-deploy (utiliser systemctl)** | DevOps | Bypass systemd, kill + nohup | Faible |
| 8 | **Ajouter security headers Nginx** | DevOps | X-Frame-Options, CSP, etc. | Faible |
| 9 | **Logging backend** | Architecture | 0 log, impossible de debugger | Faible |
| 10 | **Lazy load xterm.js + react-markdown** | Performance | Chargés pour tout le monde | Faible |

---

     1|# Hermes Dashboard — Audit Part 1
     2|
     3|**Date:** 2026-04-07  
     4|**Scope:** Backend Architecture, Security, API Design, Frontend Architecture, Frontend Performance  
     5|**Auditor:** Automated code audit (read-only)
     6|
     7|---
     8|
     9|## 1. Backend — Architecture & Code
    10|
    11|**Score: 6.5 / 10**
    12|
    13|### Structure Overview
    14|
    15|| File | Lines | Role |
    16||---|---|---|
    17|| `main.py` | 238 | Entry point, middleware, CORS, static files, WebSocket terminal |
    18|| `config.py` | 16 | Configuration (env vars, paths) |
    19|| `auth.py` | 25 | Bearer token auth middleware |
    20|| `utils.py` | 59 | Helpers: `run_hermes()`, `mask_secrets()`, `hermes_path()` |
    21|| `routers/` (22 files) | ~4,500+ | API route handlers |
    22|| `requirements.txt` | 6 | Dependencies |
    23|
    24|### Positive Findings
    25|
    26|- **Clean separation**: Each domain (sessions, memory, skills, etc.) has its own router file under `backend/app/routers/`.
    27|- **Centralized auth**: Single `AuthMiddleware` in `auth.py` applied via `app.add_middleware()`.
    28|- **Secret masking**: `mask_secrets()` in `utils.py` recursively masks values in keys matching `api_key|token|secret|password|auth` patterns.
    29|- **Path traversal protection**: `files.py` has `_resolve_path()` that validates resolved paths stay within `HERMES_HOME`.
    30|- **Async throughout**: All route handlers use `async def`; subprocess calls use `asyncio.create_subprocess_exec` with timeouts.
    31|- **Atomic writes**: `api_keys.py` uses `tempfile.mkstemp` + `os.replace` for safe `.env` file writes. `fine_tune.py` also uses atomic `.tmp` + `os.replace`.
    32|
    33|### Issues Found
    34|
    35|| # | Severity | Finding | Location |
    36||---|---|---|---|
    37|| 1 | HIGH | **Blocking subprocess in claude_code.py**: Uses `subprocess.run()` (synchronous) instead of `asyncio.create_subprocess_exec`, blocking the event loop | `routers/claude_code.py:20,173-212` |
    38|| 2 | HIGH | **`sys.path` manipulation**: `memory.py` mutates `sys.path` at import time to inject `HERMES_MEMORY_PATH`, risking import conflicts | `routers/memory.py:26` |
    39|| 3 | MEDIUM | **No logging**: Zero `logging` calls anywhere in the backend. All errors are returned as JSON or silently caught. No access logs, no audit trail. | All files |
    40|| 4 | MEDIUM | **Duplicate terminal WebSocket**: Both `main.py` (line 114) and `routers/terminal.py` (line 11) register `/ws/terminal`. The one in `main.py` wins, making the router dead code. | `main.py:114`, `terminal.py:11` |
    41|| 5 | MEDIUM | **Inline imports**: Multiple files do `import yaml`, `import json`, `import time` inside functions instead of at module level (e.g., `overview.py:48`, `chat.py:25,55,137`). While harmless for performance, it signals incomplete refactoring. | Multiple routers |
    42|| 6 | MEDIUM | **Config reads config.yaml on every request**: `chat.py` calls `_get_gateway_url()`, `_get_api_key()`, `_get_model()` on every chat message, each parsing `config.yaml` from disk. No caching. | `routers/chat.py:39-63` |
    43|| 7 | LOW | **Health check exposes `HERMES_HOME` path**: `/api/health` returns the absolute server path in `hermes_home` field | `main.py:81` |
    44|| 8 | LOW | **No docstrings on router functions**: Many endpoints lack docstrings (e.g., `cron.py`, `env_vars.py`, `profiles.py`). Only some have them. | Multiple routers |
    45|| 9 | LOW | **`__import__("time")` and `__import__("datetime")`**: Used inline in `chat.py:75,92` instead of proper imports | `routers/chat.py` |
    46|| 10 | LOW | **Minimal typing**: No Pydantic models for request/response bodies. All use raw `dict` with `Body(...)`. No response models. | All routers |
    47|
    48|### Architecture Summary
    49|
    50|The backend follows a reasonable flat-router pattern but lacks several production-hardening features: no logging, no input validation models (Pydantic), no caching, and at least one blocking call. The 22 routers are well-organized but there's significant code duplication (e.g., env var reading in `api_keys.py`, `env_vars.py`, `tools.py`, `platforms.py`).
    51|
    52|---
    53|
    54|## 2. Backend — Security
    55|
    56|**Score: 5.0 / 10**
    57|
    58|### Positive Findings
    59|
    60|| Measure | Status | Details |
    61||---|---|---|
    62|| Auth middleware | ✅ | Bearer token auth on all `/api/*` routes (except `/api/health`) |
    63|| Path traversal protection | ✅ | `files.py:_resolve_path()` and `memory.py:_resolve_path()` validate paths stay within `HERMES_HOME` |
    64|| Secret masking | ✅ | `mask_secrets()` masks API keys/tokens in config responses |
    65|| Security headers | ✅ | `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `CSP` middleware |
    66|| Input allowlists | ✅ | `api_keys.py` validates keys against `API_KEY_DEFINITIONS` allowlist |
    67|| Atomic file writes | ✅ | `.env` writes use temp file + `os.replace` |
    68|| File permissions | ✅ | `.env` file set to `0600` after writes |
    69|
    70|### Critical Issues
    71|
    72|| # | Severity | Finding | Details |
    73||---|---|---|---|
    74|| 1 | **CRITICAL** | **Unauthenticated terminal WebSocket**: The `/ws/terminal` endpoint bypasses `AuthMiddleware` because WebSocket connections don't go through the HTTP middleware chain. Anyone who can reach the WS endpoint gets a root shell. | `main.py:114-217` |
    75|| 2 | **CRITICAL** | **Full shell access via API**: The terminal WebSocket spawns an interactive shell with the full environment (`os.environ`), `HERMES_HOME` parent as HOME, and no command restrictions. Even behind Nginx auth, if the Nginx proxy_pass doesn't block WS, this is a root shell. | `main.py:131-144` |
    76|| 3 | **HIGH** | **No rate limiting**: Zero rate limiting on any endpoint. An attacker can brute-force the dashboard token, spam chat requests (each proxying to paid LLM APIs), or enumerate files. | All routes |
    77|| 4 | **HIGH** | **`HERMES_HOME` exposed in health endpoint**: `/api/health` is unauthenticated and returns the server filesystem path (`hermes_home`). Information disclosure. | `main.py:81` |
    78|| 5 | **HIGH** | **No session_id validation in chat/sessions**: `chat.py` accepts arbitrary `session_id` values. A user could read/append to any session by guessing IDs (8-char UUID prefixes). | `routers/chat.py:106`, `routers/sessions.py:168-200` |
    79|| 6 | **HIGH** | **`claude_code.py` command injection**: `subprocess.run(["tmux", "send-keys", "-t", session, "-l", "--", message])` and `workdir` parameter passed to tmux commands without validation. An attacker with API access could inject tmux commands. | `routers/claude_code.py:184,199` |
    80|| 7 | **MEDIUM** | **CORS allows `allow_methods=["*"]` and `allow_headers=["*"]`**: Overly permissive CORS in development config. Should be restricted to specific methods/headers. | `main.py:54-55` |
    81|| 8 | **MEDIUM** | **`raw_yaml` returned in config endpoint**: `GET /api/config` returns both masked config AND the raw YAML text, which may contain unmasked secrets depending on the YAML parser. | `routers/config.py:23` |
    82|| 9 | **MEDIUM** | **API key fallback in chat**: When the gateway is unavailable, `chat.py` falls back to direct LLM API calls, reading the API key from config.yaml. The API key itself is passed in the Authorization header to external services. If the config is compromised, all API calls are exposed. | `routers/chat.py:136-158` |
    83|| 10 | **MEDIUM** | **No request body size limits**: File write endpoint `PUT /api/files/write` and config save have no body size limits. Could be used to fill disk. | `routers/files.py:144`, `routers/config.py:27` |
    84|| 11 | **LOW** | **Backup includes `.env`**: `backup.py` includes the `.env` file (containing all API keys) in backup archives by default. If a backup is downloaded, all secrets are exposed. | `routers/backup.py:38` |
    85|| 12 | **LOW** | **`chat_stop` is a no-op**: `POST /api/chat/stop` always returns `{"status": "stopped"}` without actually stopping anything. Gives false sense of control. | `routers/chat.py:169-171` |
    86|
    87|### Security Headers Analysis
    88|
    89|```
    90|X-Content-Type-Options: nosniff       ✅ Good
    91|X-Frame-Options: DENY                 ✅ Good
    92|X-XSS-Protection: 1; mode=block       ⚠️ Deprecated (modern browsers use CSP)
    93|Content-Security-Policy:              ✅ Present but weak
    94|  - 'unsafe-inline' in script-src     ⚠️ Allows inline scripts
    95|  - No nonce/hash-based CSP           ⚠️ Could be stronger
    96|  - connect-src allows 127.0.0.1:*    ⚠️ Very permissive
    97|```
    98|
    99|---
   100|
   101|## 3. Backend — API Design
   102|
   103|**Score: 6.0 / 10**
   104|
   105|### Positive Findings
   106|
   107|| Aspect | Status | Details |
   108||---|---|---|
   109|| RESTful structure | ✅ | Routes follow `/api/{resource}` pattern |
   110|| OpenAPI/Swagger | ✅ | Auto-generated by FastAPI at `/docs` |
   111|| Tags | ✅ | Each router has a `tags` parameter |
   112|| JSON responses | ✅ | All endpoints return JSON |
   113|| Status codes | ✅ | 404, 400, 403, 500 used appropriately |
   114|
   115|### Issues Found
   116|
   117|| # | Severity | Finding | Location |
   118||---|---|---|---|
   119|| 1 | HIGH | **No input validation models**: All request bodies use `dict = Body(...)` with no Pydantic schemas. No type checking, no defaults, no field validation at the framework level. | All routers with `Body(...)` |
   120|| 2 | HIGH | **Inconsistent error handling**: Some endpoints raise `HTTPException`, others return `{"error": ...}` with 200 status. Example: `chat_send` returns `{"error": "..."}` with implicit 200; `chat_stream` also returns error objects on 200. | `routers/chat.py:110,159,245` |
   121|| 3 | HIGH | **Inconsistent HTTP methods**: `DELETE /api/memory/delete` uses DELETE with a body (non-standard). `POST /api/env-vars/set` and `PUT /api/env-vars/set` both exist for same operation. | Multiple routers |
   122|| 4 | MEDIUM | **No versioning**: All routes under `/api/` with no version prefix. Breaking changes require coordinated deploy. | All routes |
   123|| 5 | MEDIUM | **No pagination**: Session list, memory files, cron jobs, etc. return all items. Could be problematic with large datasets. | `sessions.py:list_sessions`, `memory.py:list_all_files` |
   124|| 6 | MEDIUM | **Duplicate API surface in `api.js`**: The frontend API client has both `deleteApiKey` (POST) and `envVarsDelete` (DELETE) for similar operations, reflecting backend inconsistency. | `frontend/src/api.js` |
   125|| 7 | MEDIUM | **Non-RESTful patterns**: `POST /api/config/set` should be `PATCH /api/config`; `POST /api/models/switch` should be `PATCH /api/models`; `POST /api/cron/{id}/pause` should be `PATCH /api/cron/{id}` | Multiple |
   126|| 8 | MEDIUM | **Missing response models**: No Pydantic response models. Return types are implicit dicts. No schema validation on output. | All routers |
   127|| 9 | LOW | **Inconsistent naming**: Mix of kebab-case (`api-keys`, `auth-pairing`, `claude-code`) and snake_case (`env_vars`, `fine_tune`). Some use plurals, some singular. | All routers |
   128|| 10 | LOW | **SPA fallback catches all**: `GET /{full_path:path}` serves `index.html` for any non-asset path, potentially masking 404s for API routes if not caught earlier. | `main.py:228-233` |
   129|
   130|### Endpoint Count Summary
   131|
   132|- **22 routers** registered
   133|- **~100+ endpoints** total
   134|- **1 WebSocket** endpoint (`/ws/terminal`)
   135|- **1 SSE streaming** endpoint (`/api/gateway/logs/stream`)
   136|
   137|---
   138|
   139|## 4. Frontend — Architecture & Code
   140|
   141|**Score: 6.0 / 10**
   142|
   143|### Structure Overview
   144|
   145|| Directory/File | Files | Purpose |
   146||---|---|---|
   147|| `src/App.jsx` | 1 | Root component: sidebar, routing, feature detection |
   148|| `src/main.jsx` | 1 | Entry point: React, HashRouter, ThemeProvider |
   149|| `src/api.js` | 1 | Centralized API client (258 lines, 130+ methods) |
   150|| `src/contexts/ThemeContext.jsx` | 1 | Dark/light theme context |
   151|| `src/components/` | 2 files | Tooltip component |
   152|| `src/pages/` | 27 files | Page components (all JSX) |
   153|| `src/pages/*.css` | 20 files | Page-specific styles |
   154|| `src/index.css` | 1 | Global styles (676 lines) |
   155|
   156|### Dependencies
   157|
   158|| Package | Purpose | Notes |
   159||---|---|---|
   160|| `react` 19.2 | UI framework | Latest major |
   161|| `react-router-dom` 7.13 | Routing | HashRouter (good for SPA behind proxy) |
   162|| `lucide-react` | Icons | Tree-shakeable |
   163|| `@xterm/xterm` + `addon-fit` | Terminal emulator | Good choice |
   164|| `react-markdown` + `remark-gfm` | Markdown rendering | Chat messages |
   165|| `vite` 8.0 | Build tool | Latest |
   166|
   167|### Positive Findings
   168|
   169|- **Centralized API client**: Single `api.js` with consistent error handling, auth token injection, and 401 event dispatch.
   170|- **HashRouter**: Correct choice for SPA served behind Nginx reverse proxy (avoids 404 on refresh).
   171|- **Feature-gated navigation**: MOA and FineTune nav items are conditionally shown based on feature detection.
   172|- **Responsive sidebar**: Mobile toggle with hamburger menu.
   173|- **Theme support**: Dark/light mode with localStorage persistence and system preference detection.
   174|- **Well-structured Tooltip component**: Viewport-aware positioning with `useCallback` and `useEffect` cleanup.
   175|- **Consistent page patterns**: Each page follows `useState` + `useEffect` + `api.*` calls pattern.
   176|
   177|### Issues Found
   178|
   179|| # | Severity | Finding | Details |
   180||---|---|---|---|
   181|| 1 | **HIGH** | **No Error Boundaries**: Zero error boundaries in the entire app. Any runtime error in any component crashes the whole application with a white screen. | No `ErrorBoundary` component found |
   182|| 2 | **HIGH** | **JavaScript (no TypeScript)**: Entire frontend is plain JSX with no type safety. Props, API responses, and state are all untyped. Given 27 pages with complex state, this is a significant maintainability risk. | All `.jsx` files |
   183|| 3 | **HIGH** | **All pages loaded eagerly**: No code splitting or lazy loading. All 27 page components are imported synchronously in `App.jsx`. The entire app loads at once. | `App.jsx:10-36` |
   184|| 4 | **MEDIUM** | **No shared component library**: Only 2 shared components (`Tooltip`, `ThemeToggle`). Every page reimplements common patterns (loading states, error messages, tables, modals, confirm dialogs). Massive code duplication. | `src/components/` |
   185|| 5 | **MEDIUM** | **No data fetching abstraction**: Each page manually calls `api.*` in `useEffect` with its own loading/error state management. No SWR, React Query, or custom hooks for data fetching. | All pages |
   186|| 6 | **MEDIUM** | **API client duplicates**: `api.js` has duplicate method definitions (e.g., `deleteApiKey` + `envVarsDelete`, `listPlugins` + `pluginsList`, `mcpRemove` as both POST and DELETE). Confusing API surface. | `api.js:133-258` |
   187|| 7 | **MEDIUM** | **No form validation**: Input fields in Config, ApiKeys, Platforms, etc. have no client-side validation. Relies entirely on server 400 responses. | All forms |
   188|| 8 | **MEDIUM** | **Massive page components**: `MemorySoul.jsx` (998 lines), `MoaConfig.jsx` (868 lines), `SkillsHub.jsx` (682 lines), `Tools.jsx` (553 lines) are monolithic. No extraction of sub-components. | Large page files |
   189|| 9 | **LOW** | **CSS organization**: 6,158 lines of CSS across 21 files. No Tailwind utility classes used (despite no Tailwind config found either — pure custom CSS with CSS variables). Styles are scoped per-page but could benefit from a design system. | All `.css` files |
   190|| 10 | **LOW** | **Inline styles**: Some components use inline `style={{}}` objects (e.g., `Overview.jsx:19-27`) mixed with CSS classes. Inconsistent approach. | Various pages |
   191|
   192|### Code Quality Metrics
   193|
   194|| Metric | Value | Assessment |
   195||---|---|---|
   196|| TypeScript usage | 0% | ❌ All JSX, no types |
   197|| Shared components | 2 | ❌ Far too few for 27 pages |
   198|| Custom hooks | 0 | ❌ No hooks directory, no extracted hooks |
   199|| Code splitting | 0 | ❌ All eager imports |
   200|| Error boundaries | 0 | ❌ None |
   201|| Total JSX lines | ~9,700 | Large but manageable |
   202|| Total CSS lines | ~6,158 | Significant custom CSS |
   203|
   204|---
   205|
   206|## 5. Frontend — Performance
   207|
   208|**Score: 4.5 / 10**
   209|
   210|### Bundle Analysis
   211|
   212|| Asset | Size | Assessment |
   213||---|---|---|
   214|| `index-DrY1TW_U.js` | **1,009 KB (986 KB gzipped ~300 KB)** | ⚠️ Large single chunk |
   215|| `index-BGKaMvVd.css` | **83 KB** | ⚠️ Large but includes xterm CSS |
   216|| **Total** | **1,092 KB** | ⚠️ Over 1 MB initial load |
   217|
   218|### Detailed Performance Issues
   219|
   220|| # | Severity | Finding | Impact |
   221||---|---|---|---|
   222|| 1 | **CRITICAL** | **Single 1 MB JS bundle**: No code splitting at all. All 27 pages, xterm.js (heavy), react-markdown, and all icons are in one bundle. First meaningful paint is delayed by ~1 MB download. | High initial load time |
   223|| 2 | **HIGH** | **No lazy loading for routes**: `React.lazy()` not used anywhere. All page components, including rarely-used ones (Backup, Profiles, Claude Code, Diagnostics), are loaded on first visit. | Wasted bandwidth |
   224|| 3 | **HIGH** | **xterm.js loaded eagerly**: The `@xterm/xterm` library (~200 KB) is loaded even when the user never visits the Terminal page. | 200 KB wasted for most users |
   225|| 4 | **HIGH** | **react-markdown loaded eagerly**: Markdown rendering (~50 KB) loaded even for users who never use Chat. | 50 KB wasted |
   226|| 5 | **MEDIUM** | **No React.memo on list items**: Pages like Sessions, Files, Skills render lists of items. Without `React.memo`, changing any state re-renders all list items. | Unnecessary re-renders |
   227|| 6 | **MEDIUM** | **Overview auto-refresh every 10s**: System metrics polled every 10 seconds. No visibility-based pausing (Page Visibility API). Continues polling even when tab is backgrounded. | Unnecessary network requests |
   228|| 7 | **MEDIUM** | **No API response caching**: Every navigation to a page re-fetches all data. No stale-while-revalidate pattern. Navigating between Overview and back triggers full data reload. | Redundant API calls |
   229|| 8 | **MEDIUM** | **CSS not purged**: Vite build uses default CSS handling. The 83 KB CSS likely contains unused rules from xterm.css and page-specific styles loaded globally. | Wasted CSS bytes |
   230|| 9 | **LOW** | **No image optimization**: No images/assets found to optimize, but no preload hints for fonts or critical resources either. | Minor |
   231|| 10 | **LOW** | **useCallback used sparingly**: Only 62 `useCallback`/`useMemo` uses across 27 pages. Many event handlers passed as props are recreated on each render. | Minor re-render overhead |
   232|
   233|### Positive Performance Aspects
   234|
   235|- **HashRouter**: Avoids server round-trips on navigation
   236|- **Promise.all for parallel fetching**: Overview page fetches 4 APIs in parallel (`Promise.all`)
   237|- **Vite build**: Fast HMR in dev, efficient bundling
   238|- **Build output to `../backend/static`**: Eliminates deployment step
   239|
   240|### Estimated Performance Impact
   241|
   242|| Scenario | Current | With Fixes |
   243||---|---|---|
   244|| Initial load (no lazy) | ~1,092 KB | ~200 KB (core) + lazy chunks |
   245|| Terminal page visit | 0 KB extra | ~200 KB lazy load |
   246|| Chat page visit | 0 KB extra | ~80 KB lazy load |
   247|| Background tab (10 min) | 60 API calls | 0 (with visibility API) |
   248|
   249|---
   250|
   251|## Summary Scores
   252|
   253|| # | Category | Score | Key Issue |
   254||---|---|---|---|
   255|| 1 | Backend Architecture & Code | **6.5 / 10** | Blocking subprocess, no logging, no Pydantic models |
   256|| 2 | Backend Security | **5.0 / 10** | Unauthenticated WebSocket shell, no rate limiting, no request size limits |
   257|| 3 | Backend API Design | **6.0 / 10** | No input validation, inconsistent errors, no versioning |
   258|| 4 | Frontend Architecture & Code | **6.0 / 10** | No TypeScript, no error boundaries, no shared components, monolithic pages |
   259|| 5 | Frontend Performance | **4.5 / 10** | 1 MB single bundle, no code splitting, no caching |
   260|| | **Overall Average** | **5.6 / 10** | |
   261|
   262|---
   263|
   264|## Priority Recommendations
   265|
   266|### Immediate (Security)
   267|
   268|1. **Add authentication to WebSocket terminal** — either validate Bearer token in the WS handshake or require a one-time session token obtained via authenticated REST
   269|2. **Add rate limiting** — use `slowapi` or nginx `limit_req` to prevent brute-force and abuse
   270|3. **Add request body size limits** — cap file writes and config saves
   271|4. **Remove `hermes_home` from health endpoint** or make `/api/health` authenticated
   272|5. **Fix `claude_code.py` command injection** — validate `session` and `workdir` parameters
   273|
   274|### Short-term (Reliability)
   275|
   276|6. **Add Error Boundaries** in React (at minimum a root-level one)
   277|7. **Replace `subprocess.run` with `asyncio.create_subprocess_exec`** in `claude_code.py`
   278|8. **Add structured logging** (Python `logging` module) to all route handlers
   279|9. **Implement code splitting** with `React.lazy()` for heavy pages (Terminal, Chat, Claude Code)
   280|
   281|### Medium-term (Code Quality)
   282|
   283|10. **Introduce Pydantic models** for request/response validation
   284|11. **Extract shared components** (LoadingState, ErrorMessage, ConfirmDialog, DataTable)
   285|12. **Create custom data-fetching hooks** (useApi, usePolling)
   286|13. **Add TypeScript** (gradual migration with `.tsx`)
   287|14. **Consolidate duplicate API methods** in `api.js`
   288|

---

     1|# Hermes Dashboard — Audit Part 2
     2|
     3|> Date: 2026-04-07 | Auditeur: Hermes Agent (subagent)
     4|> Portée: Features, UX/UI, React Best Practices, DevOps, Documentation
     5|> Contrainte: Aucune modification de fichiers — analyse uniquement.
     6|
     7|---
     8|
     9|## 6. Features — Couverture Hermes Agent (Score: 9/10)
    10|
    11|### Mapping routeurs backend vs features Hermes
    12|
    13|| Feature Hermes | Routeur backend | Page frontend | Statut | Notes |
    14||---|---|---|---|---|
    15|| **Overview** | `overview.py` | `Overview.jsx` (412 lignes) | ✅ Complet | Stats, logs, métriques système, version, mise à jour, changelog |
    16|| **Configuration** | `config.py` | `Config.jsx` (486 lignes) | ✅ Complet | Sections éditables, raw YAML, dot-notation, structured save |
    17|| **MOA** | `config.py` (sous-routes `/moa`) | `MoaConfig.jsx` (868 lignes) | ✅ Complet | Reference models, aggregator, multi-provider, test connexion, coût estimé |
    18|| **Memory** | `memory.py` | `MemorySoul.jsx` (998 lignes) | ✅ Complet | 3 onglets : MD Files, Vector (LanceDB), Honcho — détection auto disponibilité |
    19|| **Fine-Tune** | `fine_tune.py` | `FineTune.jsx` (360 lignes) | ✅ Complet | Paires audio/transcript, playback, édition, stats. Caché si pas de données |
    20|| **Logs** | `gateway.py` | `GatewayControl.jsx` (340 lignes) | ✅ Complet | SSE streaming temps réel, filtrage par niveau/recherche, historique |
    21|| **Claude Code Monitor** | `claude_code.py` | `ClaudeCode.jsx` (385 lignes) | ✅ Complet | Tmux sessions, status temps réel, envoi messages, historique JSONL, stats |
    22|| **System / Gateway** | `gateway.py` | `GatewayControl.jsx` | ✅ Complet | Start/stop/restart avec modal confirmation, PID, CPU, RAM, uptime |
    23|| **Tools** | `tools.py` | `Tools.jsx` (553 lignes) | ✅ Complet | Liste, enable/disable par plateforme, configuration env vars |
    24|| **Skills** | `skills.py` | `Skills.jsx` (290 lignes) + `SkillsHub.jsx` (682 lignes) | ✅ Complet | Installés + marketplace, install/uninstall, métadonnées enrichies |
    25|| **Sessions** | `sessions.py` | `Sessions.jsx` (415 lignes) | ✅ Complet | Liste, recherche, historique, export, prune, stats avec chart |
    26|| **Cron** | `cron.py` | `CronJobs.jsx` (172 lignes) | ✅ Complet | CRUD, pause/resume, trigger manuel |
    27|| **Versions** | `overview.py` | `Overview.jsx` | ✅ Complet | Version actuelle, check update, changelog, confirmation avant update |
    28|
    29|### Features supplémentaires couvertes (bonus)
    30|
    31|| Feature | Routeur | Page | Statut |
    32||---|---|---|---|
    33|| **Chat (SSE streaming)** | `chat.py` | `Chat.jsx` (476 lignes) | ✅ Markdown, tool calls, fallback LLM direct |
    34|| **Models** | `models.py` | `Models.jsx` | ✅ Switch model, liste available |
    35|| **Platforms** | `platforms.py` | `Platforms.jsx` (469 lignes) | ✅ Status, env vars, pairing, 10+ plateformes |
    36|| **API Keys** | `api_keys.py` | `ApiKeys.jsx` (422 lignes) | ✅ CRUD, masked reveal |
    37|| **Insights** | `insights.py` | `Insights.jsx` (438 lignes) | ✅ Charts, heatmap, analytics multi-périodes |
    38|| **Files** | `files.py` | `Files.jsx` (496 lignes) | ✅ Browse, edit, create, delete — path traversal protection |
    39|| **Terminal (PTY)** | `terminal.py` (WebSocket) | `TerminalPage.jsx` (178 lignes) | ✅ xterm.js, resize, custom theme |
    40|| **Diagnostics** | `diagnostics.py` | `Diagnostics.jsx` | ✅ Quick check + hermes doctor |
    41|| **Webhooks** | `webhooks.py` | `Webhooks.jsx` | ✅ CRUD |
    42|| **Env Vars** | `env_vars.py` | `EnvVars.jsx` (272 lignes) | ✅ CRUD, required panel, masking |
    43|| **Plugins** | `plugins_router.py` | `Plugins.jsx` | ✅ Install from Git, enable/disable, update |
    44|| **MCP Servers** | `mcp.py` | `McpServers.jsx` | ✅ Add/remove/test connection |
    45|| **Auth & Pairing** | `auth_pairing.py` | `AuthPairing.jsx` | ✅ Approve/revoke/clear pending |
    46|| **Profiles** | `profiles.py` | `Profiles.jsx` | ✅ Create/rename/switch/delete/export |
    47|| **Backup** | `backup.py` | `BackupRestore.jsx` | ✅ Create/list/restore/download/delete |
    48|
    49|### Ce qui manque
    50|
    51|- **Aucune feature majeure d'Hermes Agent n'est absente.** 27 pages pour 25 routeurs backend = couverture quasi-totale.
    52|- **Swagger/OpenAPI docs** non explicitement activé (pas de `docs_url` dans FastAPI — auto-désactivé en production via middleware auth probablement).
    53|
    54|**Score: 9/10** — Couverture exhaustive de toutes les features Hermes Agent. Seule micro-déduction pour l'absence de docs Swagger accessibles publiquement.
    55|
    56|---
    57|
    58|## 7. UX / UI — Qualité Interface (Score: 7.5/10)
    59|
    60|### Navigation & Structure
    61|
    62|| Critère | Évaluation | Notes |
    63||---|---|---|
    64|| **Sidebar navigation** | ✅ Bonne | 27 items avec icônes Lucide, collapsible, auto-close sur navigation mobile |
    65|| **Routing** | ✅ Bon | HashRouter (compatible reverse proxy), chaque page = route dédiée |
    66|| **Feature-gating** | ✅ Excellent | MOA et Fine-Tune masqués dynamiquement si non configurés |
    67|
    68|### Responsive & Mobile
    69|
    70|| Critère | Évaluation | Notes |
    71||---|---|---|
    72|| **Media queries** | ⚠️ Partiel | `@media (max-width: 1024px)` et `@media (max-width: 640px)` dans index.css |
    73|| **Mobile toggle** | ✅ | `.mobile-toggle` affiché sous 640px |
    74|| **Tables sur mobile** | ⚠️ Moyen | Pas de `overflow-x: auto` systématique sur les tableaux (Sessions, Tools, etc.) |
    75|| **Sidebar mobile** | ✅ | Hamburger menu, fermeture auto |
    76|
    77|### Feedback utilisateur
    78|
    79|| Critère | Évaluation | Notes |
    80||---|---|---|
    81|| **Loading states** | ✅ Bon | Spinner central `<div className="spinner" />` + `Loader2` inline dans boutons |
    82|| **Error states** | ✅ Bon | `error` state + `<div className="error-box">` dans la majorité des pages |
    83|| **Toast/feedback** | ✅ Bon | Feedback temporisé avec `feedbackTimer` (setTimeout + auto-clear) dans CRUD |
    84|| **Confirmations** | ✅ Excellent | Modal de confirmation pour actions destructives (gateway stop, restore, etc.) |
    85|| **SSE streaming** | ✅ | Chat et Gateway logs avec flux temps réel |
    86|
    87|### Cohérence visuelle & Design
    88|
    89|| Critère | Évaluation | Notes |
    90||---|---|---|
    91|| **Dark/Light mode** | ✅ Excellent | ThemeContext avec détection system preference + localStorage persistence |
    92|| **CSS custom properties** | ✅ Bon | Variables CSS (`var(--bg-tertiary)`, `var(--success)`, etc.) pour thèmes |
    93|| **Icônes** | ✅ Cohérent | Lucide React partout — homogène |
    94|| **Composants partagés** | ⚠️ Faible | Seulement 2 composants (`Tooltip.jsx`, `ThemeContext.jsx`) — beaucoup de duplication UI |
    95|
    96|### Accessibilité
    97|
    98|| Critère | Évaluation | Notes |
    99||---|---|---|
   100|| **ARIA attributes** | ❌ Aucun | Zéro `role=`, `aria-label=`, `aria-*` dans les pages |
   101|| **Keyboard nav** | ⚠️ Basique | Inputs natifs, mais pas de focus management, pas de skip links |
   102|| **Contrastes** | ⚠️ Non vérifié | Pas de garantie WCAG sur les thèmes custom |
   103|
   104|### Points forts / faiblesses
   105|
   106|- **Fort:** Dark mode, feature-gating intelligent, toasts de feedback, modals de confirmation, streaming SSE
   107|- **Faible:** Zéro accessibilité ARIA, composants partagés trop peu nombreux (pas de Button, Modal, Table réutilisables — duplication massive dans les 10K+ lignes de pages), tables non responsive
   108|
   109|**Score: 7.5/10** — UI fonctionnelle et riche, mais manque cruellement d'accessibilité et de composants partagés (DRY).
   110|
   111|---
   112|
   113|## 8. Frontend — Bonnes Pratiques React (Score: 6.5/10)
   114|
   115|### Architecture & Patterns
   116|
   117|| Critère | Évaluation | Notes |
   118||---|---|---|
   119|| **Fonctionnel uniquement** | ✅ Oui | Tous les composants sont des fonctions — aucun class component |
   120|| **Hooks usage** | ✅ Bon | `useState`, `useEffect`, `useRef`, `useCallback` bien utilisés (77 occurrences hooks avancés) |
   121|| **useEffect cleanup** | ⚠️ Partiel | Cleanup présent pour intervals (Overview, ClaudeCode, Gateway), EventSource (Gateway), WebSocket (Terminal), AbortController (Chat). **Mais** de nombreux `useEffect(() => { load() }, [])` sans cleanup fetch |
   122|| **useCallback/useMemo** | ✅ | Utilisés pour `loadData`, `fetchKeys`, etc. — bonne optimisation |
   123|
   124|### Gestion formulaires
   125|
   126|| Critère | Évaluation | Notes |
   127||---|---|---|
   128|| **Contrôle** | ⚠️ Basique | `useState` + `onChange` manuels partout — pas de react-hook-form ou bibliothèque équivalente |
   129|| **Validation** | ❌ Aucune | Pas de validation côté client — uniquement erreurs serveur affichées |
   130|| **Debounce search** | ✅ Bon | `debounceRef` dans Sessions.jsx, `regSearchTimer` dans SkillsHub |
   131|
   132|### Error Handling
   133|
   134|| Critère | Évaluation | Notes |
   135||---|---|---|
   136|| **Error Boundaries** | ❌ Aucun | Zéro ErrorBoundary — une erreur React non gérée crashera l'app entière |
   137|| **API errors** | ✅ Bon | Centralisé dans `api.js` avec parsing `detail`, try/catch dans chaque page |
   138|| **SSE errors** | ✅ | EventSource reconnect handling dans Gateway |
   139|
   140|### Tests
   141|
   142|| Critère | Évaluation | Notes |
   143||---|---|---|
   144|| **Unit tests** | ❌ Aucun | Aucun fichier de test, aucun framework de test dans package.json |
   145|| **E2E tests** | ❌ Aucun | Pas de Cypress, Playwright, etc. |
   146|| **Couverture** | 0% | 10 362 lignes de JSX sans un seul test |
   147|
   148|### Quality Tooling
   149|
   150|| Critère | Évaluation | Notes |
   151||---|---|---|
   152|| **ESLint** | ✅ | Configuré avec eslint-plugin-react-hooks et react-refresh |
   153|| **Prettier** | ❌ | Pas configuré |
   154|| **TypeScript** | ❌ | JSX pur (pas .tsx) — aucun typage statique |
   155|| **StrictMode** | ✅ | `<StrictMode>` dans main.jsx |
   156|
   157|### DRY & Composants
   158|
   159|| Critère | Évaluation | Notes |
   160||---|---|---|
   161|| **Composants partagés** | ❌ Très faible | 2 composants (Tooltip + ThemeContext) pour 27 pages / 10K+ lignes |
   162|| **Duplication** | ⚠️ Élevée | Même pattern `confirm-overlay` dupliqué, même pattern toast dupliqué, même pattern loading/error dupliqué dans chaque page |
   163|| **API client** | ✅ Centralisé | `api.js` unique pour tous les appels |
   164|
   165|### Points forts / faiblesses
   166|
   167|- **Fort:** Hooks modernes, API client centralisé, cleanup pour副作用 longues (SSE, WebSocket, polling), StrictMode, ESLint
   168|- **Faible:** Aucun test (0/10K lignes), aucun ErrorBoundary, pas de TypeScript, composants très peu réutilisés, pas de form library, pas de validation client
   169|
   170|**Score: 6.5/10** — Patterns React modernes correctement utilisés, mais l'absence totale de tests, Error Boundaries, TypeScript et composants partagés est problématique pour un projet de cette taille.
   171|
   172|---
   173|
   174|## 9. DevOps & Déploiement (Score: 6/10)
   175|
   176|### Systemd Service
   177|
   178|| Critère | Évaluation | Notes |
   179||---|---|---|
   180|| **Service file** | ✅ Propre | `hermes-dashboard.service` — 25 lignes, bien structuré |
   181|| **Restart policy** | ✅ | `Restart=always`, `RestartSec=5` |
   182|| **Logging** | ✅ | Journalctl via `StandardOutput=journal`, `SyslogIdentifier=hermes-dashboard` |
   183|| **Watchdog** | ✅ Correct | Commentaire explicatif: "NO WatchdogSec — Uvicorn doesn't send sd_notify" |
   184|| **Resource limits** | ✅ | `LimitNOFILE=65535` |
   185|| **User** | ⚠️ | Court en tant que `root` — préférable un user dédié |
   186|| **PYTHONUNBUFFERED** | ✅ | Journalisation non bufferisée |
   187|
   188|### Auto-Deploy Script
   189|
   190|| Critère | Évaluation | Notes |
   191||---|---|---|
   192|| **Detection commits** | ⚠️ Logique inversée | Script check `origin/main..main` (commits locaux non poussés) mais logique réelle = push puis rebuild — fonctionnel mais comment trompeur |
   193|| **Build frontend** | ✅ | `npm run build` avant redémarrage |
   194|| **Process restart** | ❌ Brutal | `kill $(lsof -ti:3100)` — ne passe PAS par systemd, contournant le service manager |
   195|| **Fallback nohup** | ❌ | Démarre avec `nohup` au lieu de `systemctl restart hermes-dashboard` — perte de supervision systemd |
   196|| **Error handling** | ❌ | Pas de `set -e`, pas de rollback si build échoue, pas de vérification santé post-déploiement |
   197|| **Build check** | ❌ | Pas de vérification que `npm run build` a réussi avant de tuer le process |
   198|
   199|### Nginx Configuration
   200|
   201|| Critère | Évaluation | Notes |
   202||---|---|---|
   203|| **Reverse proxy** | ✅ | Proxy correct vers `127.0.0.1:3100` |
   204|| **Basic auth** | ✅ | `/etc/nginx/.htpasswd-hermes` |
   205|| **WebSocket** | ✅ | Upgrade headers pour `/dashboard/` (couvre `/ws/terminal`) |
   206|| **SSE support** | ⚠️ | Pas de `proxy_buffering off` explicit — SSE peut mal fonctionner |
   207|| **Security headers** | ❌ | Pas de `X-Frame-Options`, `X-Content-Type-Options`, CSP renforcé, HSTS |
   208|| **HTTPS** | ❌ | Écoute sur port 80 (HTTP) uniquement |
   209|| **Static assets caching** | ❌ | Pas de `expires` ou `Cache-Control` pour les assets statiques |
   210|
   211|### Vite Config
   212|
   213|| Critère | Évaluation | Notes |
   214||---|---|---|
   215|| **Build output** | ✅ | `../backend/static` — intégré au backend |
   216|| **Dev proxy** | ✅ | `/api` → `127.0.0.1:3100` |
   217|| **Base path** | ✅ | `./` (relative) compatible reverse proxy |
   218|| **Minification** | ✅ | Vite default (terser/esbuild) |
   219|
   220|### Docker
   221|
   222|| Critère | Évaluation | Notes |
   223||---|---|---|
   224|| **Dockerfile** | ✅ | Multi-stage (node + python), clean |
   225|| **.dockerignore** | ❌ Non vérifié | Probablement absent |
   226|| **Docker Compose** | ❌ | Pas de docker-compose.yml pour stack complète |
   227|
   228|### Health Check
   229|
   230|| Critère | Évaluation | Notes |
   231||---|---|---|
   232|| **Endpoint** | ✅ | `/api/health` (non authentifié) |
   233|| **Systemd watchdog** | ❌ | Pas de health check actif (pas de `ExecStartPost` avec curl, pas de watchdog) |
   234|| **Monitoring** | ❌ | Pas de Prometheus metrics, pas d'alerting |
   235|
   236|### Points forts / faiblesses
   237|
   238|- **Fort:** Service systemd propre, Vite bien configuré, Dockerfile multi-stage, health endpoint
   239|- **Faible:** Auto-deploy bypass systemd (kill + nohup), pas de rollback, pas de HTTPS, pas de security headers Nginx, pas de monitoring, pas de backup automatique, pas de CI/CD, user root
   240|
   241|**Score: 6/10** — Service de base fonctionnel, mais l'auto-deploy est fragile (bypass systemd), la sécurité Nginx est faible (pas HTTPS, pas headers), et il n'y a pas de monitoring/CI/CD.
   242|
   243|---
   244|
   245|## 10. Documentation (Score: 8.5/10)
   246|
   247|### README.md
   248|
   249|| Critère | Évaluation | Notes |
   250||---|---|---|
   251|| **Longueur** | ✅ | 710 lignes — très complet |
   252|| **Vue d'ensemble** | ✅ | Description claire, badges, architecture ASCII |
   253|| **Features list** | ✅ Excellent | Tableau de 27 pages avec descriptions détaillées |
   254|| **API Reference** | ✅ Excellent | Documentation complète de tous les endpoints (200+ lignes) |
   255|| **Architecture** | ✅ | Diagramme ASCII, explication du monorepo |
   256|| **Installation** | ✅ | 3 options : Manual, Docker, Systemd |
   257|| **Dev instructions** | ✅ | Hot reload backend + frontend séparés |
   258|| **Environment vars** | ✅ | Tableau complet de toutes les variables |
   259|| **Project structure** | ✅ | Arborescence complète avec descriptions |
   260|| **Reverse proxy** | ✅ | Config Nginx exemple avec WebSocket |
   261|| **Contributing** | ✅ | Instructions fork/PR basiques |
   262|| **i18n** | ✅ Bonus | Section complète en français |
   263|| **Code examples** | ✅ | YAML MOA, curl implicites via API table |
   264|
   265|### .env.example
   266|
   267|| Critère | Évaluation | Notes |
   268||---|---|---|
   269|| **Variables essentielles** | ✅ | `HERMES_DASHBOARD_TOKEN`, `HERMES_HOME` |
   270|| **Variables optionnelles** | ✅ | `HERMES_BIN`, `HERMES_PYTHON`, `HERMES_AGENT_DIR`, `HERMES_MEMORY_PATH` documentées |
   271|| **Commentaires** | ✅ | Commentaires pour chaque variable |
   272|
   273|### Code Comments
   274|
   275|| Critère | Évaluation | Notes |
   276||---|---|---|
   277|| **Backend main.py** | ✅ | Commentaires sectionnels clairs (# CORS, # Auth, # Security headers, etc.) |
   278|| **Systemd service** | ✅ | Commentaire explicatif watchdog |
   279|| **Auto-deploy** | ✅ | Usage en en-tête |
   280|| **Frontend** | ⚠️ | Quelques `// ── Helpers ──` dans Chat.jsx et MemorySoul.jsx — peu de commentaires globaux |
   281|| **Routers** | ⚠️ | Pas vérifié exhaustivement, mais FastAPI génère des descriptions via docstrings |
   282|
   283|### Swagger/OpenAPI
   284|
   285|| Critère | Évaluation | Notes |
   286||---|---|---|
   287|| **FastAPI auto-docs** | ✅ | `app = FastAPI(title=..., description=..., version=...)` — `/docs` généré automatiquement |
   288|| **Accessibilité** | ⚠️ | Probablement bloqué par le middleware Auth en production |
   289|
   290|### Manque
   291|
   292|- Pas de CHANGELOG.md
   293|- Pas de CONTRIBUTING.md séparé (inclus dans README)
   294|- Pas de guide de troubleshooting
   295|- Pas de schéma de base de données documenté
   296|
   297|**Score: 8.5/10** — README exceptionnellement complet avec API reference, architecture, 3 méthodes d'installation, et section bilingue. Seule déduction pour l'absence de CHANGELOG, troubleshooting guide, et docs Swagger potentiellement inaccessibles.
   298|
   299|---
   300|
   301|## Synthèse
   302|
   303|| # | Catégorie | Score | Commentaire |
   304||---|---|---|---|
   305|| 6 | **Features — Couverture Hermes** | **9/10** | 25 routeurs, 27 pages, couverture quasi-totale. Aucune feature majeure manquante |
   306|| 7 | **UX / UI** | **7.5/10** | Dark mode, streaming SSE, feedback toasts. Zéro accessibilité ARIA, peu de composants partagés |
   307|| 8 | **React Best Practices** | **6.5/10** | Hooks modernes, API centralisée. Aucun test (0%), pas d'ErrorBoundary, pas de TypeScript |
   308|| 9 | **DevOps & Déploiement** | **6/10** | Systemd propre, Dockerfile multi-stage. Auto-deploy bypass systemd, pas HTTPS, pas monitoring |
   309|| 10 | **Documentation** | **8.5/10** | README 710 lignes, API reference complète, bilingue FR/EN. Pas de CHANGELOG |
   310|
   311|### Score global Part 2: **7.5/10** (moyenne: 37.5/50)
   312|
   313|### Recommandations prioritaires
   314|
   315|1. **Tests (P0):** Ajouter Vitest + React Testing Library — couverture cible 50%+
   316|2. **Error Boundaries (P0):** Wrapper l'App pour éviter crash silencieux
   317|3. **Composants partagés (P1):** Extraire Modal, Toast, ConfirmDialog, Table en composants réutilisables
   318|4. **Auto-deploy (P1):** Remplacer `kill`+`nohup` par `systemctl restart hermes-dashboard` + vérification santé
   319|5. **Sécurité Nginx (P1):** HTTPS, security headers (X-Frame-Options, CSP, HSTS), SSE `proxy_buffering off`
   320|6. **Accessibilité (P2):** ARIA labels sur les boutons/icones, keyboard navigation
   321|7. **TypeScript (P2):** Migration progressive `.jsx` → `.tsx`
   322|8. **Monitoring (P2):** Health check actif systemd, Prometheus metrics optionnel
   323|

---

*Rapport généré par Hermes Agent (Sam) — 2026-04-07*
