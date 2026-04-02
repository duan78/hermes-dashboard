import json
from fastapi import APIRouter, HTTPException, Body
from ..utils import run_hermes, hermes_path

router = APIRouter(prefix="/api/platforms", tags=["platforms"])


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
async def approve_pairing(body: dict = Body(...)):
    """Approve a pairing request."""
    code = body.get("code")
    if not code:
        raise HTTPException(400, "Missing 'code'")
    try:
        output = await run_hermes("pairing", "approve", code, timeout=15)
        return {"status": "approved", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))


@router.post("/pairing/revoke")
async def revoke_pairing(body: dict = Body(...)):
    """Revoke a pairing."""
    user_id = body.get("user_id")
    if not user_id:
        raise HTTPException(400, "Missing 'user_id'")
    try:
        output = await run_hermes("pairing", "revoke", user_id, timeout=15)
        return {"status": "revoked", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))
