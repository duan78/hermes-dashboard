from fastapi import APIRouter, HTTPException, Body
from ..utils import run_hermes

router = APIRouter(prefix="/api/tools", tags=["tools"])


@router.get("")
async def list_tools():
    """List all tools by platform."""
    try:
        output = await run_hermes("tools", "list", timeout=15)
        return {"output": output}
    except RuntimeError as e:
        return {"output": "", "error": str(e)}


@router.get("/{platform}")
async def list_tools_platform(platform: str):
    """List tools for a specific platform."""
    try:
        output = await run_hermes("tools", "list", "--platform", platform, timeout=15)
        return {"output": output}
    except RuntimeError as e:
        return {"output": "", "error": str(e)}


@router.post("/enable")
async def enable_tool(body: dict = Body(...)):
    """Enable a tool for a platform."""
    tool = body.get("tool")
    platform = body.get("platform", "cli")
    if not tool:
        raise HTTPException(400, "Missing 'tool'")
    try:
        output = await run_hermes("tools", "enable", tool, "--platform", platform, timeout=15)
        return {"status": "enabled", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))


@router.post("/disable")
async def disable_tool(body: dict = Body(...)):
    """Disable a tool for a platform."""
    tool = body.get("tool")
    platform = body.get("platform", "cli")
    if not tool:
        raise HTTPException(400, "Missing 'tool'")
    try:
        output = await run_hermes("tools", "disable", tool, "--platform", platform, timeout=15)
        return {"status": "disabled", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))
