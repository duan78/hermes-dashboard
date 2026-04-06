import copy
import os
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


# ── MOA Configuration ──

@router.get("/moa")
async def get_moa_config():
    """Get the MOA (Mixture of Agents) configuration section."""
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")
    raw = yaml.safe_load(config_path.read_text()) or {}
    moa = raw.get("moa", {})
    if not moa:
        # Return defaults when no moa section exists
        moa = {
            "reference_models": [
                "qwen/qwen3-coder:free",
                "nousresearch/hermes-3-llama-3.1-405b:free",
                "openai/gpt-oss-120b:free",
                "z-ai/glm-4.5-air:free",
            ],
            "aggregator_model": "z-ai/glm-5",
            "aggregator_provider": "openrouter",
            "reference_temperature": 0.6,
            "aggregator_temperature": 0.4,
            "min_successful_references": 1,
        }
    return moa


@router.put("/moa")
async def save_moa_config(body: dict = Body(...)):
    """Save the MOA configuration section."""
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")

    original = yaml.safe_load(config_path.read_text()) or {}

    # Validate reference_models is a list
    ref_models = body.get("reference_models")
    if ref_models is not None:
        if not isinstance(ref_models, list):
            raise HTTPException(400, "reference_models must be a list")
        if len(ref_models) == 0:
            raise HTTPException(400, "reference_models must not be empty")

    # Validate temperatures
    for key in ("reference_temperature", "aggregator_temperature"):
        val = body.get(key)
        if val is not None:
            try:
                body[key] = float(val)
            except (ValueError, TypeError):
                raise HTTPException(400, f"{key} must be a number")
            if not (0.0 <= body[key] <= 2.0):
                raise HTTPException(400, f"{key} must be between 0.0 and 2.0")

    # Validate min_successful_references
    msr = body.get("min_successful_references")
    if msr is not None:
        try:
            body["min_successful_references"] = int(msr)
        except (ValueError, TypeError):
            raise HTTPException(400, "min_successful_references must be an integer")

    # Validate aggregator_provider
    provider = body.get("aggregator_provider")
    if provider is not None and provider not in ("openrouter", "custom"):
        raise HTTPException(400, "aggregator_provider must be 'openrouter' or 'custom'")

    # Merge into existing config
    if "moa" not in original or not isinstance(original.get("moa"), dict):
        original["moa"] = {}
    original["moa"].update(body)

    yaml_str = yaml.dump(original, default_flow_style=False, allow_unicode=True, sort_keys=False)
    config_path.write_text(yaml_str)
    return {"status": "saved"}


# ── MOA Providers ──

@router.get("/moa/providers")
async def get_moa_providers():
    """List all configured MOA providers with their status."""
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")
    raw = yaml.safe_load(config_path.read_text()) or {}
    providers = raw.get("moa_providers", {})

    result = {}
    for pid, pcfg in providers.items():
        api_key_env = pcfg.get("api_key_env", "")
        api_key_set = bool(os.getenv(api_key_env))
        result[pid] = {
            **pcfg,
            "api_key_set": api_key_set,
            "api_key_env": api_key_env,
        }
    return result


@router.put("/moa/providers")
async def save_moa_providers(body: dict = Body(...)):
    """Save MOA providers configuration."""
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")

    original = yaml.safe_load(config_path.read_text()) or {}

    # Validate body is a dict of providers
    if not isinstance(body, dict):
        raise HTTPException(400, "Providers must be a dict mapping provider_id -> config")

    for pid, pcfg in body.items():
        if not isinstance(pcfg, dict):
            raise HTTPException(400, f"Provider '{pid}' config must be a dict")
        if "base_url" not in pcfg:
            raise HTTPException(400, f"Provider '{pid}' must have a 'base_url'")
        if "api_key_env" not in pcfg:
            raise HTTPException(400, f"Provider '{pid}' must have an 'api_key_env'")

    original["moa_providers"] = body

    yaml_str = yaml.dump(original, default_flow_style=False, allow_unicode=True, sort_keys=False)
    config_path.write_text(yaml_str)
    return {"status": "saved"}


@router.post("/moa/providers/test")
async def test_moa_provider(body: dict = Body(...)):
    """Test connection to a specific MOA provider."""
    provider_id = body.get("provider_id")
    if not provider_id:
        raise HTTPException(400, "Missing 'provider_id'")

    # Load provider config from config.yaml
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")
    raw = yaml.safe_load(config_path.read_text()) or {}
    providers = raw.get("moa_providers", {})
    provider_cfg = providers.get(provider_id)
    if not provider_cfg:
        raise HTTPException(404, f"Provider '{provider_id}' not found")

    api_key_env = provider_cfg.get("api_key_env", "")
    api_key = os.getenv(api_key_env)
    if not api_key:
        return {"status": "error", "error": f"Environment variable '{api_key_env}' is not set"}

    base_url = provider_cfg.get("base_url", "").rstrip("/")
    model = (provider_cfg.get("models") or [None])[0]
    if not model:
        return {"status": "error", "error": f"No models configured for provider '{provider_id}'"}

    import time
    try:
        import httpx
        t0 = time.monotonic()
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": model, "messages": [{"role": "user", "content": "Hi"}], "max_tokens": 1},
            )
            latency_ms = int((time.monotonic() - t0) * 1000)
            if resp.status_code == 200:
                return {"status": "ok", "latency_ms": latency_ms, "model": model}
            else:
                return {"status": "error", "error": f"HTTP {resp.status_code}: {resp.text[:200]}", "latency_ms": latency_ms}
    except Exception as exc:
        latency_ms = int((time.monotonic() - t0) * 1000) if 't0' in dir() else 0
        return {"status": "error", "error": str(exc), "latency_ms": latency_ms}
