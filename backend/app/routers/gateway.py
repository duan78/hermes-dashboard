import asyncio
import logging
import re
from pathlib import Path

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from ..config import HERMES_HOME
from ..schemas.gateway import GatewayStatus, GatewayActionResponse, GatewayLogsResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/gateway", tags=["gateway"])

LOG_PATH = HERMES_HOME / "logs" / "gateway.log"

SYSTEMCTL_ENV = {"XDG_RUNTIME_DIR": "/run/user/0"}


def _parse_systemctl_output(output: str) -> dict:
    """Parse systemctl --user status output."""
    result = {
        "state": "unknown",
        "pid": None,
        "memory_current_mb": None,
        "memory_peak_mb": None,
        "cpu_seconds": None,
        "uptime": None,
        "tasks": None,
        "service_loaded": False,
        "service_enabled": False,
    }

    # State: Active: active (running) / inactive (dead)
    m = re.search(r"Active:\s+(\S+)\s+\((\S+)\)", output)
    if m:
        result["state"] = m.group(2)  # "running", "dead"
    else:
        m = re.search(r"Active:\s+(\S+)", output)
        if m:
            result["state"] = m.group(1)  # "inactive"

    # Map state
    if result["state"] == "dead":
        result["state"] = "stopped"
    elif result["state"] == "running":
        pass
    elif result["state"] in ("inactive", "failed"):
        result["state"] = "stopped"

    # Loaded: loaded / not-found
    if "Loaded:" in output:
        m = re.search(r"Loaded:\s+loaded", output)
        result["service_loaded"] = bool(m)

    # Enabled status from systemctl is-enabled
    if "enabled" in output.lower():
        result["service_enabled"] = True

    # Main PID
    m = re.search(r"Main PID:\s+(\d+)", output)
    if m:
        result["pid"] = int(m.group(1))

    # Memory
    m = re.search(r"Memory:\s+([\d.]+)([KMGT]?)(?:.*peak:\s*([\d.]+)([KMGT]?))?", output)
    if m:
        val = float(m.group(1))
        unit = m.group(2) or "K"
        if unit == "K":
            result["memory_current_mb"] = round(val / 1024, 1)
        elif unit == "M":
            result["memory_current_mb"] = round(val, 1)
        elif unit == "G":
            result["memory_current_mb"] = round(val * 1024, 1)
        else:
            result["memory_current_mb"] = round(val, 1)
        if m.group(3):
            pval = float(m.group(3))
            punit = m.group(4) or "K"
            if punit == "K":
                result["memory_peak_mb"] = round(pval / 1024, 1)
            elif punit == "M":
                result["memory_peak_mb"] = round(pval, 1)
            elif punit == "G":
                result["memory_peak_mb"] = round(pval * 1024, 1)

    # CPU
    m = re.search(r"CPU:\s+([\d.]+)([ms]?)", output)
    if m:
        val = float(m.group(1))
        unit = m.group(2)
        if unit == "m":
            result["cpu_seconds"] = round(val / 1000, 2)
        elif unit == "s" or unit == "":
            result["cpu_seconds"] = round(val, 2)

    # Tasks
    m = re.search(r"Tasks:\s+(\d+)", output)
    if m:
        result["tasks"] = int(m.group(1))

    return result


@router.get("/status", response_model=GatewayStatus)
async def gateway_status():
    """Get gateway service status via systemctl."""
    proc = await asyncio.create_subprocess_exec(
        "systemctl", "--user", "status", "hermes-gateway", "--no-pager",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=SYSTEMCTL_ENV,
    )
    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
    output = stdout.decode(errors="replace")

    result = _parse_systemctl_output(output)

    # Check enabled status separately
    proc2 = await asyncio.create_subprocess_exec(
        "systemctl", "--user", "is-enabled", "hermes-gateway",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=SYSTEMCTL_ENV,
    )
    out2, _ = await asyncio.wait_for(proc2.communicate(), timeout=5)
    result["service_enabled"] = out2.decode(errors="replace").strip() == "enabled"

    return result


@router.post("/restart", response_model=GatewayActionResponse)
async def gateway_restart():
    """Restart the gateway service."""
    proc = await asyncio.create_subprocess_exec(
        "systemctl", "--user", "restart", "hermes-gateway",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=SYSTEMCTL_ENV,
    )
    await asyncio.wait_for(proc.communicate(), timeout=15)

    await asyncio.sleep(3)

    proc2 = await asyncio.create_subprocess_exec(
        "systemctl", "--user", "status", "hermes-gateway", "--no-pager",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=SYSTEMCTL_ENV,
    )
    out, _ = await asyncio.wait_for(proc2.communicate(), timeout=10)
    status = _parse_systemctl_output(out.decode(errors="replace"))

    return {"status": "restarted", "new_state": status["state"]}


@router.post("/stop", response_model=GatewayActionResponse)
async def gateway_stop():
    """Stop the gateway service."""
    proc = await asyncio.create_subprocess_exec(
        "systemctl", "--user", "stop", "hermes-gateway",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=SYSTEMCTL_ENV,
    )
    await asyncio.wait_for(proc.communicate(), timeout=15)
    return {"status": "stopped"}


@router.post("/start", response_model=GatewayActionResponse)
async def gateway_start():
    """Start the gateway service."""
    proc = await asyncio.create_subprocess_exec(
        "systemctl", "--user", "start", "hermes-gateway",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=SYSTEMCTL_ENV,
    )
    await asyncio.wait_for(proc.communicate(), timeout=15)

    await asyncio.sleep(2)

    proc2 = await asyncio.create_subprocess_exec(
        "systemctl", "--user", "status", "hermes-gateway", "--no-pager",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=SYSTEMCTL_ENV,
    )
    out, _ = await asyncio.wait_for(proc2.communicate(), timeout=10)
    status = _parse_systemctl_output(out.decode(errors="replace"))

    return {"status": "started", "new_state": status["state"]}


def _parse_log_line(line: str) -> dict:
    """Parse a log line into structured data."""
    # Format: "2026-04-03 18:08:05,087 INFO httpx: HTTP Request..."
    m = re.match(r"(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2},\d+)\s+(DEBUG|INFO|WARNING|ERROR|CRITICAL)\s+(\S+?):\s+(.*)", line)
    if m:
        return {
            "timestamp": m.group(1),
            "level": m.group(2),
            "logger": m.group(3),
            "message": m.group(4),
        }
    return {"timestamp": "", "level": "INFO", "logger": "", "message": line}


@router.get("/logs", response_model=GatewayLogsResponse)
async def gateway_logs(
    lines: int = Query(default=100),
    level: str = Query(default="all"),
    search: str = Query(default=""),
):
    """Get gateway log entries."""
    if not LOG_PATH.exists():
        return {"logs": [], "total_lines": 0, "filtered": 0}

    try:
        text = LOG_PATH.read_text(errors="replace")
        all_lines = text.strip().split("\n")
        tail = all_lines[-lines:] if len(all_lines) > lines else all_lines

        parsed = [_parse_log_line(l) for l in tail if l.strip()]

        # Filter by level
        if level and level.lower() != "all":
            level_upper = level.upper()
            if level_upper == "ERROR":
                parsed = [p for p in parsed if p["level"] in ("ERROR", "CRITICAL")]
            elif level_upper == "WARNING":
                parsed = [p for p in parsed if p["level"] in ("WARNING", "ERROR", "CRITICAL")]
            elif level_upper == "INFO":
                parsed = [p for p in parsed if p["level"] in ("DEBUG", "INFO")]

        # Filter by search
        if search:
            search_lower = search.lower()
            parsed = [p for p in parsed if search_lower in p["message"].lower()]

        return {"logs": parsed, "total_lines": len(all_lines), "filtered": len(parsed)}
    except Exception as e:
        return {"logs": [], "total_lines": 0, "filtered": 0, "error": str(e)}


@router.get("/logs/stream")
async def gateway_logs_stream(level: str = Query(default="all")):
    """SSE endpoint for streaming gateway logs in real-time."""
    async def event_generator():
        proc = await asyncio.create_subprocess_exec(
            "tail", "-f", str(LOG_PATH),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            while True:
                line = await asyncio.wait_for(proc.stdout.readline(), timeout=30)
                if not line:
                    break
                line_str = line.decode(errors="replace").rstrip()
                if not line_str:
                    continue

                parsed = _parse_log_line(line_str)

                # Filter by level
                if level and level.lower() != "all":
                    level_upper = level.upper()
                    if level_upper == "ERROR" and parsed["level"] not in ("ERROR", "CRITICAL"):
                        continue
                    elif level_upper == "WARNING" and parsed["level"] not in ("WARNING", "ERROR", "CRITICAL"):
                        continue

                import json
                yield f"data: {json.dumps(parsed)}\n\n"
        except asyncio.TimeoutError:
            yield f"data: {json.dumps({'timestamp': '', 'level': 'INFO', 'logger': 'dashboard', 'message': 'keepalive'})}\n\n"
        except Exception as e:
            logger.warning("Error in log stream: %s", e)
        finally:
            proc.kill()

    return StreamingResponse(event_generator(), media_type="text/event-stream")
