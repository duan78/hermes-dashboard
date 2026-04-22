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
