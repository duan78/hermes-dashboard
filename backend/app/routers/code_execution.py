import json
import os
import subprocess

from fastapi import APIRouter

from ..utils import hermes_path

router = APIRouter(prefix="/api/code-execution", tags=["code-execution"])


@router.get("/status")
async def get_code_execution_status():
    """Read code_execution config and check for active sandbox processes."""
    import yaml

    config_path = hermes_path("config.yaml")
    config = {}
    if config_path.exists():
        try:
            config = yaml.safe_load(config_path.read_text()) or {}
        except Exception:
            pass

    ce_config = config.get("code_execution", {})

    # Detect active sandbox processes
    active_processes = []
    try:
        result = subprocess.run(
            ["ps", "aux"], capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.splitlines():
            lower = line.lower()
            if "sandbox" in lower or "code_exec" in lower or "docker.*hermes" in lower:
                parts = line.split(None, 10)
                if len(parts) >= 11:
                    active_processes.append({
                        "user": parts[0],
                        "pid": parts[1],
                        "cpu": parts[2],
                        "mem": parts[3],
                        "command": parts[10][:120],
                    })
    except Exception:
        pass

    return {
        "config": {
            "max_tool_calls": ce_config.get("max_tool_calls"),
            "timeout": ce_config.get("timeout"),
            "group_sessions_per_user": ce_config.get("group_sessions_per_user", False),
        },
        "platform_toolsets": _get_code_exec_platforms(config),
        "active_processes": active_processes,
    }


def _get_code_exec_platforms(config: dict) -> list:
    """Return list of platform names that include code_execution in their toolsets."""
    platform_toolsets = config.get("platform_toolsets", {})
    result = []
    for platform, toolsets in platform_toolsets.items():
        if isinstance(toolsets, list) and "code_execution" in toolsets:
            result.append(platform)
    return result
