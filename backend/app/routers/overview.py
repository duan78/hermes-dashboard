import asyncio
import json
import re
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter
from ..config import HERMES_PYTHON, HERMES_AGENT_DIR
from ..utils import run_hermes, hermes_path

router = APIRouter(prefix="/api/overview", tags=["overview"])


@router.get("")
async def get_overview():
    """Dashboard overview: status, model, sessions, quick stats."""
    result = {
        "gateway": None,
        "model": None,
        "sessions": {"total": 0, "active": 0},
        "skills_installed": 0,
        "cron_active": 0,
        "platforms": {},
        "uptime_seconds": None,
    }

    # Gateway state
    gw_path = hermes_path("gateway_state.json")
    if gw_path.exists():
        gw = json.loads(gw_path.read_text())
        result["gateway"] = {
            "state": gw.get("gateway_state", "unknown"),
            "pid": gw.get("pid"),
            "platforms": gw.get("platforms", {}),
        }
        # Calculate uptime from updated_at timestamp
        updated = gw.get("updated_at")
        if updated:
            try:
                dt = datetime.fromisoformat(updated).replace(tzinfo=timezone.utc)
                result["uptime_seconds"] = int((datetime.now(timezone.utc) - dt).total_seconds())
            except (ValueError, TypeError):
                pass

    # Config for model info
    import yaml
    config_path = hermes_path("config.yaml")
    if config_path.exists():
        cfg = yaml.safe_load(config_path.read_text())
        model_cfg = cfg.get("model", {})
        result["model"] = {
            "name": model_cfg.get("default", "unknown"),
            "provider": model_cfg.get("provider", "unknown"),
        }

    # Sessions count + total messages
    sessions_dir = hermes_path("sessions")
    if sessions_dir.exists():
        session_files = list(sessions_dir.glob("session_*.json"))
        result["sessions"]["total"] = len(session_files)
        total_messages = 0
        for f in session_files:
            try:
                sd = json.loads(f.read_text())
                total_messages += sd.get("message_count", 0)
            except (json.JSONDecodeError, Exception):
                continue
        result["sessions"]["messages"] = total_messages

    # Skills count
    skills_dir = hermes_path("skills")
    if skills_dir.exists():
        result["skills_installed"] = len([
            d for d in skills_dir.iterdir() if d.is_dir() and (d / "SKILL.md").exists()
        ])

    # Cron count
    cron_dir = hermes_path("cron")
    if cron_dir.exists():
        cron_files = list(cron_dir.glob("*.json"))
        result["cron_active"] = sum(
            1 for f in cron_files
            if json.loads(f.read_text()).get("enabled", True)
        ) if cron_files else 0

    # Platform connections
    if result["gateway"] and result["gateway"]["platforms"]:
        result["platforms"] = {
            k: v.get("state", "unknown")
            for k, v in result["gateway"]["platforms"].items()
        }

    return result


@router.get("/logs")
async def get_recent_logs(lines: int = 100):
    """Get recent gateway logs."""
    log_path = hermes_path("logs", "gateway.log")
    if not log_path.exists():
        return {"logs": [], "error": "No log file found"}

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: subprocess.run(
                ["tail", "-n", str(lines), str(log_path)],
                capture_output=True, text=True, timeout=5,
            ),
        )
        log_lines = result.stdout.strip().split("\n")
        return {"logs": log_lines}
    except Exception as e:
        return {"logs": [], "error": str(e)}


@router.get("/system")
async def system_metrics():
    """Get system metrics: CPU, RAM, Disk, Load."""
    import asyncio

    # CPU usage: sample /proc/stat twice with 0.5s interval
    def _read_cpu_times():
        with open("/proc/stat", "r") as f:
            line = f.readline()
        parts = line.split()[1:]
        return [int(p) for p in parts[:8]]

    try:
        t1 = _read_cpu_times()
        await asyncio.sleep(0.5)
        t2 = _read_cpu_times()

        d_idle = t2[3] - t1[3]
        d_total = sum(t2[i] - t1[i] for i in range(len(t1)))
        cpu_percent = round((1 - d_idle / d_total) * 100, 1) if d_total > 0 else 0
    except Exception:
        cpu_percent = 0

    # RAM from /proc/meminfo
    ram_total_gb = ram_used_gb = ram_percent = 0
    try:
        meminfo = {}
        with open("/proc/meminfo", "r") as f:
            for line in f:
                parts = line.split()
                if len(parts) >= 2:
                    meminfo[parts[0].rstrip(":")] = int(parts[1])

        total_kb = meminfo.get("MemTotal", 0)
        available_kb = meminfo.get("MemAvailable", 0)
        used_kb = total_kb - available_kb
        ram_total_gb = round(total_kb / 1024 / 1024, 1)
        ram_used_gb = round(used_kb / 1024 / 1024, 1)
        ram_percent = round((used_kb / total_kb) * 100, 1) if total_kb > 0 else 0
    except Exception:
        pass

    # Disk
    disk_total_gb = disk_used_gb = disk_percent = 0
    try:
        disk = shutil.disk_usage("/")
        disk_total_gb = round(disk.total / (1024 ** 3), 1)
        disk_used_gb = round(disk.used / (1024 ** 3), 1)
        disk_percent = round((disk.used / disk.total) * 100, 1) if disk.total > 0 else 0
    except Exception:
        pass

    # Load average
    load_avg = [0.0, 0.0, 0.0]
    try:
        with open("/proc/loadavg", "r") as f:
            parts = f.read().split()
            load_avg = [float(parts[i]) for i in range(3)]
    except Exception:
        pass

    return {
        "cpu_percent": cpu_percent,
        "ram_total_gb": ram_total_gb,
        "ram_used_gb": ram_used_gb,
        "ram_percent": ram_percent,
        "disk_total_gb": disk_total_gb,
        "disk_used_gb": disk_used_gb,
        "disk_percent": disk_percent,
        "load_avg": load_avg,
    }





@router.get("/version")
async def hermes_version():
    """Get current Hermes Agent version info."""
    try:
        proc = await asyncio.create_subprocess_exec(
            HERMES_PYTHON, "-m", "hermes_cli.main", "version",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=15)
        output = stdout.decode(errors="replace") + stderr.decode(errors="replace")

        result = {
            "current_version": "",
            "version_date": "",
            "project_path": "",
            "python_version": "",
            "openai_sdk_version": "",
            "update_available": False,
            "commits_behind": 0,
            "raw": output.strip(),
        }

        for line in output.strip().splitlines():
            line = line.strip()
            if line.startswith("Hermes Agent"):
                m = re.match(r"Hermes Agent\s+(v[\d.]+)\s*\(([^)]+)\)", line)
                if m:
                    result["current_version"] = m.group(1)
                    result["version_date"] = m.group(2)
            elif line.startswith("Project:"):
                result["project_path"] = line.split(":", 1)[1].strip()
            elif line.startswith("Python:"):
                result["python_version"] = line.split(":", 1)[1].strip()
            elif line.startswith("OpenAI SDK:"):
                result["openai_sdk_version"] = line.split(":", 1)[1].strip()
            elif "Update available" in line:
                result["update_available"] = True
                m = re.search(r"(\d+)\s+commits?\s+behind", line)
                if m:
                    result["commits_behind"] = int(m.group(1))

        return result
    except Exception as e:
        return {"error": str(e), "raw": "", "current_version": "", "update_available": False, "commits_behind": 0}


@router.post("/update")
async def hermes_update():
    """Run hermes update (git pull + pip install)."""
    try:
        proc = await asyncio.create_subprocess_exec(
            HERMES_PYTHON, "-m", "hermes_cli.main", "update",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)
        output = stdout.decode(errors="replace")
        err = stderr.decode(errors="replace")

        success = proc.returncode == 0
        return {
            "success": success,
            "output": (output + "\n" + err).strip() if err else output.strip(),
            "error": err.strip() if not success and err else "",
        }
    except asyncio.TimeoutError:
        return {"success": False, "output": "", "error": "Update timed out after 300 seconds"}
    except Exception as e:
        return {"success": False, "output": "", "error": str(e)}


@router.get("/changelog")
async def hermes_changelog():
    """Get changelog (commits behind origin/main)."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "git", "log", "--oneline", "HEAD..origin/main",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(HERMES_AGENT_DIR),
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=15)
        output = stdout.decode(errors="replace").strip()

        commits = []
        for line in output.splitlines():
            line = line.strip()
            if not line:
                continue
            parts = line.split(None, 1)
            if len(parts) == 2:
                commits.append({"hash": parts[0], "message": parts[1]})

        return {"commits": commits[:20], "total_behind": len(commits)}
    except Exception as e:
        return {"commits": [], "total_behind": 0, "error": str(e)}
