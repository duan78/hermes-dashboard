import asyncio
import json
import re

from fastapi import APIRouter, Request
from ..config import HERMES_HOME
from ..utils import run_hermes

router = APIRouter(prefix="/api/mcp", tags=["mcp"])


def _parse_mcp_list(output: str) -> list:
    """Parse hermes mcp list output."""
    servers = []
    for line in output.strip().splitlines():
        line = line.strip()
        if not line or line.startswith("No ") or line.startswith("MCP") or line.startswith("---"):
            continue
        parts = re.split(r"\s{2,}", line)
        if len(parts) < 2:
            continue
        name = parts[0].strip()
        if name.lower() in ("name", "server"):
            continue
        server = {
            "name": name,
            "type": parts[1].strip() if len(parts) > 1 else "stdio",
            "transport": parts[1].strip() if len(parts) > 1 else "stdio",
            "command": parts[2].strip() if len(parts) > 2 else "",
            "tools": [],
        }
        servers.append(server)
    return servers


@router.get("/list")
async def list_mcp_servers():
    """List configured MCP servers."""
    try:
        output = await run_hermes("mcp", "list", timeout=15)
        servers = _parse_mcp_list(output)
    except Exception as e:
        return {"servers": [], "error": str(e)}
    return {"servers": servers}


@router.post("/add")
async def add_mcp_server(request: Request):
    """Add a new MCP server."""
    body = await request.json()
    name = body.get("name", "").strip()
    transport = body.get("type", "stdio")
    command = body.get("command", "")
    url = body.get("url", "")
    args = body.get("args", [])

    if not name:
        return {"success": False, "output": "Name is required"}

    cmd_args = ["mcp", "add", name, "--transport", transport]
    if command:
        cmd_args.extend(["--command", command])
    if url:
        cmd_args.extend(["--url", url])
    if args:
        cmd_args.extend(args)

    try:
        output = await run_hermes(*cmd_args, timeout=30)
        return {"success": True, "output": output}
    except Exception as e:
        return {"success": False, "output": str(e)}


@router.delete("/remove")
async def remove_mcp_server(request: Request):
    """Remove an MCP server."""
    body = await request.json()
    name = body.get("name", "").strip()
    if not name:
        return {"success": False, "output": "Name is required"}
    try:
        output = await run_hermes("mcp", "remove", name, timeout=15)
        return {"success": True, "output": output}
    except Exception as e:
        return {"success": False, "output": str(e)}


@router.post("/test")
async def test_mcp_server(request: Request):
    """Test connection to an MCP server."""
    body = await request.json()
    name = body.get("name", "").strip()
    if not name:
        return {"success": False, "output": "Name is required"}
    try:
        output = await run_hermes("mcp", "test", name, timeout=30)
        return {"success": True, "output": output}
    except Exception as e:
        return {"success": False, "output": str(e)}
