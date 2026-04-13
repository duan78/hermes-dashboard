import re

import yaml
from fastapi import APIRouter

from ..config import HERMES_HOME
from ..schemas import McpAddRequest, McpConfigUpdateRequest, McpNameRequest, McpToggleRequest
from ..utils import run_hermes

router = APIRouter(prefix="/api/mcp", tags=["mcp"])

CONFIG_PATH = HERMES_HOME / "config.yaml"


def _load_config() -> dict:
    if not CONFIG_PATH.exists():
        return {}
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f) or {}


def _save_config(cfg: dict):
    with open(CONFIG_PATH, "w") as f:
        yaml.dump(cfg, f, default_flow_style=False, allow_unicode=True, sort_keys=False)


def _detect_type(transport: str) -> str:
    t = transport.lower()
    if t.startswith("http") or t.startswith("https") or ".ai/api" in t:
        return "http"
    return "stdio"


def _parse_mcp_list(output: str) -> list:
    servers = []
    in_table = False
    for line in output.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if "Name" in stripped and "Transport" in stripped and "Tools" in stripped:
            in_table = True
            continue
        if stripped.startswith("──") or stripped.startswith("───"):
            continue
        if stripped.startswith("MCP Servers"):
            continue
        if not in_table:
            continue
        # Split on 2+ spaces but preserve the transport field which may contain spaces
        # Format: Name<spaces>Transport<spaces>Tools<spaces>Status
        parts = re.split(r"\s{2,}", stripped.strip())
        if len(parts) < 4:
            continue
        name = parts[0].strip()
        transport = parts[1].strip()
        tools_count = parts[2].strip()
        status_raw = parts[3].strip().lower()
        status = "enabled" if "enabled" in status_raw else "disabled"
        servers.append({
            "name": name,
            "type": _detect_type(transport),
            "transport": transport,
            "tools_count": tools_count,
            "status": status,
        })
    return servers


def _parse_mcp_test(output: str) -> list:
    tools = []
    in_tools = False
    for line in output.splitlines():
        stripped = line.strip()
        if "Tools discovered:" in stripped:
            in_tools = True
            continue
        if in_tools and stripped.startswith("✓") or in_tools and stripped.startswith("✗"):
            break
        if not in_tools:
            continue
        if not stripped:
            continue
        # Tool format: name<spaces>description (description may contain ...)
        m = re.match(r"^(\S+)\s+(.+)$", stripped)
        if m:
            tools.append({"name": m.group(1), "description": m.group(2)})
    return tools


@router.get("/list")
async def list_mcp_servers():
    try:
        output = await run_hermes("mcp", "list", timeout=15)
        servers = _parse_mcp_list(output)
    except Exception as e:
        return {"servers": [], "error": str(e)}
    return {"servers": servers}


@router.get("/detail/{name}")
async def mcp_detail(name: str):
    try:
        output = await run_hermes("mcp", "test", name, timeout=30)
        tools = _parse_mcp_test(output)
        return {"name": name, "tools": tools, "success": True}
    except Exception as e:
        return {"name": name, "tools": [], "success": False, "error": str(e)}


@router.get("/config/{name}")
async def mcp_get_config(name: str):
    cfg = _load_config()
    servers = cfg.get("mcp_servers", {})
    if name not in servers:
        return {"error": f"Server '{name}' not found", "config": None}
    return {"config": servers[name]}


@router.post("/config/{name}")
async def mcp_update_config(name: str, body: McpConfigUpdateRequest):
    cfg = _load_config()
    if "mcp_servers" not in cfg:
        cfg["mcp_servers"] = {}
    cfg["mcp_servers"][name] = body.config
    _save_config(cfg)
    return {"success": True}


@router.post("/toggle/{name}")
async def mcp_toggle(name: str, body: McpToggleRequest):
    cfg = _load_config()
    servers = cfg.get("mcp_servers", {})
    if name not in servers:
        return {"success": False, "error": f"Server '{name}' not found"}
    if body.enabled:
        servers[name].pop("disabled", None)
    else:
        servers[name]["disabled"] = True
    cfg["mcp_servers"] = servers
    _save_config(cfg)
    return {"success": True, "enabled": body.enabled}


@router.post("/add")
async def add_mcp_server(body: McpAddRequest):
    if not body.name:
        return {"success": False, "output": "Name is required"}

    cmd_args = ["mcp", "add", body.name, "--transport", body.type]
    if body.command:
        cmd_args.extend(["--command", body.command])
    if body.url:
        cmd_args.extend(["--url", body.url])
    if body.args:
        cmd_args.extend(body.args)

    try:
        output = await run_hermes(*cmd_args, timeout=30)
        return {"success": True, "output": output}
    except Exception as e:
        return {"success": False, "output": str(e)}


@router.post("/remove")
async def remove_mcp_server(body: McpNameRequest):
    if not body.name:
        return {"success": False, "output": "Name is required"}
    try:
        output = await run_hermes("mcp", "remove", body.name, timeout=15)
        return {"success": True, "output": output}
    except Exception as e:
        return {"success": False, "output": str(e)}


@router.post("/test")
async def test_mcp_server(body: McpNameRequest):
    if not body.name:
        return {"success": False, "output": "Name is required"}
    try:
        output = await run_hermes("mcp", "test", body.name, timeout=30)
        tools = _parse_mcp_test(output)
        return {"success": True, "output": output, "tools": tools}
    except Exception as e:
        return {"success": False, "output": str(e), "tools": []}
