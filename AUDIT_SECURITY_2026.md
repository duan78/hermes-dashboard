# Hermes Dashboard - Security Re-Audit

**Date:** 2026-04-07  
**Scope:** Backend security only (FastAPI + Nginx)  
**Auditor:** Automated deep-dive (no files modified)

---

## SCORE: 6.5 / 10

| Area | Score | Verdict |
|------|-------|---------|
| Path Traversal | 8/10 | Good - _resolve_path used consistently, minor gaps |
| Command Injection | 7/10 | Safe (subprocess_exec, no shell=True), one tmux gap |
| SSRF | 8/10 | Gateway URL from config, not user-supplied |
| CORS | 7/10 | Restrictive origins, but methods/headers are wildcards |
| Auth Bypass | 4/10 | CRITICAL: DASHBOARD_TOKEN is empty = auth disabled |
| Rate Limiting | 1/10 | ABSENT - no rate limiting anywhere |
| Secrets Exposure | 5/10 | Mostly masked, but raw_yaml and raw_value leak full secrets |
| WebSocket | 7/10 | X-Forwarded-For check good, but router duplicate without it |
| Nginx | 8/10 | Well-configured, all endpoints behind basic auth |
| Input Validation | 6/10 | env_vars set accepts arbitrary keys, chat session_id not sanitized |

---

## A. CRITICAL FINDINGS

### 1. AUTH COMPLETELY DISABLED - DASHBOARD_TOKEN is empty [CRITICAL]

**File:** `backend/app/config.py:8`
```python
DASHBOARD_TOKEN = os.getenv("DASHBOARD_TOKEN", "")
```

**File:** `backend/app/auth.py:16-17`
```python
if not DASHBOARD_TOKEN:
    return await call_next(request)
```

**Impact:** When DASHBOARD_TOKEN is empty (current state), ALL `/api/` endpoints skip authentication entirely. Any request to `http://localhost:3100/api/*` bypasses auth.

**Mitigation by Nginx:** The Nginx reverse proxy DOES apply `auth_basic` to `/api/`, `/ws/`, and `/dashboard/` paths. So if the app is accessed only through Nginx, this is partially mitigated. However:
- Direct access to port 3100 bypasses all authentication
- Nginx basic auth uses a separate password file, not DASHBOARD_TOKEN
- If Nginx is misconfigured or port 3100 is exposed, total compromise

**Quickwin (3 lines):**
```python
# config.py - auto-generate token if empty
import secrets
DASHBOARD_TOKEN = os.getenv("DASHBOARD_TOKEN", "")
if not DASHBOARD_TOKEN:
    DASHBOARD_TOKEN = secrets.token_urlsafe(32)
```

### 2. SECRETS LEAKED in API responses [HIGH]

**File:** `backend/app/routers/config.py:23`
```python
return {"config": mask_secrets(raw), "raw_yaml": config_path.read_text()}
```
The `raw_yaml` field returns the ENTIRE config.yaml with all secrets UNMASKED. Any API consumer gets full API keys, tokens, passwords.

**File:** `backend/app/routers/env_vars.py:56`
```python
"raw_value": value,
```
The `raw_value` field returns the UNMASKED value of every env var, including sensitive ones.

**Quickwin (2 lines in config.py):**
```python
# Remove raw_yaml from response
return {"config": mask_secrets(raw)}
```

**Quickwin (1 line in env_vars.py):**
```python
# Remove raw_value from response
# Delete line: "raw_value": value,
```

---

## B. HIGH FINDINGS

### 3. NO RATE LIMITING [HIGH]

There is zero rate limiting on any endpoint. The most sensitive routes exposed:
- `POST /api/files/write` - file write
- `POST /api/terminal/ws` (WebSocket) - shell access
- `POST /api/config` - config overwrite
- `POST /api/env-vars/set` - env var injection
- `POST /api/backup/restore` - backup restore
- `POST /api/gateway/restart` - service restart
- `POST /api/claude-code/new` - create tmux sessions

An attacker with access could brute-force the Nginx basic auth or, if port 3100 is exposed, enumerate all endpoints without restriction.

**Quickwin:** Add `slowapi` middleware in main.py:
```python
from slowapi import Limiter
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
# Then @limiter.limit("10/minute") on sensitive endpoints
```

### 4. env-vars/set ACCEPTS ARBITRARY KEYS [HIGH]

**File:** `backend/app/routers/env_vars.py:69-98`

The `/api/env-vars/set` endpoint accepts ANY key (no allowlist), unlike `/api/api-keys/set` which validates against `API_KEY_DEFINITIONS`. An attacker could inject arbitrary env vars like `PATH`, `PYTHONPATH`, or overwrite critical config.

**Quickwin (3 lines):**
```python
ALLOWED_ENV_KEYS = {d["key"] for d in API_KEY_DEFINITIONS} | {"HERMES_GATEWAY_URL", "HERMES_HOME"}
if key not in ALLOWED_ENV_KEYS:
    return {"error": "Unknown environment variable"}
```

### 5. CLAUDE_CODE new_session - Command Injection via workdir [HIGH]

**File:** `backend/app/routers/claude_code.py:198-200`
```python
subprocess.run(["tmux", "send-keys", "-t", name, "-l", "--", f"cd {workdir}"], ...)
```

While `subprocess.run` with a list avoids shell=True, the `workdir` value is directly injected into a tmux send-keys string that gets interpreted by the shell inside the tmux session. If `workdir` contains shell metacharacters like `; rm -rf /`, they would be executed.

**Quickwin (3 lines):**
```python
import shlex
if workdir:
    # Validate workdir is a real directory
    if not Path(workdir).resolve().is_dir():
        raise HTTPException(400, "Invalid workdir")
    subprocess.run(["tmux", "send-keys", "-t", name, "-l", "--", f"cd {shlex.quote(workdir)}"], ...)
```

### 6. DUPLICATE WebSocket endpoint without IP check [MEDIUM-HIGH]

**File:** `backend/app/routers/terminal.py:11-14`
```python
@router.websocket("/ws/terminal")
async def terminal_ws(websocket: WebSocket):
    await websocket.accept()  # NO IP check!
```

The terminal router registers `/ws/terminal` WITHOUT the X-Forwarded-For check, while `main.py:121-130` registers the same path WITH the check. Due to FastAPI router precedence, the one in `main.py` takes priority, but if the router were to be included differently, the unprotected version could be activated. This is a latent risk.

**Quickwin (2 lines):** Either delete the router version or add the same IP check.

---

## C. MEDIUM FINDINGS

### 7. Health Endpoint Leaks Server Path [MEDIUM]

**File:** `backend/app/main.py:88`
```python
return {"status": "ok", "hermes_home": str(HERMES_HOME)}
```
Exposes the absolute path of HERMES_HOME (e.g., `/root/.hermes`) to unauthenticated requests.

**Quickwin:**
```python
return {"status": "ok"}
```

### 8. SPA Serve Path Potential [MEDIUM]

**File:** `backend/app/main.py:246-250`
```python
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    file_path = static_dir / full_path
    if full_path and file_path.exists() and file_path.is_file():
        return FileResponse(str(file_path))
```

While `static_dir` is a fixed path under the project, using `Path(full_path)` without resolve-check means if `static_dir` ever contained symlinks, files could be served outside it. Currently low risk since static_dir is a build artifact.

### 9. Backup Restore - Tar Slip [MEDIUM]

**File:** `backend/app/routers/backup.py:118-130`

The restore function checks for `..` and leading `/` in member names but doesn't validate resolved paths stay within HERMES_HOME:
```python
if member.name.startswith("/") or ".." in member.name:
    continue
target = HERMES_HOME / member.name
```

A crafted tar could contain `./symlink_to_etc` pointing outside HERMES_HOME.

**Quickwin:**
```python
target = (HERMES_HOME / member.name).resolve()
if not str(target).startswith(str(HERMES_HOME.resolve())):
    continue
```

### 10. Files .env readable through files.py [MEDIUM]

**File:** `backend/app/routers/files.py:72`
```python
if item.name.startswith(".") and item.name not in (".env",):
    continue  # skip hidden files except .env
```

The `.env` file is explicitly shown in listings and readable through `/api/files/read?path=.env`. This file contains all API keys, tokens, and passwords in plaintext.

### 11. Chat session_id Not Sanitized [MEDIUM]

**File:** `backend/app/routers/chat.py:106`
```python
session_id = body.get("session_id") or str(uuid.uuid4())[:8]
```

User-supplied `session_id` is used in file paths (`sessions/{session_id}.jsonl`) without validation. Could create files with unexpected names (though limited by the sessions directory scope).

---

## D. LOW FINDINGS

### 12. CORS allow_methods and allow_headers are wildcards [LOW]

**File:** `backend/app/main.py:61-62`
```python
allow_methods=["*"],
allow_headers=["*"],
```

Origins are restricted (good), but methods and headers are wide open. In practice this is behind Nginx so low risk.

### 13. No client_max_body_size in Nginx [LOW]

The Nginx config doesn't set `client_max_body_size`, defaulting to 1MB. The backup download could exceed this. Not a security issue but a functionality concern.

### 14. WebSocket Timeouts at 86400s (24h) [LOW]

Long-lived WebSocket connections are allowed. While useful for terminal, this could be abused for resource exhaustion.

---

## E. POSITIVE FINDINGS (What's Done Right)

1. **Path traversal protection:** `files.py` has `_resolve_path()` with proper `.resolve()` + prefix check. `memory.py` has similar protection.
2. **No shell=True:** All subprocess calls use `subprocess_exec` or `subprocess.run` with list args. No `shell=True` found anywhere.
3. **Secret masking:** `mask_secrets()` in `utils.py` recursively masks values for keys matching sensitive patterns. API keys endpoint masks properly.
4. **Nginx security headers:** X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy all set.
5. **WebSocket X-Forwarded-For check:** Direct connections to port 3100 are rejected for WebSocket.
6. **Nginx auth_basic on all endpoints:** Dashboard, API, and WebSocket paths all require basic auth.
7. **Backup filename validation:** `/` and `..` checked in backup operations.
8. **Memory filename sanitization:** `memory.py:140` checks for `/` and `..` in filenames.
9. **Atomic file writes:** `.env` files use temp file + `os.replace()` for atomic writes.
10. **File permission enforcement:** `.env` is chmod'd to 600 after write.
11. **Binary file blocking:** `files.py` refuses to serve binary extensions.
12. **File size limit:** 5MB read limit in files.py.

---

## F. QUICKWINS - Priority Ordered

| # | Severity | Fix | Lines | File |
|---|----------|-----|-------|------|
| 1 | CRITICAL | Auto-generate DASHBOARD_TOKEN if empty | 3 | config.py |
| 2 | HIGH | Remove `raw_yaml` from config GET response | 1 | config.py |
| 3 | HIGH | Remove `raw_value` from env_vars list response | 1 | env_vars.py |
| 4 | HIGH | Add rate limiting to sensitive endpoints | ~10 | main.py + routers |
| 5 | HIGH | Restrict env-vars/set to known keys | 3 | env_vars.py |
| 6 | HIGH | Validate workdir in claude_code new_session | 3 | claude_code.py |
| 7 | MEDIUM | Remove hermes_home from health response | 1 | main.py |
| 8 | MEDIUM | Add resolved path check in backup restore | 2 | backup.py |
| 9 | MEDIUM | Delete duplicate unprotected WebSocket in terminal.py | delete | terminal.py |
| 10 | LOW | Add client_max_body_size to Nginx | 1 | nginx config |

---

## G. Nginx Config Assessment

**Strengths:**
- All three paths (dashboard, API, WebSocket) protected by auth_basic
- Security headers properly configured
- WebSocket properly upgraded with proxy_http_version 1.1
- Default `location /` returns 404 (catch-all)
- Separate htpasswd files for different services

**Gaps:**
- No `client_max_body_size` directive (backup downloads may fail)
- No rate limiting at proxy level
- No `proxy_buffering off` for SSE endpoints (chat/stream, gateway/logs/stream)
- Timeout at 86400s is fine for WebSocket but no explicit timeout for API proxy

---

## Summary

The dashboard has a solid foundation with good path traversal protection, no shell injection vectors, and proper Nginx configuration. The two critical issues are: (1) DASHBOARD_TOKEN being empty which disables the application-layer auth entirely (relying solely on Nginx basic auth), and (2) full secrets leaked through `raw_yaml` and `raw_value` API response fields. Adding rate limiting and restricting env var writes would bring this from 6.5 to an 8.5+.
