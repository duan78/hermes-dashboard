"""MCP OAuth connection management endpoints."""
import json
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException

from ..config import HERMES_HOME

router = APIRouter(prefix="/api/mcp/oauth", tags=["mcp-oauth"])

OAUTH_DIR = HERMES_HOME / ".mcp_oauth"


@router.get("/status")
async def oauth_status():
    """List all OAuth connections for MCP servers."""
    OAUTH_DIR.mkdir(parents=True, exist_ok=True)
    connections = []
    for f in sorted(OAUTH_DIR.iterdir()):
        if not f.is_file() or f.suffix != ".json":
            continue
        try:
            data = json.loads(f.read_text(errors="replace"))
            td = data.get("token", data)
            connections.append({
                "server_name": f.stem,
                "status": "connected" if td.get("access_token") else "disconnected",
                "expires_at": td.get("expires_at", td.get("expires", "")),
                "token_type": td.get("token_type", "Bearer"),
                "scope": td.get("scope", ""),
            })
        except (json.JSONDecodeError, OSError):
            connections.append({"server_name": f.stem, "status": "error", "expires_at": "", "token_type": "", "scope": ""})
    return {"connections": connections, "total": len(connections)}


@router.post("/{name}/revoke")
async def revoke_oauth(name: str):
    token_file = OAUTH_DIR / f"{name}.json"
    if not token_file.exists():
        raise HTTPException(404, f"No OAuth token for '{name}'")
    token_file.unlink()
    return {"success": True, "message": f"OAuth token for '{name}' revoked"}


@router.post("/{name}/test")
async def test_oauth(name: str):
    token_file = OAUTH_DIR / f"{name}.json"
    if not token_file.exists():
        return {"success": False, "message": f"No OAuth token for '{name}'"}
    try:
        data = json.loads(token_file.read_text(errors="replace"))
        td = data.get("token", data)
        if not td.get("access_token"):
            return {"success": False, "message": "No access token"}
        exp = td.get("expires_at", "")
        if exp:
            try:
                if datetime.fromisoformat(str(exp).replace("Z", "+00:00")) < datetime.now(UTC):
                    return {"success": False, "message": "Token expired", "expired": True}
            except (ValueError, TypeError):
                pass
        return {"success": True, "message": "Token valid"}
    except Exception as e:
        return {"success": False, "message": str(e)}


@router.get("/connection-status")
async def connection_status():
    """Check real-time connection status for each MCP server."""
    import yaml
    from ..utils import run_hermes

    config_path = HERMES_HOME / "config.yaml"
    servers_status = []

    if config_path.exists():
        try:
            with open(config_path) as f:
                cfg = yaml.safe_load(f) or {}
            mcp_servers = cfg.get("mcp_servers", {})
        except Exception:
            mcp_servers = {}
    else:
        mcp_servers = {}

    for name, server_cfg in mcp_servers.items():
        is_disabled = server_cfg.get("disabled", False)
        if is_disabled:
            servers_status.append({
                "name": name,
                "status": "disabled",
                "retry_count": 0,
                "message": "Server is disabled",
            })
            continue

        try:
            output = await run_hermes("mcp", "test", name, timeout=10)
            if "error" in output.lower() or "fail" in output.lower():
                servers_status.append({
                    "name": name,
                    "status": "disconnected",
                    "retry_count": 0,
                    "message": "Connection test failed",
                })
            else:
                servers_status.append({
                    "name": name,
                    "status": "connected",
                    "retry_count": 0,
                    "message": "Connected",
                })
        except Exception as e:
            error_msg = str(e)
            retry_count = 0
            if "retry" in error_msg.lower():
                import re
                match = re.search(r'retry.*?(\d+)', error_msg, re.IGNORECASE)
                if match:
                    retry_count = int(match.group(1))

            status = "connecting" if retry_count > 0 else "disconnected"
            servers_status.append({
                "name": name,
                "status": status,
                "retry_count": retry_count,
                "message": error_msg[:200],
            })

    return {"servers": servers_status, "checked_at": datetime.now(UTC).isoformat()}
