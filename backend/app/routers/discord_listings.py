"""Discord server/channel listing endpoints."""
import json
import os

from fastapi import APIRouter, HTTPException

from ..config import HERMES_HOME

router = APIRouter(prefix="/api/discord", tags=["discord"])


def _get_discord_token() -> str:
    token = os.environ.get("DISCORD_BOT_TOKEN", "")
    if not token:
        env_path = HERMES_HOME / ".env"
        if env_path.exists():
            for line in env_path.read_text(errors="replace").splitlines():
                line = line.strip()
                if line.startswith("DISCORD_BOT_TOKEN="):
                    token = line[len("DISCORD_BOT_TOKEN="):].strip().strip("'\"")
                    break
    return token


@router.get("/servers")
async def discord_servers():
    token = _get_discord_token()
    if not token:
        return {"servers": [], "error": "DISCORD_BOT_TOKEN not configured"}
    try:
        import urllib.request
        req = urllib.request.Request("https://discord.com/api/v10/users/@me/guilds", headers={"Authorization": f"Bot {token}"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            guilds = json.loads(resp.read())
        return {"servers": [{"id": g["id"], "name": g["name"], "member_count": g.get("approximate_member_count", 0), "icon": g.get("icon", "")} for g in guilds], "total": len(guilds)}
    except Exception as e:
        return {"servers": [], "error": str(e)}


@router.get("/servers/{server_id}/channels")
async def discord_channels(server_id: str):
    token = _get_discord_token()
    if not token:
        raise HTTPException(400, "DISCORD_BOT_TOKEN not configured")
    try:
        import urllib.request
        req = urllib.request.Request(f"https://discord.com/api/v10/guilds/{server_id}/channels", headers={"Authorization": f"Bot {token}"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            channels = json.loads(resp.read())
        TYPES = {0: "text", 1: "dm", 2: "voice", 3: "group_dm", 4: "category", 5: "announcement", 13: "stage"}
        return {"channels": [{"id": c["id"], "name": c["name"], "type": TYPES.get(c["type"], "unknown"), "category_id": c.get("parent_id", "")} for c in channels], "total": len(channels)}
    except Exception as e:
        raise HTTPException(500, str(e))
