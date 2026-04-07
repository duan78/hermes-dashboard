# Hermes Dashboard - Performance Re-Audit
**Date:** 2026-04-07
**Scope:** Performance only (bundle, runtime, backend, network)
**Previous Fix:** Lazy loading on 7 heavy pages + Error Boundary

---

## Score: 5.5 / 10

---

## A. Frontend Bundle Analysis

### A1. Chunk Sizes (frontend/dist/assets/)

| Chunk | Size | Contents |
|-------|------|----------|
| `index-BGwbRG0G.js` | **580 KB** | React, react-router-dom, lucide-react, 22 non-lazy pages |
| `TerminalPage-Ca_Lws5Q.js` | **340 KB** | @xterm/xterm + addon-fit (LAZY - GOOD) |
| `index-vwjZKj_Y.css` | **40 KB** | Global CSS (all pages) |
| `MemorySoul-Djj7YQ23.js` | 24 KB | react-markdown + remark-gfm (LAZY - GOOD) |
| `MoaConfig-DHqrfIzS.js` | 22 KB | MOA config page (LAZY - GOOD) |
| `api-Cp1MdTPO.js` | 14 KB | Shared API client module |
| `jsx-runtime-Bg_NI1en.js` | 8.5 KB | React JSX runtime (preloaded) |
| `GatewayControl-3vL7CbPF.js` | 9 KB | (LAZY - GOOD) |
| `ClaudeCode-lynRFeV0.js` | 9 KB | (LAZY - GOOD) |
| `Chat-Dmg8MEEl.js` | 8 KB | (LAZY - GOOD) |
| `FineTune-Dxjz6QgV.js` | 8 KB | (LAZY - GOOD) |

**Total JS:** ~1.07 MB (before gzip)
**Total CSS:** ~85 KB (before gzip)

### A2. Lazy Loading Effectiveness - GOOD (7/10)

7 pages are properly lazy-loaded via `React.lazy()`:
- `TerminalPage` (xterm.js - 340KB saved from initial)
- `MemorySoul` (react-markdown - 24KB saved)
- `Chat` (8KB)
- `FineTune` (8KB)
- `ClaudeCode` (9KB)
- `MoaConfig` (22KB)
- `GatewayControl` (9KB)

However, **22 pages are still eagerly imported** (lines 10-29 of App.jsx). Pages like `Sessions`, `SkillsHub`, `Diagnostics`, `Config`, `Insights` are all in the 580KB main bundle. They contain `lucide-react` icons and substantial JSX.

### A3. Heavy Dependencies - CHECK

| Dependency | Lazy? | Impact |
|------------|-------|--------|
| `@xterm/xterm` + `@xterm/addon-fit` | YES | Correctly isolated |
| `react-markdown` + `remark-gfm` | YES | Correctly isolated |
| `react-syntax-highlighter` | NOT USED | Good - not in package.json |
| `lucide-react` | PARTIAL | Imported in App.jsx (main bundle), individual icons used per page |

### A4. Duplication - MINOR

- `jsx-runtime` is correctly extracted and preloaded.
- `api-Cp1MdTPO.js` is shared via Vite's manual chunks.
- No major duplication between lazy chunks.

### A5. Tailwind CSS - NOT APPLICABLE

The project uses **custom CSS** (not Tailwind). No Tailwind purge issue. The CSS is 85KB total but most of it is genuinely used custom CSS (index.css + per-page CSS files). Per-page CSS chunks are small (4-9KB each), confirming Vite's CSS code splitting works well.

---

## B. Frontend Runtime Performance

### B1. API Polling Patterns

| Page | Polling | Frequency | Cleanup? |
|------|---------|-----------|----------|
| **Overview** | `setInterval` for system metrics | 10s | YES `clearInterval` on unmount |
| **GatewayControl** | `setInterval` for status | 5s | YES `clearInterval` on unmount |
| **ClaudeCode** | `setInterval` for active sessions | **3s** | YES `clearInterval` on unmount |
| **Overview** | Initial load | Once | N/A |
| **GatewayControl** | SSE EventSource for live logs | Real-time | YES `es.close()` on unmount |

### B2. Polling Issues

- **ClaudeCode polls at 3s** - calls `GET /api/claude-code/active` which runs `subprocess.run(["tmux", "list-sessions"])`, `subprocess.run(["tmux", "capture-pane"])` per session, AND `subprocess.run(["ps", "aux"])` for EACH session. This is **synchronous blocking I/O in an async handler** and does N subprocess calls per poll cycle.
- **GatewayControl polls at 5s** - calls `systemctl --user status` + `systemctl --user is-enabled` (2 subprocess calls). Reasonable.
- **Overview polls at 10s** - calls `system_metrics` endpoint which does `asyncio.sleep(0.5)` for CPU measurement. Acceptable.

### B3. useEffect Cleanup - GOOD

All `setInterval` and `setTimeout` patterns examined have proper cleanup:
- Overview: `return () => clearInterval(interval)` ✓
- GatewayControl: `return () => clearInterval(interval)` + `return () => { es.close() }` ✓
- ClaudeCode: `return () => clearInterval(pollRef.current)` ✓

No infinite re-render risk found. Dependencies arrays are correct.

### B4. Virtualization - NONE

No virtualization library (react-window, react-virtual) in dependencies. Large lists like Sessions, Skills Hub registry, log viewers render all items in DOM. The log viewer in GatewayControl caps at 1000 entries via `.slice(-999)`, which is a good manual limit but still renders full DOM.

### B5. Missing API Caching

No caching layer (SWR, React Query, or custom). Every page mount re-fetches all data. Polling intervals re-fetch even when data hasn't changed. No conditional refetch, no ETag/If-None-Match support in frontend.

---

## C. Backend Performance

### C1. Subprocess Calls - BLOCKING CALLS FOUND

**CRITICAL: `claude_code.py` uses `subprocess.run()` (sync) in async handlers**

```python
# claude_code.py - ALL of these are synchronous subprocess.run():
subprocess.run(["tmux", "send-keys", ...], capture_output=True)  # Lines 173,184,185,197,199,200,201,202,212
```

6 endpoints use sync `subprocess.run()` without timeout (except `_run()` helper which has a 10s timeout). These block the asyncio event loop.

**Diagnotics `quick_diagnostics` missing timeout:**
```python
# diagnostics.py line 93-98
proc = await asyncio.create_subprocess_exec(...)
out, _ = await proc.communicate()  # NO TIMEOUT!
```
If `systemctl --user is-active` hangs, this endpoint blocks forever.

### C2. Subprocess Timeout Coverage

| Router | Endpoint | Has Timeout? |
|--------|----------|-------------|
| overview | `/system` | N/A (reads /proc) |
| overview | `/version` | 15s ✓ |
| overview | `/update` | 300s ✓ |
| overview | `/changelog` | 15s ✓ |
| gateway | `/status` | 10s + 5s ✓ |
| gateway | `/restart` | 15s + 10s ✓ |
| gateway | `/stop` | 15s ✓ |
| gateway | `/start` | 15s + 10s ✓ |
| diagnostics | `/run` | 60s ✓ |
| diagnostics | `/quick` | **NO** ⚠️ |
| claude_code | `/active` | 10s ✓ (via `_run`) |
| claude_code | `/stop`, `/send`, `/new`, `/kill` | **NO** ⚠️ (sync subprocess.run) |

### C3. File Caching - NONE

**config.yaml is read on every API call.** Multiple routers independently read and parse `config.yaml`:

- `chat.py`: `_get_gateway_url()`, `_get_api_key()`, `_get_model()` each read `config.yaml`
- `overview.py`: `get_overview()` reads `config.yaml`
- `memory.py`: `_get_honcho_provider()`, `_get_honcho_workspace_id()` each read `config.yaml`
- `config.py`: `get_config()`, `get_config_sections()` read `config.yaml`
- `models.py`: likely reads `config.yaml`

**No caching at all.** A single Overview page load triggers multiple redundant file reads.

### C4. N+1 Pattern Found

**`overview.py` `get_overview()` - lines 59-70:**
```python
for f in session_files:           # Iterates ALL session files
    sd = json.loads(f.read_text())  # Reads and parses EACH file
    total_messages += sd.get("message_count", 0)
```
This is O(N) file reads where N = number of sessions.

**`sessions.py` `list_sessions()` - lines 105-140:**
For each session JSON file, it:
1. Reads the session JSON file
2. Reads the corresponding JSONL file (possibly multiple times for different purposes)
3. Counts lines by reading the entire JSONL file
4. Reads JSONL again to find first user message as preview

Same JSONL file can be read 3 times per session.

**`claude_code.py` `active_sessions()` - lines 59-90:**
For each tmux session, calls `_run(["tmux", "capture-pane"])` and `_run(["ps", "aux"])` (which reads ALL processes for EACH session). Should run `ps aux` once and filter.

### C5. File Streaming

Large files are read entirely into memory. No streaming. The `files.py` router has a 5MB limit which is reasonable. Session export loads entire JSONL into response.

### C6. Large In-Memory Operations

- `overview.py` `get_recent_logs()`: Reads entire `gateway.log` into memory, splits all lines, then slices last N. For a large log file (100MB+), this is very expensive.
- `gateway.py` `gateway_logs()`: Same pattern - reads entire log file.

---

## D. Network Performance

### D1. Gzip/Brotli Compression - MISSING

**No nginx config found** in the project. The app is served directly by FastAPI/uvicorn (or potentially behind a reverse proxy not in the repo). The `main.py` middleware only adds security headers - no compression middleware.

- No `GZipMiddleware` from Starlette
- No nginx config with `gzip on`
- The 580KB main JS chunk would benefit enormously from gzip (~150KB compressed)

### D2. Static Asset Caching - MISSING

FastAPI's `StaticFiles` provides **no cache headers** by default. The `FileResponse` for `index.html` also has no cache headers.

Missing headers:
- `Cache-Control: public, max-age=31536000, immutable` for hashed assets (`*.js`, `*.css` with content hash in filename)
- `Cache-Control: no-cache` for `index.html` (SPA entry point)

### D3. Preload Hints - PARTIAL

The built `index.html` includes:
```html
<link rel="modulepreload" href="./assets/jsx-runtime-Bg_NI1en.js">
<link rel="modulepreload" href="./assets/api-Cp1MdTPO.js">
<link rel="modulepreload" href="./assets/refresh-cw-CYGSn7Vb.js">
```
This is good for critical chunks. However:
- No `<link rel="preload">` for the main CSS file
- No `<link rel="prefetch">` for likely next-navigation lazy chunks
- The `refresh-cw` icon (459 bytes) is preloaded but rarely needed on first load

### D4. HTTP/2 - UNKNOWN

Depends on deployment (uvicorn only supports HTTP/1.1). Would need nginx or Caddy for HTTP/2.

---

## E. Quickwins (Prioritized)

### HIGH IMPACT (10-30 min each)

1. **Add GZip compression middleware** (est. -70% transfer size)
   ```python
   from starlette.middleware.gzip import GZipMiddleware
   app.add_middleware(GZipMiddleware, minimum_size=1000)
   ```
   **Impact: 580KB -> ~170KB for main bundle**

2. **Add Cache-Control headers for static assets**
   ```python
   @app.middleware("http")
   async def cache_assets(request, call_next):
       response = await call_next(request)
       if request.url.path.startswith("/assets/"):
           response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
       return response
   ```

3. **Cache config.yaml reads** (eliminates 5-10 redundant file reads per page load)
   ```python
   import time
   _config_cache = {"data": None, "mtime": 0}
   def get_config():
       path = hermes_path("config.yaml")
       mtime = path.stat().st_mtime
       if _config_cache["mtime"] != mtime:
           _config_cache["data"] = yaml.safe_load(path.read_text())
           _config_cache["mtime"] = mtime
       return _config_cache["data"]
   ```

4. **Convert sync subprocess.run to async in claude_code.py**
   ```python
   # Replace subprocess.run with:
   proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, ...)
   await asyncio.wait_for(proc.communicate(), timeout=10)
   ```

### MEDIUM IMPACT (15-45 min each)

5. **Lazy-load remaining pages** (Sessions, SkillsHub, Diagnostics, Config, etc.)
   - Would reduce main bundle from 580KB to ~350KB est.
   - 18 more pages could be lazy-loaded

6. **Add timeout to diagnostics `/quick` subprocess** (line 93)
   ```python
   out, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
   ```

7. **Fix N+1 in sessions list** - read JSONL once per session, not 3 times
   ```python
   jsonl_content = jsonl_path.read_text(errors="replace")
   lines = [l for l in jsonl_content.strip().split("\n") if l.strip()]
   msg_count = len(lines)
   # Preview from first lines
   for line in lines:
       msg = json.loads(line)
       if msg.get("role") == "user":
           preview = msg["content"][:80]
           break
   ```

8. **Fix N+1 in claude_code active sessions** - run `ps aux` once
   ```python
   ps_result = _run(["ps", "aux"])
   # Then filter per session instead of calling ps for each
   ```

9. **Optimize log reading** - use `tail` subprocess or file seek instead of reading entire file
   ```python
   # Instead of reading full file:
   import subprocess
   result = subprocess.run(["tail", "-n", str(lines), str(log_path)], capture_output=True, text=True)
   ```

10. **Preload main CSS in index.html**
    ```html
    <link rel="preload" href="./assets/index-vwjZKj_Y.css" as="style">
    ```

### LOW IMPACT (nice to have)

11. **Add `fetchPolicy` / caching** to polling (only refetch if data changed)
12. **Virtualize large lists** (Sessions, Skills registry, logs)
13. **Reduce ClaudeCode polling** from 3s to 5s or 10s
14. **HTTP/2 support** via nginx/Caddy in front
15. **Add `rel="dns-prefetch"` for external API endpoints**

---

## Summary Table

| Category | Score | Notes |
|----------|-------|-------|
| Bundle splitting | 6/10 | 7 lazy pages, but 580KB main bundle still too large |
| CSS efficiency | 8/10 | Clean code-split CSS, no Tailwind bloat |
| Frontend runtime | 6/10 | Proper cleanup, but no caching, no virtualization |
| Backend I/O | 4/10 | No config caching, N+1 patterns, sync subprocess in async handlers |
| Network/Compression | 3/10 | No gzip, no cache headers, no HTTP/2 |
| Subprocess safety | 6/10 | Most have timeouts, but claude_code.py is all sync |
| **Overall** | **5.5/10** | |

---

## Top 5 Actions to Reach 7.5/10

1. Add GZip middleware (-70% transfer) → +1.0pt
2. Add Cache-Control headers for static assets → +0.5pt
3. Cache config.yaml with mtime invalidation → +0.5pt
4. Lazy-load 10+ more pages (reduce main bundle to ~350KB) → +0.5pt
5. Fix sync subprocess.run in claude_code.py → +0.5pt
