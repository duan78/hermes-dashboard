import asyncio
import os
import sys

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ..config import HERMES_HOME

router = APIRouter(tags=["terminal"])


@router.websocket("/ws/terminal")
async def terminal_ws(websocket: WebSocket):
    """WebSocket endpoint that spawns an interactive shell."""
    await websocket.accept()

    # Determine shell
    shell = os.environ.get("SHELL", "/bin/bash")

    # Start PTY subprocess
    try:
        master_fd, slave_fd = os.openpty()
    except OSError as e:
        await websocket.send_json({"type": "error", "data": f"Failed to create PTY: {e}"})
        await websocket.close()
        return

    # Set terminal size
    cols = 80
    rows = 24

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
            "HOME": str(HERMES_HOME.parent) if HERMES_HOME else os.environ.get("HOME", "/root"),
        },
        start_new_session=True,
    )

    os.close(slave_fd)

    async def read_output():
        """Read PTY output and send to WebSocket."""
        loop = asyncio.get_event_loop()
        try:
            while process.returncode is None:
                try:
                    data = await loop.run_in_executor(None, os.read, master_fd, 4096)
                    if not data:
                        break
                    # Send as text — xterm.js expects string data
                    text = data.decode(errors="replace")
                    await websocket.send_text(text)
                except OSError:
                    break
        except Exception:
            pass
        finally:
            try:
                os.close(master_fd)
            except OSError:
                pass

    async def write_input():
        """Read WebSocket messages and write to PTY."""
        try:
            while True:
                raw = await websocket.receive_text()
                try:
                    import json
                    msg = json.loads(raw)
                except (json.JSONDecodeError, ValueError):
                    # Plain text — write directly
                    os.write(master_fd, raw.encode())
                    continue

                if msg.get("type") == "input":
                    text = msg.get("data", "")
                    os.write(master_fd, text.encode())
                elif msg.get("type") == "resize":
                    nonlocal cols, rows
                    cols = msg.get("cols", cols)
                    rows = msg.get("rows", rows)
                    try:
                        import fcntl
                        import termios
                        import struct
                        TIOCSWINSZ = 0x5414  # Linux
                        winsize = struct.pack("HHHH", rows, cols, 0, 0)
                        fcntl.ioctl(master_fd, TIOCSWINSZ, winsize)
                    except Exception:
                        pass
        except WebSocketDisconnect:
            pass
        except Exception:
            pass

    read_task = asyncio.create_task(read_output())
    write_task = asyncio.create_task(write_input())

    try:
        await asyncio.gather(read_task, write_task, return_exceptions=True)
    finally:
        # Cleanup
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
