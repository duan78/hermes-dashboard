import json
import os
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException

from ..config import HERMES_HOME

router = APIRouter(prefix="/api/mcp", tags=["mcp-oauth"])

OAUTH_DIR = HERMES_HOME / ".mcp_oauth"


def _ensure_oauth_dir():
    """Ensure the OAuth directory exists."""
    OAUTH_DIR.mkdir(parents=True, exist_ok=True)


def _parse_token_file(filepath: Path) -> dict:
    """Parse an OAuth token file and extract status info."""
    try:
        data = json.loads(filepath.read_text(errors="replace"))
    except json.JSONDecodeError:
        return {
            "name": filepath.stem,
            "status": "error",
            "error": "Invalid token file",
            "expires_at": None,
            "scopes": [],
        }

    # Check if token is expired
    expires_at = data.get("expires_at") or data.get("exp")
    is_expired = False
    if expires_at:
        try:
            if isinstance(expires_at, (int, float)):
                exp_dt = datetime.fromtimestamp(expires_at, tz=UTC)
            else:
                exp_dt = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
            is_expired = exp_dt < datetime.now(UTC)
            expires_at = exp_dt.isoformat()
        except (ValueError, OSError):
            pass

    status = "disconnected" if is_expired else "connected"
    if not data.get("access_token") and not data.get("token"):
        status = "disconnected"

    return {
        "name": filepath.stem,
        "status": status,
        "expires_at": expires_at,
        "scopes": data.get("scope", data.get("scopes", [])),
        "token_type": data.get("token_type", "bearer"),
        "server_url": data.get("server_url", ""),
        "client_id": data.get("client_id", ""),
    }


@router.get("/oauth/status")
async def oauth_status():
    """List all OAuth connections."""
    _ensure_oauth_dir()
    connections = []

    if OAUTH_DIR.exists():
        for f in sorted(OAUTH_DIR.iterdir()):
            if f.is_file() and not f.name.startswith("."):
                conn = _parse_token_file(f)
                connections.append(conn)

    return {"connections": connections, "total": len(connections)}


@router.post("/oauth/{name}/revoke")
async def oauth_revoke(name: str):
    """Revoke an OAuth connection by deleting the token file."""
    _ensure_oauth_dir()

    # Find the token file
    token_file = OAUTH_DIR / f"{name}.json"
    if not token_file.exists():
        token_file = OAUTH_DIR / name
    if not token_file.exists():
        raise HTTPException(404, f"OAuth connection '{name}' not found")

    token_file.unlink()
    return {"success": True, "message": f"OAuth connection '{name}' revoked"}


@router.post("/oauth/{name}/test")
async def oauth_test(name: str):
    """Test an OAuth connection by checking token validity."""
    _ensure_oauth_dir()

    token_file = OAUTH_DIR / f"{name}.json"
    if not token_file.exists():
        token_file = OAUTH_DIR / name
    if not token_file.exists():
        raise HTTPException(404, f"OAuth connection '{name}' not found")

    try:
        data = json.loads(token_file.read_text(errors="replace"))
    except json.JSONDecodeError:
        return {"success": False, "message": "Invalid token file"}

    # Check expiry
    expires_at = data.get("expires_at") or data.get("exp")
    if expires_at:
        try:
            if isinstance(expires_at, (int, float)):
                exp_dt = datetime.fromtimestamp(expires_at, tz=UTC)
            else:
                exp_dt = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
            if exp_dt < datetime.now(UTC):
                return {"success": False, "message": "Token expired", "expires_at": exp_dt.isoformat()}
        except (ValueError, OSError):
            pass

    has_token = bool(data.get("access_token") or data.get("token"))
    return {
        "success": has_token,
        "message": "Token valid" if has_token else "No access token found",
        "server_url": data.get("server_url", ""),
        "expires_at": str(expires_at) if expires_at else None,
    }


@router.get("/connection-status")
async def connection_status():
    """Check real-time connection status for each MCP server."""
    from ..utils import run_hermes
    import yaml

    config_path = HERMES_HOME / "config.yaml"
    servers_status = []

    # Load server list from config
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

        # Try to test the connection
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
            # Check for retry indicators in error message
            if "retry" in error_msg.lower():
                try:
                    import re
                    match = re.search(r'retry.*?(\d+)', error_msg, re.IGNORECASE)
                    if match:
                        retry_count = int(match.group(1))
                except (ValueError, AttributeError):
                    pass

            status = "connecting" if retry_count > 0 else "disconnected"
            servers_status.append({
                "name": name,
                "status": status,
                "retry_count": retry_count,
                "message": error_msg[:200],
            })

    return {"servers": servers_status, "checked_at": datetime.now(UTC).isoformat()}
