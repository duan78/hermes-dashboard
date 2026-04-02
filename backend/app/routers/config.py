import yaml
from fastapi import APIRouter, HTTPException, Body
from pathlib import Path
from ..utils import hermes_path, mask_secrets, run_hermes
from ..config import HERMES_HOME

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
