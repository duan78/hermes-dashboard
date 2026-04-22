"""Discord server/channel listing endpoints."""

import logging
import os

import httpx
from fastapi import APIRouter, HTTPException

from ..config import HERMES_HOME

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/discord", tags=["discord"])


def _get_env_value(key: str) -> str:
    """Get env value from os.environ or ~/.hermes/.env."""
    val = os.environ.get(key, "")
    if val:
        return val
    env_path = HERMES_HOME / ".env"
    if env_path.exists():
        for line in env_path.read_text(errors="replace").splitlines():
            line = line.strip()
            if line.startswith(f"{key}="):
                return line[len(key) + 1 :].strip().strip("'\"")
    return ""


DISCORD_API_BASE = "https://discord.com/api/v10"


@router.get("/servers")
async def list_servers():
    """List guilds (servers) the Discord bot is in."""
    token = _get_env_value("DISCORD_BOT_TOKEN")
    if not token:
        raise HTTPException(400, "DISCORD_BOT_TOKEN not configured")

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(
                f"{DISCORD_API_BASE}/users/@me/guilds",
                headers={"Authorization": f"Bot {token}"},
            )
            if resp.status_code == 401:
                raise HTTPException(401, "Invalid DISCORD_BOT_TOKEN")
            resp.raise_for_status()
            guilds = resp.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(502, f"Discord API error: {e.response.status_code}")
        except httpx.RequestError as e:
            raise HTTPException(502, f"Failed to reach Discord API: {e}")

    return {
        "servers": [
            {
                "id": g.get("id", ""),
                "name": g.get("name", "Unknown"),
                "member_count": g.get("approximate_member_count", 0),
                "icon": g.get("icon"),
                "owner": g.get("owner", False),
            }
            for g in guilds
        ],
    }


@router.get("/servers/{server_id}/channels")
async def list_channels(server_id: str):
    """List channels for a specific Discord server."""
    token = _get_env_value("DISCORD_BOT_TOKEN")
    if not token:
        raise HTTPException(400, "DISCORD_BOT_TOKEN not configured")

    CHANNEL_TYPES = {
        0: "text",
        1: "dm",
        2: "voice",
        3: "group_dm",
        4: "category",
        5: "announcement",
        10: "announcement_thread",
        11: "public_thread",
        12: "private_thread",
        13: "stage_voice",
        15: "forum",
        16: "media_channel",
    }

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(
                f"{DISCORD_API_BASE}/guilds/{server_id}/channels",
                headers={"Authorization": f"Bot {token}"},
            )
            if resp.status_code == 401:
                raise HTTPException(401, "Invalid DISCORD_BOT_TOKEN")
            if resp.status_code == 403:
                raise HTTPException(403, "Bot lacks access to this server")
            if resp.status_code == 404:
                raise HTTPException(404, "Server not found")
            resp.raise_for_status()
            channels = resp.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(502, f"Discord API error: {e.response.status_code}")
        except httpx.RequestError as e:
            raise HTTPException(502, f"Failed to reach Discord API: {e}")

    return {
        "server_id": server_id,
        "channels": [
            {
                "id": c.get("id", ""),
                "name": c.get("name", "Unknown"),
                "type": CHANNEL_TYPES.get(c.get("type", 0), "unknown"),
                "type_id": c.get("type", 0),
                "position": c.get("position", 0),
                "parent_id": c.get("parent_id"),
                "nsfw": c.get("nsfw", False),
                "topic": c.get("topic", ""),
            }
            for c in sorted(channels, key=lambda x: (x.get("type", 0), x.get("position", 0)))
        ],
    }
