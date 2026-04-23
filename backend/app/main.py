import asyncio
import collections
import datetime
import fcntl
import json
import logging
import os
import struct
import termios
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .auth import AuthMiddleware
from .config import HERMES_HOME, HOST, PORT
from .routers import (
    activity,
    api_keys,
    approvals,
    auth_pairing,
    backlog,
    backup,
    chat,
    claude_code,
    code_execution,
    config,
    context,
    cron,
    diagnostics,
    delegation,
    env_vars,
    export,
    files,
    fine_tune,
    gateway,
    github_config,
    insights,
    leads,
    mcp,
    mcp_oauth,
    memory,
    models,
    notifications,
    overview,
    platforms,
    plugins_router,
    profiles,
    projects,
    search,
    search_history,
    sessions,
    skills,
    skills_security,
    tags,
    tools,
    discord_listings,
    rl_training,
    tts_test,
    users,
    vision,
    webhooks,
    wiki,
)

# ── Structured logging setup ──
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Audit trail setup ──
AUDIT_LOG_PATH = Path("/tmp/dashboard-audit.log")
AUDIT_MAX_BYTES = 10 * 1024 * 1024  # 10 MB


def _rotate_audit_log():
    """Rotate audit log if it exceeds max size."""
    try:
        if AUDIT_LOG_PATH.exists() and AUDIT_LOG_PATH.stat().st_size > AUDIT_MAX_BYTES:
            backup = AUDIT_LOG_PATH.with_suffix(".log.1")
            if backup.exists():
                backup.unlink()
            AUDIT_LOG_PATH.rename(backup)
    except OSError:
        pass


def _write_audit(entry: dict):
    """Append a JSON-line entry to the audit log."""
    _rotate_audit_log()
    try:
        with open(AUDIT_LOG_PATH, "a") as f:
            f.write(json.dumps(entry, default=str) + "\n")
    except OSError:
        pass

app = FastAPI(
    title="Hermes Dashboard",
    description="Web dashboard for Hermes Agent administration",
    version="0.1.0",
)

# CORS for frontend dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        f"http://{os.getenv('SERVER_IP', '82.29.175.64')}",
        f"http://{os.getenv('SERVER_IP', '82.29.175.64')}/dashboard",
        "http://127.0.0.1:3100",
        "http://localhost:3100",
        "http://100.113.69.73",  # Tailscale
        "http://100.113.69.73/dashboard",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth
app.add_middleware(AuthMiddleware)

# ── Rate limiting (in-memory sliding window) ──
_rate_windows: dict[str, collections.deque] = collections.defaultdict(collections.deque)
DEFAULT_LIMIT = 60
DEFAULT_WINDOW = 60  # seconds

SENSITIVE_LIMITS = {
    "/api/chat": 20,
    "/api/auth": 10,
    "/api/users/login": 10,
    "/api/users/register": 5,
    "/api/files/write": 15,
    "/api/diagnostics": 10,
    "/api/overview/update": 5,
}

MAX_BODY_SIZE = 10 * 1024 * 1024  # 10 MB
RATE_CLEANUP_INTERVAL = 300  # Clean stale buckets every 5 minutes
_last_rate_cleanup = 0.0


def _cleanup_stale_buckets():
    """Remove empty buckets to prevent unbounded memory growth."""
    global _last_rate_cleanup
    now = time.time()
    if now - _last_rate_cleanup < RATE_CLEANUP_INTERVAL:
        return
    _last_rate_cleanup = now
    stale_keys = [k for k, v in _rate_windows.items() if not v]
    for k in stale_keys:
        del _rate_windows[k]


def _check_rate_limit(ip: str, path: str) -> tuple[bool, int, int]:
    """Return (allowed, remaining, retry_after)."""
    window = DEFAULT_WINDOW
    limit = DEFAULT_LIMIT

    for prefix, lim in SENSITIVE_LIMITS.items():
        if path.startswith(prefix):
            limit = lim
            break

    key = f"{ip}:{path}"
    now = time.time()
    bucket = _rate_windows[key]

    # Prune old entries
    while bucket and bucket[0] <= now - window:
        bucket.popleft()

    if len(bucket) >= limit:
        retry_after = int(bucket[0] + window - now) + 1
        return False, 0, retry_after

    bucket.append(now)
    _cleanup_stale_buckets()
    return True, limit - len(bucket), 0


# ── Body size + rate limiting + security headers + structured logging + audit middleware ──
@app.middleware("http")
async def security_middleware(request: Request, call_next):
    # Skip WebSocket
    if request.scope.get("type") == "websocket":
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        return response

    # Generate request_id for correlation
    request_id = str(uuid.uuid4())[:8]

    # Propagate user info from ASGI scope (set by AuthMiddleware) to request.state
    user_info = request.scope.get("user")
    if user_info:
        request.state.user = user_info
    else:
        request.state.user = None

    # Body size limit (skip GET/HEAD/DELETE/OPTIONS)
    if request.method in ("POST", "PUT", "PATCH"):
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > MAX_BODY_SIZE:
                    return JSONResponse(
                        status_code=413,
                        content={"detail": "Request body too large (max 10 MB)"},
                    )
            except ValueError:
                pass

    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    path = request.url.path

    # Skip health, static assets, and favicon
    if path not in ("/api/health", "/favicon.ico") and not path.startswith("/assets"):
        allowed, remaining, retry_after = _check_rate_limit(client_ip, path)
        if not allowed:
            logger.warning("[%s] %s %s 429 rate_limited ip=%s", request_id, request.method, path, client_ip)
            response = JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded"},
            )
            response.headers["Retry-After"] = str(retry_after)
            response.headers["X-RateLimit-Remaining"] = "0"
            response.headers["X-Request-ID"] = request_id
            return response

    start_time = time.monotonic()
    response = await call_next(request)
    elapsed_ms = int((time.monotonic() - start_time) * 1000)

    # Structured logging
    logger.info(
        "[%s] %s %s %s %dms ip=%s",
        request_id, request.method, path, response.status_code, elapsed_ms, client_ip,
    )

    # Audit trail for mutations
    if request.method in ("POST", "PUT", "DELETE", "PATCH") and path.startswith("/api/"):
        user_agent = request.headers.get("user-agent", "")
        _write_audit({
            "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
            "request_id": request_id,
            "method": request.method,
            "path": path,
            "status_code": response.status_code,
            "ip": client_ip,
            "user_agent": user_agent,
            "elapsed_ms": elapsed_ms,
        })

    # Security headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["X-Request-ID"] = request_id
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "connect-src 'self' http://127.0.0.1:*;"
    )
    return response


# Health check
@app.get("/api/health")
async def health():
    return {"status": "ok"}


# Register routers
app.include_router(overview.router)
app.include_router(config.router)
app.include_router(sessions.router)
app.include_router(memory.router)
app.include_router(tools.router)
app.include_router(discord_listings.router)
app.include_router(rl_training.router)
app.include_router(vision.router)
app.include_router(tts_test.router)
app.include_router(skills.router)
app.include_router(skills_security.router)
app.include_router(cron.router)
app.include_router(models.router)
app.include_router(platforms.router)
app.include_router(insights.router)
app.include_router(chat.router)
app.include_router(files.router)
app.include_router(api_keys.router)
app.include_router(fine_tune.router)
app.include_router(gateway.router)
app.include_router(diagnostics.router)
app.include_router(webhooks.router)
app.include_router(env_vars.router)
app.include_router(plugins_router.router)
app.include_router(mcp.router)
app.include_router(mcp_oauth.router)
app.include_router(auth_pairing.router)
app.include_router(profiles.router)
app.include_router(backup.router)
app.include_router(claude_code.router)
app.include_router(wiki.router)
app.include_router(code_execution.router)
app.include_router(backlog.router)
app.include_router(projects.router)
app.include_router(users.router)
app.include_router(leads.router)
app.include_router(github_config.router)
app.include_router(search_history.router)
app.include_router(delegation.router)
app.include_router(approvals.router)
app.include_router(context.router)
app.include_router(notifications.router)
app.include_router(tags.router)
app.include_router(activity.router)
app.include_router(search.router)
app.include_router(export.router)


# ── WebSocket Hub for real-time dashboard updates ──
from .websocket_hub import poll_bridge, ws_hub_handler


@app.websocket("/ws/hub")
async def dashboard_hub_ws(websocket: WebSocket):
    """WebSocket endpoint for real-time dashboard events."""
    await ws_hub_handler(websocket)


@app.on_event("startup")
async def _start_poll_bridge():
    poll_bridge.start()

# ── Autofeed endpoints ──
from .services.autofeed import autofeed_service


@app.get("/api/autofeed/status")
async def autofeed_status():
    return autofeed_service.get_status()


@app.post("/api/autofeed/trigger")
async def autofeed_trigger():
    await autofeed_service.run_scan()
    return {"status": "ok", **autofeed_service.get_status()}


@app.get("/api/autofeed/config")
async def autofeed_config_get():
    return {"interval": autofeed_service.interval}


class AutofeedConfigUpdate:
    pass


@app.patch("/api/autofeed/config")
async def autofeed_config_update(request: Request):
    body = await request.json()
    if "interval" in body:
        new_interval = int(body["interval"])
        if new_interval < 60:
            raise HTTPException(400, "Interval must be >= 60 seconds")
        autofeed_service.interval = new_interval
    return {"interval": autofeed_service.interval}


@app.on_event("startup")
async def _start_autofeed_service():
    autofeed_service.start()


@app.on_event("shutdown")
async def _stop_poll_bridge():
    poll_bridge.stop()
    autofeed_service.stop()


# ── Terminal WebSocket (mounted directly on app for reliable registration) ──

TERMINAL_LOG_PATH = Path("/tmp/dashboard-terminal.log")
TERMINAL_LOG_MAX_BYTES = 50 * 1024 * 1024  # 50 MB
TERMINAL_INACTIVITY_TIMEOUT = 30 * 60  # 30 minutes
TERMINAL_AUTH_TIMEOUT = 10  # seconds to send initial auth message


def _rotate_terminal_log():
    """Rotate terminal log if it exceeds max size."""
    try:
        if TERMINAL_LOG_PATH.exists() and TERMINAL_LOG_PATH.stat().st_size > TERMINAL_LOG_MAX_BYTES:
            backup = TERMINAL_LOG_PATH.with_suffix(".log.1")
            if backup.exists():
                backup.unlink()
            TERMINAL_LOG_PATH.rename(backup)
    except OSError:
        pass


def _log_terminal_event(entry: dict):
    """Append a JSON-line entry to the terminal audit log."""
    _rotate_terminal_log()
    try:
        with open(TERMINAL_LOG_PATH, "a") as f:
            f.write(json.dumps(entry, default=str) + "\n")
    except OSError:
        pass


@app.websocket("/ws/terminal")
async def terminal_ws(websocket):
    """WebSocket endpoint that spawns an interactive PTY shell.

    Security flow:
    1. AuthMiddleware validates bearer token before connection is accepted
    2. First message must be {"type": "auth", "token": "..."} (defense in depth)
    3. All input is logged to /tmp/dashboard-terminal.log
    4. Connection closed after 30 min of inactivity
    """
    await websocket.accept()

    session_id = str(uuid.uuid4())[:8]
    client_ip = websocket.client.host if websocket.client else "unknown"

    _log_terminal_event({
        "event": "ws_connected",
        "session_id": session_id,
        "ip": client_ip,
        "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
    })

    # ── Step 1: Re-authenticate via initial message (defense in depth) ──
    try:
        auth_raw = await asyncio.wait_for(websocket.receive_text(), timeout=TERMINAL_AUTH_TIMEOUT)
        auth_msg = json.loads(auth_raw)
        if auth_msg.get("type") != "auth":
            raise ValueError("First message must be auth")
        from .auth import verify_token
        if not verify_token(auth_msg.get("token", "")):
            raise ValueError("Invalid token")
    except TimeoutError:
        _log_terminal_event({
            "event": "auth_timeout",
            "session_id": session_id,
            "ip": client_ip,
            "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
        })
        await websocket.send_text(json.dumps({"type": "error", "message": "Auth timeout"}))
        await websocket.close(code=4008)
        return
    except (json.JSONDecodeError, ValueError) as e:
        _log_terminal_event({
            "event": "auth_failed",
            "session_id": session_id,
            "ip": client_ip,
            "reason": str(e),
            "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
        })
        await websocket.send_text(json.dumps({"type": "error", "message": f"Auth failed: {e}"}))
        await websocket.close(code=4008)
        return
    except Exception:
        await websocket.close(code=4008)
        return

    _log_terminal_event({
        "event": "session_started",
        "session_id": session_id,
        "ip": client_ip,
        "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
    })

    # Send auth success so the frontend knows it can proceed
    await websocket.send_text(json.dumps({"type": "auth_ok"}))

    # ── Step 2: Spawn PTY ──
    shell = os.environ.get("SHELL", "/bin/bash")

    try:
        master_fd, slave_fd = os.openpty()
    except OSError as e:
        await websocket.send_text(f"\r\nFailed to create PTY: {e}\r\n")
        await websocket.close()
        return

    cols, rows = 80, 24
    home_dir = str(HERMES_HOME.parent) if HERMES_HOME else os.environ.get("HOME", "/root")

    process = await asyncio.create_subprocess_exec(
        shell,
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        env={
            **os.environ,
            "TERM": "xterm-256color",
            "COLUMNS": str(cols),
            "LINES": str(rows),
            "HOME": home_dir,
        },
        start_new_session=True,
    )

    os.close(slave_fd)

    last_activity = time.monotonic()

    async def read_pty():
        """Read PTY output and send to WebSocket."""
        nonlocal last_activity
        loop = asyncio.get_event_loop()
        try:
            while process.returncode is None:
                try:
                    data = await loop.run_in_executor(None, os.read, master_fd, 4096)
                    if not data:
                        break
                    last_activity = time.monotonic()
                    await websocket.send_text(data.decode(errors="replace"))
                except OSError:
                    break
        except Exception:
            pass
        finally:
            try:
                os.close(master_fd)
            except OSError:
                pass

    async def write_pty():
        """Read WebSocket messages and write to PTY."""
        nonlocal last_activity
        try:
            while True:
                raw = await websocket.receive_text()
                last_activity = time.monotonic()
                try:
                    msg = json.loads(raw)
                except (json.JSONDecodeError, ValueError):
                    # Raw text input — log it
                    _log_terminal_event({
                        "event": "input",
                        "session_id": session_id,
                        "data": raw,
                        "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
                    })
                    os.write(master_fd, raw.encode())
                    continue

                if msg.get("type") == "input":
                    input_data = msg.get("data", "")
                    _log_terminal_event({
                        "event": "input",
                        "session_id": session_id,
                        "data": input_data,
                        "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
                    })
                    os.write(master_fd, input_data.encode())
                elif msg.get("type") == "resize":
                    nonlocal cols, rows
                    cols = msg.get("cols", cols)
                    rows = msg.get("rows", rows)
                    try:
                        winsize = struct.pack("HHHH", rows, cols, 0, 0)
                        fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsize)
                    except Exception:
                        pass
        except Exception:
            pass

    async def inactivity_watchdog():
        """Close connection after TERMINAL_INACTIVITY_TIMEOUT of no activity."""
        try:
            while True:
                await asyncio.sleep(60)  # Check every minute
                if time.monotonic() - last_activity > TERMINAL_INACTIVITY_TIMEOUT:
                    _log_terminal_event({
                        "event": "inactivity_timeout",
                        "session_id": session_id,
                        "ip": client_ip,
                        "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
                    })
                    try:
                        await websocket.send_text(
                            json.dumps({"type": "error", "message": "Session timed out (30 min inactivity)"})
                        )
                    except Exception:
                        pass
                    await websocket.close(code=4008)
                    return
        except asyncio.CancelledError:
            pass

    read_task = asyncio.create_task(read_pty())
    write_task = asyncio.create_task(write_pty())
    watchdog_task = asyncio.create_task(inactivity_watchdog())

    try:
        await asyncio.gather(read_task, write_task, watchdog_task, return_exceptions=True)
    finally:
        for task in [read_task, write_task, watchdog_task]:
            if not task.done():
                task.cancel()
        if process.returncode is None:
            try:
                process.terminate()
                await asyncio.wait_for(process.wait(), timeout=3)
            except Exception:
                try:
                    process.kill()
                except Exception:
                    pass
        try:
            os.close(master_fd)
        except OSError:
            pass

        _log_terminal_event({
            "event": "session_ended",
            "session_id": session_id,
            "ip": client_ip,
            "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
        })

# Serve frontend static files in production
static_dir = Path(__file__).parent.parent / "static"
if static_dir.exists():
    # Mount assets directory
    assets_dir = static_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    # Serve index.html for SPA fallback (skip /api/ routes — those are handled by routers)
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        file_path = static_dir / full_path
        if full_path and file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(static_dir / "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
