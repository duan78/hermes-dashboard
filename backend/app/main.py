import asyncio
import os
import struct
import fcntl
import termios
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

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
)

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

# Security headers
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
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
    return {"status": "ok", "hermes_home": str(HERMES_HOME)}


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


# ── Terminal WebSocket (mounted directly on app for reliable registration) ──

@app.websocket("/ws/terminal")
async def terminal_ws(websocket: WebSocket):
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
        except WebSocketDisconnect:
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
