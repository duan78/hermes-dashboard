import asyncio
import copy
import logging
import os
import re
from pathlib import Path

import yaml
from fastapi import APIRouter, HTTPException

from ..config import HERMES_HOME
from ..schemas import ConfigSetRequest
from ..schemas.config import ConfigSetResponse
from ..schemas.requests import (
    ConfigValueUpdateRequest,
    CustomPromptRequest,
    MoaConfigUpdateRequest,
    MoaProvidersUpdateRequest,
    MoaProviderTestRequest,
    MoaRunRequest,
    PersonalityCreateRequest,
    PersonalityDeleteRequest,
    ProviderCreateRequest,
    ProviderTestRequest,
    ProviderUpdateRequest,
    YamlSaveRequest,
)
from ..services.moa_engine import run_moa
from ..utils import hermes_path, mask_secrets, run_hermes

logger = logging.getLogger(__name__)

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
async def save_config(body: YamlSaveRequest):
    """Save config.yaml from raw YAML string."""
    logger.info("Saving config.yaml")
    try:
        parsed = yaml.safe_load(body.yaml)
        if not isinstance(parsed, dict):
            raise ValueError("Config must be a YAML mapping")
    except yaml.YAMLError as e:
        raise HTTPException(400, f"Invalid YAML: {e}")

    config_path = hermes_path("config.yaml")
    config_path.write_text(body.yaml)
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


@router.post("/set", response_model=ConfigSetResponse)
async def set_config_value(body: ConfigSetRequest):
    """Set a single config value using hermes config set."""
    try:
        output = await run_hermes("config", "set", body.key, str(body.value))
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
async def save_structured_config(body: MoaConfigUpdateRequest):
    """Save config from structured JSON, preserving unchanged secrets."""
    logger.info("Saving structured config")
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")

    original = yaml.safe_load(config_path.read_text()) or {}
    merged = _deep_merge(original, body.model_dump())

    yaml_str = yaml.dump(merged, default_flow_style=False, allow_unicode=True, sort_keys=False)
    config_path.write_text(yaml_str)
    return {"status": "saved"}


@router.post("/update")
async def update_config_value(body: ConfigValueUpdateRequest):
    """Update a single config value using dot-notation key path.

    Example body: {"key": "agent.max_turns", "value": 120}
    Supports nested keys like 'tts.edge.voice', 'browser.camofox.managed_persistence'.
    """
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")

    original = yaml.safe_load(config_path.read_text()) or {}

    # Navigate to the parent dict and set the value
    parts = body.key.split(".")
    if len(parts) < 2:
        raise HTTPException(400, "Key must be a dot-notation path (e.g. 'agent.max_turns')")

    target = original
    for part in parts[:-1]:
        if part not in target or not isinstance(target[part], dict):
            target[part] = {}
        target = target[part]

    # Preserve masked secrets
    if _is_masked(body.value):
        raise HTTPException(400, "Cannot set a masked secret value")

    target[parts[-1]] = body.value

    yaml_str = yaml.dump(original, default_flow_style=False, allow_unicode=True, sort_keys=False)
    config_path.write_text(yaml_str)
    return {"status": "saved", "key": body.key}


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
                "deepseek-v3.2",
                "mistral-large-3:675b",
                "gemma4:31b",
            ],
            "aggregator_model": "mistral-large-3:675b",
            "aggregator_provider": "ollama_cloud",
            "reference_temperature": 0.6,
            "aggregator_temperature": 0.3,
            "min_successful_references": 1,
        }
    return moa


@router.put("/moa")
async def save_moa_config(body: MoaConfigUpdateRequest):
    """Save the MOA configuration section."""
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")

    original = yaml.safe_load(config_path.read_text()) or {}

    data = body.model_dump()

    # Validate reference_models is a list
    ref_models = data.get("reference_models")
    if ref_models is not None:
        if not isinstance(ref_models, list):
            raise HTTPException(400, "reference_models must be a list")
        if len(ref_models) == 0:
            raise HTTPException(400, "reference_models must not be empty")

    # Validate temperatures
    for key in ("reference_temperature", "aggregator_temperature"):
        val = data.get(key)
        if val is not None:
            try:
                data[key] = float(val)
            except (ValueError, TypeError):
                raise HTTPException(400, f"{key} must be a number")
            if not (0.0 <= data[key] <= 2.0):
                raise HTTPException(400, f"{key} must be between 0.0 and 2.0")

    # Validate min_successful_references
    msr = data.get("min_successful_references")
    if msr is not None:
        try:
            data["min_successful_references"] = int(msr)
        except (ValueError, TypeError):
            raise HTTPException(400, "min_successful_references must be an integer")

    # Validate aggregator_provider
    provider = data.get("aggregator_provider")
    if provider is not None and provider not in ("openrouter", "custom", "ollama_cloud"):
        raise HTTPException(400, "aggregator_provider must be 'openrouter', 'custom', or 'ollama_cloud'")

    # Merge into existing config
    if "moa" not in original or not isinstance(original.get("moa"), dict):
        original["moa"] = {}
    original["moa"].update(data)

    yaml_str = yaml.dump(original, default_flow_style=False, allow_unicode=True, sort_keys=False)
    config_path.write_text(yaml_str)
    return {"status": "saved"}


# ── MOA Run ──

@router.post("/moa/run")
async def moa_run(body: MoaRunRequest):
    """Execute a standalone MOA run directly from the dashboard.

    Uses the dashboard's own moa_engine (no dependency on hermes-agent).
    Falls back through Ollama Cloud → DeepSeek → Mistral on failures.
    """
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")

    raw = yaml.safe_load(config_path.read_text()) or {}
    moa_config = raw.get("moa", {})
    providers = raw.get("moa_providers", {})

    # Apply overrides from request
    if body.reference_models is not None:
        moa_config["reference_models"] = body.reference_models
    if body.aggregator_model is not None:
        moa_config["aggregator_model"] = body.aggregator_model
    if body.aggregator_provider is not None:
        moa_config["aggregator_provider"] = body.aggregator_provider

    # Fill defaults if missing
    if "reference_models" not in moa_config or not moa_config["reference_models"]:
        moa_config["reference_models"] = [
            "deepseek-v3.2",
            "mistral-large-3:675b",
            "gemma4:31b",
        ]
    if "aggregator_model" not in moa_config:
        moa_config["aggregator_model"] = "mistral-large-3:675b"
    if "aggregator_provider" not in moa_config:
        moa_config["aggregator_provider"] = "ollama_cloud"

    try:
        result = await asyncio.wait_for(
            run_moa(body.prompt, moa_config, providers),
            timeout=120,
        )
        return result
    except asyncio.TimeoutError:
        raise HTTPException(504, "MOA run timed out after 120 seconds")
    except Exception as e:
        logger.error("MOA run error: %s", e, exc_info=True)
        raise HTTPException(500, f"MOA run failed: {e}")


# ── MOA Providers ──

def _get_env_value_from_file(key: str) -> str:
    """Get env value from os.environ or ~/.hermes/.env file."""
    val = os.environ.get(key, "")
    if val:
        return val
    env_path = HERMES_HOME / ".env"
    if env_path.exists():
        for line in env_path.read_text(errors="replace").splitlines():
            line = line.strip()
            if line.startswith(f"{key}="):
                return line[len(key) + 1:].strip().strip("'\"")
    return ""


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
        api_key_set = bool(_get_env_value_from_file(api_key_env))
        result[pid] = {
            **pcfg,
            "api_key_set": api_key_set,
            "api_key_env": api_key_env,
        }
    return result


@router.put("/moa/providers")
async def save_moa_providers(body: MoaProvidersUpdateRequest):
    """Save MOA providers configuration."""
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")

    original = yaml.safe_load(config_path.read_text()) or {}
    data = body.model_dump()

    # Validate data is a dict of providers
    for pid, pcfg in data.items():
        if not isinstance(pcfg, dict):
            raise HTTPException(400, f"Provider '{pid}' config must be a dict")
        if "base_url" not in pcfg:
            raise HTTPException(400, f"Provider '{pid}' must have a 'base_url'")
        if "api_key_env" not in pcfg:
            raise HTTPException(400, f"Provider '{pid}' must have an 'api_key_env'")

    original["moa_providers"] = data

    yaml_str = yaml.dump(original, default_flow_style=False, allow_unicode=True, sort_keys=False)
    config_path.write_text(yaml_str)
    return {"status": "saved"}


@router.post("/moa/providers/test")
async def test_moa_provider(body: MoaProviderTestRequest):
    """Test connection to a specific MOA provider."""
    provider_id = body.provider

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
    api_key = _get_env_value_from_file(api_key_env)
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


# ── Provider Routing Rules ──

@router.get("/providers")
async def list_providers():
    """List all configured providers from config.yaml providers: section."""
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")
    raw = yaml.safe_load(config_path.read_text()) or {}
    providers = raw.get("providers", {})
    return {"providers": providers}


@router.post("/providers")
async def create_provider(body: ProviderCreateRequest):
    """Add a new provider to config.yaml providers: section."""
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")
    original = yaml.safe_load(config_path.read_text()) or {}
    providers = original.get("providers", {})
    if body.name in providers:
        raise HTTPException(409, f"Provider '{body.name}' already exists")
    provider_cfg = {"name": body.name}
    if body.api:
        provider_cfg["api"] = body.api
    if body.default_model:
        provider_cfg["default_model"] = body.default_model
    if body.transport:
        provider_cfg["transport"] = body.transport
    providers[body.name] = provider_cfg
    original["providers"] = providers
    yaml_str = yaml.dump(original, default_flow_style=False, allow_unicode=True, sort_keys=False)
    config_path.write_text(yaml_str)
    return {"status": "saved", "provider": body.name}


@router.put("/providers/{name}")
async def update_provider(name: str, body: ProviderUpdateRequest):
    """Update an existing provider configuration."""
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")
    original = yaml.safe_load(config_path.read_text()) or {}
    providers = original.get("providers", {})
    if name not in providers:
        raise HTTPException(404, f"Provider '{name}' not found")
    data = body.model_dump(exclude_none=True)
    providers[name].update(data)
    original["providers"] = providers
    yaml_str = yaml.dump(original, default_flow_style=False, allow_unicode=True, sort_keys=False)
    config_path.write_text(yaml_str)
    return {"status": "saved", "provider": name}


@router.delete("/providers/{name}")
async def delete_provider(name: str):
    """Delete a provider from config.yaml."""
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")
    original = yaml.safe_load(config_path.read_text()) or {}
    providers = original.get("providers", {})
    if name not in providers:
        raise HTTPException(404, f"Provider '{name}' not found")
    del providers[name]
    original["providers"] = providers
    yaml_str = yaml.dump(original, default_flow_style=False, allow_unicode=True, sort_keys=False)
    config_path.write_text(yaml_str)
    return {"status": "deleted", "provider": name}


@router.get("/providers/active")
async def get_active_provider():
    """Get current active provider/model from the model: section."""
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")
    raw = yaml.safe_load(config_path.read_text()) or {}
    model_cfg = raw.get("model", {})
    return {
        "provider": model_cfg.get("provider", "auto"),
        "model": model_cfg.get("default", ""),
        "base_url": model_cfg.get("base_url", ""),
        "context_length": model_cfg.get("context_length"),
    }


@router.put("/providers/active")
async def set_active_provider(body: ProviderUpdateRequest):
    """Change the active provider/model in the model: section."""
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")
    original = yaml.safe_load(config_path.read_text()) or {}
    if "model" not in original or not isinstance(original.get("model"), dict):
        original["model"] = {}
    data = body.model_dump(exclude_none=True)
    # Map frontend fields to config keys
    if "provider" in data:
        original["model"]["provider"] = data["provider"]
    if "default_model" in data:
        original["model"]["default"] = data["default_model"]
    elif "model" in data:
        original["model"]["default"] = data["model"]
    if "base_url" in data:
        original["model"]["base_url"] = data["base_url"]
    if "context_length" in data:
        original["model"]["context_length"] = data["context_length"]
    yaml_str = yaml.dump(original, default_flow_style=False, allow_unicode=True, sort_keys=False)
    config_path.write_text(yaml_str)
    return {"status": "saved"}


@router.get("/fallback-providers")
async def get_fallback_providers():
    """List fallback_providers from config."""
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")
    raw = yaml.safe_load(config_path.read_text()) or {}
    return {"fallback_providers": raw.get("fallback_providers", [])}


@router.put("/fallback-providers")
async def save_fallback_providers(body: MoaProvidersUpdateRequest):
    """Save fallback_providers list. Body must have fallback_providers: list."""
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")
    original = yaml.safe_load(config_path.read_text()) or {}
    data = body.model_dump()
    fb = data.get("fallback_providers")
    if fb is not None:
        if not isinstance(fb, list):
            raise HTTPException(400, "fallback_providers must be a list")
        original["fallback_providers"] = fb
    yaml_str = yaml.dump(original, default_flow_style=False, allow_unicode=True, sort_keys=False)
    config_path.write_text(yaml_str)
    return {"status": "saved"}


@router.post("/providers/test")
async def test_provider(body: ProviderTestRequest):
    """Test connectivity to a provider endpoint."""
    import time as _time
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")

    raw = yaml.safe_load(config_path.read_text()) or {}
    providers = raw.get("providers", {})
    name = body.provider

    # Try to find the provider config
    pcfg = providers.get(name)
    if not pcfg:
        # Try using the active model section
        model_cfg = raw.get("model", {})
        base_url = body.base_url or model_cfg.get("base_url", "")
        api_key_env = body.api_key_env or ""
        model = body.model or model_cfg.get("default", "")
    else:
        base_url = body.base_url or pcfg.get("api", "")
        api_key_env = body.api_key_env or pcfg.get("api_key_env", "")
        model = body.model or pcfg.get("default_model", "")

    if not base_url:
        return {"status": "error", "error": "No base_url configured for this provider"}

    # Resolve API key
    api_key = ""
    if api_key_env:
        api_key = _get_env_value_from_file(api_key_env)
    if not api_key:
        # Try model.api_key from config
        model_key = raw.get("model", {}).get("api_key", "")
        if model_key and not _is_masked(model_key):
            api_key = model_key

    if not api_key:
        return {"status": "error", "error": "No API key available for this provider"}

    base_url = base_url.rstrip("/")
    if not model:
        return {"status": "error", "error": "No model specified for test"}

    try:
        import httpx
        t0 = _time.monotonic()
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": model, "messages": [{"role": "user", "content": "Hi"}], "max_tokens": 1},
            )
            latency_ms = int((_time.monotonic() - t0) * 1000)
            if resp.status_code == 200:
                return {"status": "ok", "latency_ms": latency_ms, "model": model}
            else:
                return {"status": "error", "error": f"HTTP {resp.status_code}: {resp.text[:200]}", "latency_ms": latency_ms}
    except Exception as exc:
        return {"status": "error", "error": str(exc)}


# ── System Prompt Viewer ──

@router.get("/prompt/system")
async def get_system_prompt():
    """Assemble and return the system prompt from its component parts.

    Reads SOUL.md, config settings (personality, memory, model), and
    assembles a preview of what the full system prompt looks like.
    """
    config_path = hermes_path("config.yaml")
    raw = {}
    if config_path.exists():
        raw = yaml.safe_load(config_path.read_text()) or {}

    components = {}

    # 1. SOUL.md (agent identity)
    soul_path = hermes_path("SOUL.md")
    if soul_path.exists():
        soul_content = soul_path.read_text()
        components["soul_md"] = {
            "source": "SOUL.md",
            "content": soul_content,
            "length": len(soul_content),
            "exists": True,
        }
    else:
        components["soul_md"] = {"source": "SOUL.md", "content": "", "length": 0, "exists": False}

    # 2. Personality
    personality = ""
    display_cfg = raw.get("display", {})
    agent_cfg = raw.get("agent", {})
    if isinstance(display_cfg, dict):
        personality = display_cfg.get("personality", "default")
    personalities = {}
    if isinstance(agent_cfg, dict):
        personalities = agent_cfg.get("personalities", {})
    personality_prompt = ""
    if personality and personality != "default" and isinstance(personalities, dict):
        personality_prompt = personalities.get(personality, "")
    components["personality"] = {
        "source": f"agent.personalities.{personality}",
        "name": personality,
        "content": personality_prompt,
        "length": len(personality_prompt),
    }

    # 3. MEMORY.md
    memory_path = hermes_path("memories", "MEMORY.md")
    if not memory_path.exists():
        memory_path = hermes_path("memory", "MEMORY.md")
    memory_content = ""
    if memory_path.exists():
        memory_content = memory_path.read_text()
    components["memory_md"] = {
        "source": str(memory_path),
        "content": memory_content,
        "length": len(memory_content),
        "exists": memory_path.exists(),
    }

    # 4. Model info
    model_cfg = raw.get("model", {})
    components["model"] = {
        "source": "model.*",
        "provider": model_cfg.get("provider", "auto"),
        "model": model_cfg.get("default", ""),
        "base_url": model_cfg.get("base_url", ""),
        "context_length": model_cfg.get("context_length"),
    }

    # 5. Reasoning effort
    reasoning_effort = ""
    if isinstance(agent_cfg, dict):
        reasoning_effort = agent_cfg.get("reasoning_effort", "medium")
    show_reasoning = False
    if isinstance(display_cfg, dict):
        show_reasoning = display_cfg.get("show_reasoning", False)
    components["reasoning"] = {
        "source": "agent.reasoning_effort + display.show_reasoning",
        "effort": reasoning_effort,
        "show_reasoning": show_reasoning,
    }

    # 6. Memory config
    memory_cfg = raw.get("memory", {})
    components["memory_config"] = {
        "source": "memory.*",
        "enabled": memory_cfg.get("memory_enabled", False) if isinstance(memory_cfg, dict) else False,
        "char_limit": memory_cfg.get("memory_char_limit", 2200) if isinstance(memory_cfg, dict) else 2200,
    }

    # 7. Custom prompt (prefill)
    prefill_file = raw.get("prefill_messages_file", "")
    custom_content = ""
    if prefill_file:
        pf_path = Path(os.path.expanduser(prefill_file))
        if pf_path.exists():
            try:
                custom_content = pf_path.read_text()
            except Exception:
                custom_content = f"[Error reading {prefill_file}]"
    components["custom_prompt"] = {
        "source": prefill_file or "(none)",
        "content": custom_content,
        "length": len(custom_content),
    }

    # Assemble full preview
    full_parts = []
    if components["soul_md"]["content"]:
        full_parts.append(components["soul_md"]["content"])
    if personality_prompt:
        full_parts.append(f"\n[Personality: {personality}]\n{personality_prompt}")
    if memory_content:
        full_parts.append(f"\n[Memory Context]\n{memory_content}")
    if custom_content:
        full_parts.append(f"\n[Custom Prompt]\n{custom_content}")

    total_length = sum(len(p) for p in full_parts)
    estimated_tokens = int(total_length / 3.5)

    return {
        "components": components,
        "full_preview": "\n".join(full_parts),
        "total_length": total_length,
        "estimated_tokens": estimated_tokens,
    }


@router.get("/prompt/custom")
async def get_custom_prompt():
    """Read the custom prompt file (prefill_messages_file)."""
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")
    raw = yaml.safe_load(config_path.read_text()) or {}
    prefill_file = raw.get("prefill_messages_file", "")
    if not prefill_file:
        return {"content": "", "path": "", "exists": False}
    pf_path = Path(os.path.expanduser(prefill_file))
    if not pf_path.exists():
        return {"content": "", "path": prefill_file, "exists": False}
    try:
        content = pf_path.read_text()
        return {"content": content, "path": prefill_file, "exists": True}
    except Exception as e:
        raise HTTPException(500, f"Error reading custom prompt: {e}")


@router.put("/prompt/custom")
@router.post("/prompt/custom")
async def save_custom_prompt(body: CustomPromptRequest):
    """Save the custom prompt file and update config to point to it."""
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")
    original = yaml.safe_load(config_path.read_text()) or {}

    # Save to ~/.hermes/custom_prompt.json
    prompt_path = hermes_path("custom_prompt.json")
    prompt_path.write_text(body.content)

    # Update config to point to this file
    original["prefill_messages_file"] = str(prompt_path)
    yaml_str = yaml.dump(original, default_flow_style=False, allow_unicode=True, sort_keys=False)
    config_path.write_text(yaml_str)
    return {"status": "saved", "path": str(prompt_path)}


# ── Personalities ──

BUILTIN_PERSONALITIES = {
    "helpful", "concise", "technical", "creative", "teacher",
    "kawaii", "catgirl", "pirate", "shakespeare", "surfer",
    "noir", "uwu", "philosopher", "hype",
}


@router.get("/personalities")
async def list_personalities():
    """List all personalities (built-in + custom)."""
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")
    raw = yaml.safe_load(config_path.read_text()) or {}
    agent_cfg = raw.get("agent", {})
    personalities = agent_cfg.get("personalities", {}) if isinstance(agent_cfg, dict) else {}

    result = []
    for name in BUILTIN_PERSONALITIES:
        result.append({"name": name, "builtin": True})
    for name, value in (personalities.items() if isinstance(personalities, dict) else []):
        if name not in BUILTIN_PERSONALITIES:
            entry = {"name": name, "builtin": False}
            if isinstance(value, dict):
                entry["description"] = value.get("description", "")
                entry["system_prompt"] = value.get("system_prompt", "")
                entry["tone"] = value.get("tone", "")
                entry["style"] = value.get("style", "")
            else:
                entry["system_prompt"] = str(value)
            result.append(entry)
    return {"personalities": result}


@router.post("/personalities")
async def create_personality(body: PersonalityCreateRequest):
    """Create or update a custom personality."""
    if body.name in BUILTIN_PERSONALITIES:
        raise HTTPException(400, f"Cannot overwrite built-in personality '{body.name}'")
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")
    original = yaml.safe_load(config_path.read_text()) or {}
    if "agent" not in original or not isinstance(original.get("agent"), dict):
        original["agent"] = {}
    if "personalities" not in original["agent"]:
        original["agent"]["personalities"] = {}

    # Build the personality config (dict format for extended, string for simple)
    if body.description or body.tone or body.style:
        personality_cfg = {}
        if body.description:
            personality_cfg["description"] = body.description
        personality_cfg["system_prompt"] = body.system_prompt
        if body.tone:
            personality_cfg["tone"] = body.tone
        if body.style:
            personality_cfg["style"] = body.style
    else:
        personality_cfg = body.system_prompt

    original["agent"]["personalities"][body.name] = personality_cfg
    yaml_str = yaml.dump(original, default_flow_style=False, allow_unicode=True, sort_keys=False)
    config_path.write_text(yaml_str)
    return {"status": "saved", "personality": body.name}


@router.delete("/personalities")
async def delete_personality(body: PersonalityDeleteRequest):
    """Delete a custom personality."""
    if body.name in BUILTIN_PERSONALITIES:
        raise HTTPException(400, f"Cannot delete built-in personality '{body.name}'")
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")
    original = yaml.safe_load(config_path.read_text()) or {}
    personalities = (original.get("agent", {}) or {}).get("personalities", {})
    if body.name not in personalities:
        raise HTTPException(404, f"Personality '{body.name}' not found")
    del original["agent"]["personalities"][body.name]
    yaml_str = yaml.dump(original, default_flow_style=False, allow_unicode=True, sort_keys=False)
    config_path.write_text(yaml_str)
    return {"status": "deleted", "personality": body.name}
