import os
import re
import stat
import tempfile
from pathlib import Path
from fastapi import APIRouter, HTTPException, Body
from ..utils import run_hermes
from ..config import HERMES_HOME

router = APIRouter(prefix="/api/tools", tags=["tools"])


# ── Tool configuration helpers ──

TOOL_CATEGORIES = {
    "tts": {
        "name": "Text-to-Speech",
        "icon": "volume-up",
        "providers": [
            {"name": "Microsoft Edge TTS", "tag": "Free - no API key needed", "env_vars": [], "config_key": "tts.provider", "config_value": "edge"},
            {"name": "OpenAI TTS", "tag": "Premium - high quality voices", "env_vars": [{"key": "VOICE_TOOLS_OPENAI_KEY", "label": "OpenAI API key", "url": "https://platform.openai.com/api-keys"}], "config_key": "tts.provider", "config_value": "openai"},
            {"name": "ElevenLabs", "tag": "Premium - most natural voices", "env_vars": [{"key": "ELEVENLABS_API_KEY", "label": "ElevenLabs API key", "url": "https://elevenlabs.io/app/settings/api-keys"}], "config_key": "tts.provider", "config_value": "elevenlabs"},
        ],
    },
    "web": {
        "name": "Web Search & Extract",
        "icon": "search",
        "providers": [
            {"name": "Firecrawl Cloud", "tag": "Hosted service - search, extract, and crawl", "env_vars": [{"key": "FIRECRAWL_API_KEY", "label": "Firecrawl API key", "url": "https://firecrawl.dev"}], "config_key": "web.backend", "config_value": "firecrawl"},
            {"name": "Exa", "tag": "AI-native search and contents", "env_vars": [{"key": "EXA_API_KEY", "label": "Exa API key", "url": "https://exa.ai"}], "config_key": "web.backend", "config_value": "exa"},
            {"name": "Parallel", "tag": "AI-native search and extract", "env_vars": [{"key": "PARALLEL_API_KEY", "label": "Parallel API key", "url": "https://parallel.ai"}], "config_key": "web.backend", "config_value": "parallel"},
            {"name": "Tavily", "tag": "AI-native search, extract, and crawl", "env_vars": [{"key": "TAVILY_API_KEY", "label": "Tavily API key", "url": "https://app.tavily.com/home"}], "config_key": "web.backend", "config_value": "tavily"},
            {"name": "Firecrawl Self-Hosted", "tag": "Free - run your own instance", "env_vars": [{"key": "FIRECRAWL_API_URL", "label": "Firecrawl instance URL"}], "config_key": "web.backend", "config_value": "firecrawl"},
        ],
    },
    "image_gen": {
        "name": "Image Generation",
        "icon": "image",
        "providers": [
            {"name": "FAL.ai", "tag": "FLUX 2 Pro with auto-upscaling", "env_vars": [{"key": "FAL_KEY", "label": "FAL API key", "url": "https://fal.ai/dashboard/keys"}]},
        ],
    },
    "browser": {
        "name": "Browser Automation",
        "icon": "globe",
        "providers": [
            {"name": "Local Browser", "tag": "Free headless Chromium (no API key needed)", "env_vars": [], "config_key": "browser.cloud_provider", "config_value": "local"},
            {"name": "Browserbase", "tag": "Cloud browser with stealth & proxies", "env_vars": [{"key": "BROWSERBASE_API_KEY", "label": "Browserbase API key", "url": "https://browserbase.com"}, {"key": "BROWSERBASE_PROJECT_ID", "label": "Browserbase project ID"}], "config_key": "browser.cloud_provider", "config_value": "browserbase"},
            {"name": "Browser Use", "tag": "Cloud browser with remote execution", "env_vars": [{"key": "BROWSER_USE_API_KEY", "label": "Browser Use API key", "url": "https://browser-use.com"}], "config_key": "browser.cloud_provider", "config_value": "browser-use"},
            {"name": "Camofox", "tag": "Local anti-detection browser (Firefox/Camoufox)", "env_vars": [{"key": "CAMOFOX_URL", "label": "Camofox server URL", "default": "http://localhost:9377"}], "config_key": "browser.cloud_provider", "config_value": "camofox"},
        ],
    },
    "homeassistant": {
        "name": "Smart Home",
        "icon": "home",
        "providers": [
            {"name": "Home Assistant", "tag": "REST API integration", "env_vars": [{"key": "HASS_TOKEN", "label": "Home Assistant Long-Lived Access Token"}, {"key": "HASS_URL", "label": "Home Assistant URL", "default": "http://homeassistant.local:8123"}]},
        ],
    },
    "rl": {
        "name": "RL Training",
        "icon": "flask",
        "providers": [
            {"name": "Tinker / Atropos", "tag": "RL training platform", "env_vars": [{"key": "TINKER_API_KEY", "label": "Tinker API key", "url": "https://tinker-console.thinkingmachines.ai/keys"}, {"key": "WANDB_API_KEY", "label": "WandB API key", "url": "https://wandb.ai/authorize"}]},
        ],
    },
    "vision": {
        "name": "Vision",
        "icon": "eye",
        "providers": [
            {"name": "Mistral (Pixtral)", "tag": "Pixtral Large via Mistral API", "config_key": "auxiliary.vision.provider", "config_value": "custom", "env_vars": [{"key": "MISTRAL_API_KEY", "label": "Mistral API Key", "url": "https://console.mistral.ai/api-keys/"}]},
            {"name": "OpenRouter", "tag": "Vision via OpenRouter", "config_key": "auxiliary.vision.provider", "config_value": "openrouter", "env_vars": [{"key": "OPENROUTER_API_KEY", "label": "OpenRouter API Key", "url": "https://openrouter.ai/keys"}]},
            {"name": "Anthropic", "tag": "Vision via Anthropic", "config_key": "auxiliary.vision.provider", "config_value": "anthropic", "env_vars": [{"key": "ANTHROPIC_API_KEY", "label": "Anthropic API Key", "url": "https://console.anthropic.com/settings/keys"}]},
            {"name": "Nous Portal", "tag": "Vision via Nous Research", "config_key": "auxiliary.vision.provider", "config_value": "nous", "env_vars": []},
        ],
    },
}

# Toolsets that just need simple env vars (no provider selection)
TOOLSET_ENV_REQUIREMENTS = {
    "moa": {"env_vars": [{"key": "OPENROUTER_API_KEY", "label": "OpenRouter API key", "url": "https://openrouter.ai/keys"}]},
}


def _get_env_value(key: str) -> str:
    """Get env value from os.environ or ~/.hermes/.env."""
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


def _load_yaml_config() -> dict:
    """Load ~/.hermes/config.yaml."""
    import yaml
    cfg_path = HERMES_HOME / "config.yaml"
    if cfg_path.exists():
        try:
            return yaml.safe_load(cfg_path.read_text()) or {}
        except Exception:
            pass
    return {}


def _save_yaml_config(config: dict):
    """Save ~/.hermes/config.yaml."""
    import yaml
    cfg_path = HERMES_HOME / "config.yaml"
    cfg_path.write_text(yaml.dump(config, default_flow_style=False, allow_unicode=True))


def _save_env_value(key: str, value: str):
    """Save a key=value pair to ~/.hermes/.env."""
    env_path = HERMES_HOME / ".env"
    _ENV_NAME_RE = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')
    if not _ENV_NAME_RE.match(key):
        raise ValueError(f"Invalid env var name: {key!r}")
    value = value.replace("\n", "").replace("\r", "")
    lines = []
    if env_path.exists():
        lines = env_path.read_text(errors="replace").splitlines(keepends=True)
    found = False
    for i, line in enumerate(lines):
        if line.strip().startswith(f"{key}="):
            lines[i] = f"{key}={value}\n"
            found = True
            break
    if not found:
        if lines and not lines[-1].endswith("\n"):
            lines[-1] += "\n"
        lines.append(f"{key}={value}\n")
    fd, tmp_path = tempfile.mkstemp(dir=str(env_path.parent), suffix='.tmp', prefix='.env_')
    try:
        with os.fdopen(fd, 'w') as f:
            f.writelines(lines)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, env_path)
    except BaseException:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
    try:
        os.chmod(env_path, stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass
    os.environ[key] = value


@router.get("")
async def list_tools():
    """List all tools by platform."""
    try:
        output = await run_hermes("tools", "list", timeout=15)
        return {"output": output}
    except RuntimeError as e:
        return {"output": "", "error": str(e)}


@router.get("/config")
async def get_tool_config():
    """Return tool categories with provider info and current env var status."""
    config = _load_yaml_config()
    result = {}

    # Process categories with provider selection
    for ts_key, cat in TOOL_CATEGORIES.items():
        entry = {
            "name": cat["name"],
            "icon": cat["icon"],
            "has_providers": True,
            "providers": [],
            "active_provider": None,
        }

        for prov in cat["providers"]:
            env_vars = []
            all_configured = True
            for ev in prov.get("env_vars", []):
                val = _get_env_value(ev["key"])
                is_set = bool(val)
                if not is_set:
                    all_configured = False
                env_vars.append({
                    "key": ev["key"],
                    "label": ev.get("label", ev["key"]),
                    "url": ev.get("url", ""),
                    "default": ev.get("default", ""),
                    "is_set": is_set,
                    "value_preview": val[:4] + "****" if is_set and len(val) > 8 else ("****" if is_set else ""),
                })

            # Check if this provider is the active one
            is_active = False
            config_key = prov.get("config_key")
            config_value = prov.get("config_value")
            if config_key and config_value:
                parts = config_key.split(".")
                cfg_val = config
                for p in parts:
                    cfg_val = cfg_val.get(p, {}) if isinstance(cfg_val, dict) else {}
                if str(cfg_val) == config_value:
                    is_active = True
            elif not prov.get("env_vars"):
                # No-key provider (like Edge TTS, Local Browser) - active if no other is
                is_active = not any(
                    _get_env_value(e["key"]) for p2 in cat["providers"]
                    for e in p2.get("env_vars", [])
                )

            entry["providers"].append({
                "name": prov["name"],
                "tag": prov.get("tag", ""),
                "env_vars": env_vars,
                "configured": all_configured or not env_vars,
                "is_active": is_active,
                "config_key": config_key,
                "config_value": config_value,
            })
            if is_active:
                entry["active_provider"] = prov["name"]

        result[ts_key] = entry

    # Process simple env-var-only tools
    for ts_key, info in TOOLSET_ENV_REQUIREMENTS.items():
        env_vars = []
        all_configured = True
        for ev in info["env_vars"]:
            val = _get_env_value(ev["key"])
            is_set = bool(val)
            if not is_set:
                all_configured = False
            env_vars.append({
                "key": ev["key"],
                "label": ev.get("label", ev["key"]),
                "url": ev.get("url", ""),
                "is_set": is_set,
                "value_preview": val[:4] + "****" if is_set and len(val) > 8 else ("****" if is_set else ""),
            })
        result[ts_key] = {
            "name": ts_key.title(),
            "has_providers": False,
            "env_vars": env_vars,
            "configured": all_configured,
        }

    return result


@router.post("/config/set-env")
async def set_tool_env(body: dict = Body(...)):
    """Set an environment variable in ~/.hermes/.env and optionally update config.yaml."""
    key = body.get("key")
    value = body.get("value", "")
    config_key = body.get("config_key")
    config_value = body.get("config_value")

    if not key:
        raise HTTPException(400, "Missing 'key'")

    try:
        _save_env_value(key, value)
    except Exception as e:
        raise HTTPException(500, f"Failed to save env var: {e}")

    # If a config key was provided, update config.yaml too
    if config_key and config_value:
        try:
            config = _load_yaml_config()
            parts = config_key.split(".")
            obj = config
            for p in parts[:-1]:
                obj = obj.setdefault(p, {})
            obj[parts[-1]] = config_value
            _save_yaml_config(config)
        except Exception as e:
            raise HTTPException(500, f"Env saved but config update failed: {e}")

    return {"status": "ok", "key": key}


@router.get("/platform/{platform}")
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
