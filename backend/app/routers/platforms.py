import json
import os
from pathlib import Path
from fastapi import APIRouter, HTTPException
from ..utils import run_hermes, hermes_path
from ..schemas.requests import PairingApproveRequest, PairingRevokeRequest, PlatformConfigureRequest

router = APIRouter(prefix="/api/platforms", tags=["platforms"])

ENV_FILE = Path.home() / ".hermes" / ".env"

# Hardcoded platform env-var mapping
PLATFORM_ENV_VARS = {
    "telegram": [
        {"key": "TELEGRAM_BOT_TOKEN", "label": "Bot Token", "description": "Get from @BotFather on Telegram", "password": True},
        {"key": "TELEGRAM_ALLOWED_USERS", "label": "Allowed Users", "description": "Comma-separated Telegram user IDs that can interact with the bot", "password": False},
    ],
    "discord": [
        {"key": "DISCORD_BOT_TOKEN", "label": "Bot Token", "description": "Discord bot token from the Developer Portal", "password": True},
        {"key": "DISCORD_HOME_CHANNEL", "label": "Home Channel", "description": "Default channel ID for the bot to listen and respond", "password": False},
    ],
    "whatsapp": [
        {"key": "WHATSAPP_MODE", "label": "Mode", "description": "Connection mode (e.g. 'linked' or 'api')", "password": False},
        {"key": "WHATSAPP_ENABLED", "label": "Enabled", "description": "Set to 'true' to enable WhatsApp integration", "password": False},
    ],
    "signal": [
        {"key": "SIGNAL_ACCOUNT", "label": "Account Phone", "description": "Phone number registered with Signal", "password": False},
        {"key": "SIGNAL_HTTP_URL", "label": "Signal HTTP URL", "description": "URL of the signal-http-relay service", "password": False},
    ],
    "slack": [
        {"key": "SLACK_BOT_TOKEN", "label": "Bot Token", "description": "Slack bot token (xoxb-...) from your Slack App", "password": True},
        {"key": "SLACK_APP_TOKEN", "label": "App Token", "description": "Slack app-level token (xapp-...) for Socket Mode", "password": True},
    ],
    "matrix": [
        {"key": "MATRIX_PASSWORD", "label": "Password", "description": "Password for the Matrix bot account", "password": True},
        {"key": "MATRIX_ENCRYPTION", "label": "Encryption", "description": "Enable end-to-end encryption (true/false)", "password": False},
        {"key": "MATRIX_HOME_ROOM", "label": "Home Room", "description": "Room ID where the bot starts by default", "password": False},
    ],
    "dingtalk": [
        {"key": "DINGTALK_CLIENT_ID", "label": "Client ID", "description": "DingTalk application Client ID", "password": False},
        {"key": "DINGTALK_CLIENT_SECRET", "label": "Client Secret", "description": "DingTalk application Client Secret", "password": True},
    ],
    "feishu": [
        {"key": "FEISHU_APP_ID", "label": "App ID", "description": "Feishu/Lark application App ID", "password": False},
        {"key": "FEISHU_APP_SECRET", "label": "App Secret", "description": "Feishu/Lark application App Secret", "password": True},
    ],
    "wecom": [
        {"key": "WECOM_BOT_ID", "label": "Bot ID", "description": "WeCom (WeChat Work) bot application ID", "password": False},
        {"key": "WECOM_SECRET", "label": "Secret", "description": "WeCom application secret", "password": True},
    ],
    "mattermost": [
        {"key": "MATTERMOST_HOME_CHANNEL", "label": "Home Channel", "description": "Default channel ID for Mattermost bot", "password": False},
    ],
    "home_assistant": [
        {"key": "HASS_TOKEN", "label": "Access Token", "description": "Long-lived access token from Home Assistant", "password": True},
        {"key": "HASS_URL", "label": "Home Assistant URL", "description": "URL of your Home Assistant instance (e.g. http://homeassistant.local:8123)", "password": False},
    ],
}


def _read_env_set() -> dict:
    """Read current env values from the .env file."""
    env_set = {}
    if not ENV_FILE.exists():
        return env_set
    from dotenv import dotenv_values
    vals = dotenv_values(str(ENV_FILE))
    for k, v in vals.items():
        env_set[k] = v
    return env_set


@router.get("/status")
async def get_platforms_status():
    """Get all platform connection statuses."""
    gw_path = hermes_path("gateway_state.json")
    result = {}
    if gw_path.exists():
        gw = json.loads(gw_path.read_text())
        for platform, info in gw.get("platforms", {}).items():
            result[platform] = {
                "state": info.get("state", "unknown"),
                "updated_at": info.get("updated_at", ""),
            }

    # Check config for configured platforms
    import yaml
    config_path = hermes_path("config.yaml")
    if config_path.exists():
        cfg = yaml.safe_load(config_path.read_text())
        for p in ["telegram", "discord", "whatsapp", "signal", "slack"]:
            if p not in result:
                result[p] = {
                    "state": "not_configured" if not cfg.get(p) else "disconnected",
                    "updated_at": "",
                }
    return result


@router.get("/channels")
async def get_channels():
    """Get channel directory."""
    ch_path = hermes_path("channel_directory.json")
    if not ch_path.exists():
        return {"platforms": {}}
    return json.loads(ch_path.read_text())


@router.get("/pairing")
async def list_pairing():
    """List pairing codes."""
    try:
        output = await run_hermes("pairing", "list", timeout=15)
        return {"output": output}
    except RuntimeError as e:
        return {"output": "", "error": str(e)}


@router.post("/pairing/approve")
async def approve_pairing(body: PairingApproveRequest):
    """Approve a pairing request."""
    try:
        output = await run_hermes("pairing", "approve", body.code, timeout=15)
        return {"status": "approved", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))


@router.post("/pairing/revoke")
async def revoke_pairing(body: PairingRevokeRequest):
    """Revoke a pairing."""
    try:
        output = await run_hermes("pairing", "revoke", body.user_id, timeout=15)
        return {"status": "revoked", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))


@router.get("/env-vars")
async def get_platform_env_vars():
    """Return env var definitions for all platforms, with is_set status."""
    env_set = _read_env_set()
    result = {}
    for platform, vars_def in PLATFORM_ENV_VARS.items():
        result[platform] = []
        for v in vars_def:
            val = env_set.get(v["key"])
            result[platform].append({
                **v,
                "is_set": bool(val and val.strip()),
            })
    return result


@router.post("/configure")
async def configure_platform(body: PlatformConfigureRequest):
    """Write env vars for a platform to ~/.hermes/.env."""
    if body.platform not in PLATFORM_ENV_VARS:
        raise HTTPException(400, f"Unknown platform: {body.platform}")

    # Validate keys belong to this platform
    allowed_keys = {v["key"] for v in PLATFORM_ENV_VARS[body.platform]}
    for key in body.vars:
        if key not in allowed_keys:
            raise HTTPException(400, f"Unexpected env var '{key}' for platform '{platform}'")

    # Ensure the .env file exists
    ENV_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not ENV_FILE.exists():
        ENV_FILE.write_text("")

    from dotenv import set_key
    for key, value in body.vars.items():
        set_key(str(ENV_FILE), key, value)

    return {"success": True}
