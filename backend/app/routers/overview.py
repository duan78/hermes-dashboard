import json
import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter
from ..config import HERMES_HOME
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

    # Sessions count
    sessions_dir = hermes_path("sessions")
    if sessions_dir.exists():
        session_files = list(sessions_dir.glob("session_*.json"))
        result["sessions"]["total"] = len(session_files)

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
        text = log_path.read_text(errors="replace")
        all_lines = text.strip().split("\n")
        return {"logs": all_lines[-lines:]}
    except Exception as e:
        return {"logs": [], "error": str(e)}
