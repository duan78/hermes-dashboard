import copy
import re

import yaml
from fastapi import APIRouter, HTTPException, Body
from pathlib import Path
from ..utils import hermes_path, mask_secrets, run_hermes
from ..config import HERMES_HOME

_MASK_RE = re.compile(r"^\*{4}$|^.{4}\*{4}.{4}$")

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("")
async def get_config():
    """Read hermes config.yaml with secrets masked."""
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")
    raw = yaml.safe_load(config_path.read_text())
    return {"config": mask_secrets(raw), "raw_yaml": config_path.read_text()}


@router.put("")
async def save_config(body: dict = Body(...)):
    """Save config.yaml from raw YAML string."""
    yaml_str = body.get("yaml", "")
    if not yaml_str:
        raise HTTPException(400, "Missing 'yaml' field")
    try:
        parsed = yaml.safe_load(yaml_str)
        if not isinstance(parsed, dict):
            raise ValueError("Config must be a YAML mapping")
    except yaml.YAMLError as e:
        raise HTTPException(400, f"Invalid YAML: {e}")

    config_path = hermes_path("config.yaml")
    config_path.write_text(yaml_str)
    return {"status": "saved"}


@router.get("/sections")
async def get_config_sections():
    """Get config broken into sections with masked secrets."""
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")
    raw = yaml.safe_load(config_path.read_text())
    sections = {}
    for key, value in raw.items():
        sections[key] = mask_secrets({key: value})[key]
    return sections


@router.post("/set")
async def set_config_value(body: dict = Body(...)):
    """Set a single config value using hermes config set."""
    key = body.get("key")
    value = body.get("value")
    if not key:
        raise HTTPException(400, "Missing 'key'")
    try:
        output = await run_hermes("config", "set", key, str(value))
        return {"status": "ok", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))


def _is_masked(value):
    """Check if a value looks like a masked secret."""
    return isinstance(value, str) and bool(_MASK_RE.match(value))


def _deep_merge(original, incoming):
    """Recursively merge incoming config into original, preserving masked secrets."""
    result = copy.deepcopy(original)
    for key, value in incoming.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _deep_merge(result[key], value)
        elif isinstance(value, list) and isinstance(result.get(key), list):
            new_list = []
            for i, item in enumerate(value):
                if i < len(result[key]) and isinstance(item, dict) and isinstance(result[key][i], dict):
                    new_list.append(_deep_merge(result[key][i], item))
                elif _is_masked(item):
                    new_list.append(result[key][i] if i < len(result[key]) else item)
                else:
                    new_list.append(item)
            result[key] = new_list
        elif _is_masked(value):
            pass  # Keep original value
        else:
            result[key] = value
    return result


@router.put("/structured")
async def save_structured_config(body: dict = Body(...)):
    """Save config from structured JSON, preserving unchanged secrets."""
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")

    original = yaml.safe_load(config_path.read_text()) or {}
    merged = _deep_merge(original, body)

    yaml_str = yaml.dump(merged, default_flow_style=False, allow_unicode=True, sort_keys=False)
    config_path.write_text(yaml_str)
    return {"status": "saved"}


@router.post("/update")
async def update_config_value(body: dict = Body(...)):
    """Update a single config value using dot-notation key path.

    Example body: {"key": "agent.max_turns", "value": 120}
    Supports nested keys like 'tts.edge.voice', 'browser.camofox.managed_persistence'.
    """
    key = body.get("key")
    value = body.get("value")
    if not key:
        raise HTTPException(400, "Missing 'key' field")

    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")

    original = yaml.safe_load(config_path.read_text()) or {}

    # Navigate to the parent dict and set the value
    parts = key.split(".")
    if len(parts) < 2:
        raise HTTPException(400, "Key must be a dot-notation path (e.g. 'agent.max_turns')")

    target = original
    for part in parts[:-1]:
        if part not in target or not isinstance(target[part], dict):
            target[part] = {}
        target = target[part]

    # Preserve masked secrets
    if _is_masked(value):
        raise HTTPException(400, "Cannot set a masked secret value")

    target[parts[-1]] = value

    yaml_str = yaml.dump(original, default_flow_style=False, allow_unicode=True, sort_keys=False)
    config_path.write_text(yaml_str)
    return {"status": "saved", "key": key}
