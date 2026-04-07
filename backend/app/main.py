import asyncio
import collections
import datetime
import json
import logging
import os
import struct
import time
import uuid
import fcntl
import termios
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from .auth import AuthMiddleware
from .config import HOST, PORT, HERMES_HOME
from .routers import (
    overview,
    config,
    sessions,
    memory,
    tools,
    skills,
    cron,
    models,
    platforms,
    insights,
    chat,
    files,
    terminal,
    api_keys,
    fine_tune,
    gateway,
    diagnostics,
    webhooks,
    env_vars,
    plugins_router,
    mcp,
    auth_pairing,
    profiles,
    backup,
    claude_code,
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
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", f"http://127.0.0.1:{PORT}"],
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
    "/api/files/write": 15,
    "/api/diagnostics": 10,
    "/api/overview/update": 5,
}

MAX_BODY_SIZE = 10 * 1024 * 1024  # 10 MB


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
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
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
app.include_router(skills.router)
app.include_router(cron.router)
app.include_router(models.router)
app.include_router(platforms.router)
app.include_router(insights.router)
app.include_router(chat.router)
app.include_router(files.router)
app.include_router(terminal.router)
app.include_router(api_keys.router)
app.include_router(fine_tune.router)
app.include_router(gateway.router)
app.include_router(diagnostics.router)
app.include_router(webhooks.router)
app.include_router(env_vars.router)
app.include_router(plugins_router.router)
app.include_router(mcp.router)
app.include_router(auth_pairing.router)
app.include_router(profiles.router)
app.include_router(backup.router)
app.include_router(claude_code.router)
app.include_router(wiki.router)


# ── WebSocket Hub for real-time dashboard updates ──
from .websocket_hub import ws_hub_handler, poll_bridge

@app.websocket("/ws/hub")
async def dashboard_hub_ws(websocket):
    """WebSocket endpoint for real-time dashboard events."""
    await ws_hub_handler(websocket)


@app.on_event("startup")
async def _start_poll_bridge():
    poll_bridge.start()

@app.on_event("shutdown")
async def _stop_poll_bridge():
    poll_bridge.stop()


# ── Terminal WebSocket (mounted directly on app for reliable registration) ──

@app.websocket("/ws/terminal")
async def terminal_ws(websocket):
    """WebSocket endpoint that spawns an interactive PTY shell."""
    await websocket.accept()

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

    async def read_pty():
        """Read PTY output and send to WebSocket."""
        loop = asyncio.get_event_loop()
        try:
            while process.returncode is None:
                try:
                    data = await loop.run_in_executor(None, os.read, master_fd, 4096)
                    if not data:
                        break
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
        try:
            while True:
                raw = await websocket.receive_text()
                import json
                try:
                    msg = json.loads(raw)
                except (json.JSONDecodeError, ValueError):
                    os.write(master_fd, raw.encode())
                    continue

                if msg.get("type") == "input":
                    os.write(master_fd, msg.get("data", "").encode())
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

    read_task = asyncio.create_task(read_pty())
    write_task = asyncio.create_task(write_pty())

    try:
        await asyncio.gather(read_task, write_task, return_exceptions=True)
    finally:
        for task in [read_task, write_task]:
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

# Serve frontend static files in production
static_dir = Path(__file__).parent.parent / "static"
if static_dir.exists():
    # Mount assets directory
    assets_dir = static_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    # Serve index.html for SPA fallback
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = static_dir / full_path
        if full_path and file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(static_dir / "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
