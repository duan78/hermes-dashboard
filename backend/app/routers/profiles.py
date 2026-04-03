import re

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse
from ..config import HERMES_HOME
from ..utils import run_hermes

router = APIRouter(prefix="/api/profiles", tags=["profiles"])


def _parse_profile_list(output: str) -> dict:
    """Parse hermes profile list output."""
    profiles = []
    active = ""
    for line in output.strip().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("---") or stripped.startswith("Profiles"):
            continue
        parts = re.split(r"\s{2,}", stripped)
        if not parts or not parts[0] or not parts[0][0].isalnum():
            continue
        name = parts[0].strip()
        if name.lower() in ("name", "profile"):
            continue
        is_default = False
        if "*" in stripped or "(default)" in stripped.lower() or "(active)" in stripped.lower():
            is_default = True
            active = name
        path = parts[-1].strip() if len(parts) > 1 else ""
        profiles.append({
            "name": name.replace("*", "").replace("(default)", "").replace("(active)", "").strip(),
            "is_default": is_default,
            "path": path,
        })
    return {"profiles": profiles, "active": active}


@router.get("/list")
async def list_profiles():
    """List all Hermes profiles."""
    try:
        output = await run_hermes("profile", "list", timeout=15)
        return _parse_profile_list(output)
    except Exception as e:
        return {"profiles": [], "active": "", "error": str(e)}


@router.post("/create")
async def create_profile(request: Request):
    """Create a new profile."""
    body = await request.json()
    name = body.get("name", "").strip()
    if not name:
        return {"success": False, "output": "Name is required"}
    try:
        output = await run_hermes("profile", "create", name, timeout=15)
        return {"success": True, "output": output}
    except Exception as e:
        return {"success": False, "output": str(e)}


@router.post("/use")
async def use_profile(request: Request):
    """Set a profile as the active default."""
    body = await request.json()
    name = body.get("name", "").strip()
    if not name:
        return {"success": False, "output": "Name is required"}
    try:
        output = await run_hermes("profile", "use", name, timeout=15)
        return {"success": True, "output": output}
    except Exception as e:
        return {"success": False, "output": str(e)}


@router.delete("/delete")
async def delete_profile(request: Request):
    """Delete a profile."""
    body = await request.json()
    name = body.get("name", "").strip()
    if not name:
        return {"success": False, "output": "Name is required"}
    try:
        output = await run_hermes("profile", "delete", name, timeout=15)
        return {"success": True, "output": output}
    except Exception as e:
        return {"success": False, "output": str(e)}


@router.post("/rename")
async def rename_profile(request: Request):
    """Rename a profile."""
    body = await request.json()
    name = body.get("name", "").strip()
    new_name = body.get("new_name", "").strip()
    if not name or not new_name:
        return {"success": False, "output": "Both name and new_name are required"}
    try:
        output = await run_hermes("profile", "rename", name, new_name, timeout=15)
        return {"success": True, "output": output}
    except Exception as e:
        return {"success": False, "output": str(e)}


@router.post("/export")
async def export_profile(request: Request):
    """Export a profile to an archive."""
    body = await request.json()
    name = body.get("name", "").strip()
    if not name:
        return {"success": False, "output": "Name is required"}
    try:
        output = await run_hermes("profile", "export", name, timeout=30)
        return {"success": True, "archive_path": "", "output": output}
    except Exception as e:
        return {"success": False, "output": str(e)}
