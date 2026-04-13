import re

from fastapi import APIRouter, Request

from ..utils import run_hermes

router = APIRouter(prefix="/api/plugins", tags=["plugins"])


def _parse_plugins_list(output: str) -> list:
    """Parse hermes plugins list output."""
    plugins = []
    for line in output.strip().splitlines():
        line = line.strip()
        if not line or line.startswith("No ") or line.startswith("Plugins"):
            continue
        # Try tabular or space-separated: name version status source
        parts = re.split(r"\s{2,}", line)
        if len(parts) >= 2:
            name = parts[0].strip()
            # Skip header lines
            if name.lower() in ("name", "plugin", "---"):
                continue
            version = parts[1].strip() if len(parts) > 1 else ""
            enabled = True
            source = ""
            path = ""
            if len(parts) > 2:
                status_str = parts[2].strip().lower()
                enabled = status_str not in ("disabled", "off", "no")
            if len(parts) > 3:
                source = parts[3].strip()
            if len(parts) > 4:
                path = parts[4].strip()
            plugins.append({
                "name": name,
                "version": version,
                "enabled": enabled,
                "source": source,
                "path": path,
            })
    return plugins


@router.get("/list")
async def list_plugins():
    """List installed Hermes plugins."""
    try:
        output = await run_hermes("plugins", "list", timeout=30)
        plugins = _parse_plugins_list(output)
    except Exception as e:
        return {"plugins": [], "error": str(e)}
    return {"plugins": plugins}


@router.post("/install")
async def install_plugin(request: Request):
    """Install a plugin from a Git URL."""
    body = await request.json()
    url = body.get("url", "").strip()
    if not url:
        return {"success": False, "output": "URL is required"}
    try:
        output = await run_hermes("plugins", "install", url, timeout=120)
        return {"success": True, "output": output}
    except Exception as e:
        return {"success": False, "output": str(e)}


@router.post("/remove")
async def remove_plugin(request: Request):
    """Remove an installed plugin."""
    body = await request.json()
    name = body.get("name", "").strip()
    if not name:
        return {"success": False, "output": "Name is required"}
    try:
        output = await run_hermes("plugins", "remove", name, timeout=60)
        return {"success": True, "output": output}
    except Exception as e:
        return {"success": False, "output": str(e)}


@router.post("/enable")
async def enable_plugin(request: Request):
    """Enable a plugin."""
    body = await request.json()
    name = body.get("name", "").strip()
    if not name:
        return {"success": False, "output": "Name is required"}
    try:
        output = await run_hermes("plugins", "enable", name, timeout=30)
        return {"success": True, "output": output}
    except Exception as e:
        return {"success": False, "output": str(e)}


@router.post("/disable")
async def disable_plugin(request: Request):
    """Disable a plugin."""
    body = await request.json()
    name = body.get("name", "").strip()
    if not name:
        return {"success": False, "output": "Name is required"}
    try:
        output = await run_hermes("plugins", "disable", name, timeout=30)
        return {"success": True, "output": output}
    except Exception as e:
        return {"success": False, "output": str(e)}


@router.post("/update")
async def update_plugin(request: Request):
    """Update a plugin to latest version."""
    body = await request.json()
    name = body.get("name", "").strip()
    if not name:
        return {"success": False, "output": "Name is required"}
    try:
        output = await run_hermes("plugins", "update", name, timeout=60)
        return {"success": True, "output": output}
    except Exception as e:
        return {"success": False, "output": str(e)}
