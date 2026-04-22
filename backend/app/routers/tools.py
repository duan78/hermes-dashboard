import logging
import os
import re
import stat
import tempfile

from fastapi import APIRouter, HTTPException

from ..config import HERMES_HOME
from ..schemas.requests import ToolEnvRequest, ToolToggleRequest
from ..utils import run_hermes

logger = logging.getLogger(__name__)

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
            {"name": "Combined (Multi-Backend)", "tag": "Parallel multi-backend search — queries all configured APIs simultaneously, deduplicates by URL, merges results. Select this to use multiple search engines at once.", "env_vars": [], "config_key": "web.backend", "config_value": "combined", "is_combined": True},
            {"name": "Brave Search", "tag": "Privacy-first search engine with high-quality web index", "env_vars": [{"key": "BRAVE_API_KEY", "label": "Brave API key", "url": "https://brave.com/search/api/"}], "config_key": "web.backend", "config_value": "brave"},
            {"name": "LinkUp", "tag": "AI-powered search with rich content extraction and deep results", "env_vars": [{"key": "LINKUP_API_KEY", "label": "LinkUp API key", "url": "https://linkup.so"}], "config_key": "web.backend", "config_value": "linkup"},
            {"name": "Tavily", "tag": "AI-native search, extract, and crawl", "env_vars": [{"key": "TAVILY_API_KEY", "label": "Tavily API key", "url": "https://app.tavily.com/home"}], "config_key": "web.backend", "config_value": "tavily"},
            {"name": "Firecrawl Cloud", "tag": "Hosted service — search, extract, and crawl", "env_vars": [{"key": "FIRECRAWL_API_KEY", "label": "Firecrawl API key", "url": "https://firecrawl.dev"}], "config_key": "web.backend", "config_value": "firecrawl"},
            {"name": "Exa", "tag": "AI-native search and contents", "env_vars": [{"key": "EXA_API_KEY", "label": "Exa API key", "url": "https://exa.ai"}], "config_key": "web.backend", "config_value": "exa"},
            {"name": "Parallel", "tag": "AI-native search and extract", "env_vars": [{"key": "PARALLEL_API_KEY", "label": "Parallel API key", "url": "https://parallel.ai"}], "config_key": "web.backend", "config_value": "parallel"},
            {"name": "Firecrawl Self-Hosted", "tag": "Free — run your own instance", "env_vars": [{"key": "FIRECRAWL_API_URL", "label": "Firecrawl instance URL"}], "config_key": "web.backend", "config_value": "firecrawl"},
        ],
        # All backends that can participate in combined mode
        "combined_backends": [
            {"key": "BRAVE_API_KEY", "name": "Brave Search", "url": "https://brave.com/search/api/"},
            {"key": "LINKUP_API_KEY", "name": "LinkUp", "url": "https://linkup.so"},
            {"key": "TAVILY_API_KEY", "name": "Tavily", "url": "https://app.tavily.com/home"},
            {"key": "PARALLEL_API_KEY", "name": "Parallel", "url": "https://parallel.ai"},
            {"key": "FIRECRAWL_API_KEY", "name": "Firecrawl Cloud", "url": "https://firecrawl.dev"},
            {"key": "EXA_API_KEY", "name": "Exa", "url": "https://exa.ai"},
        ],
        # Agent-Reach channels are now fetched dynamically from agent_reach package
        # (no hardcoded list — see _get_agent_reach_channels_dynamic)
    },
    "image_gen": {
        "name": "Image Generation",
        "icon": "image",
        "providers": [
            {"name": "FAL.ai", "tag": "FLUX 2 Klein 9B / FLUX 2 Pro / Z-Image / Qwen / GPT Image", "env_vars": [{"key": "FAL_KEY", "label": "FAL API key", "url": "https://fal.ai/dashboard/keys"}]},
        ],
        "models": [
            {"id": "fal-ai/flux-2/klein/9b", "name": "FLUX 2 Klein 9B", "speed": "<1s"},
            {"id": "fal-ai/flux-2-pro", "name": "FLUX 2 Pro", "speed": "~6s"},
            {"id": "fal-ai/z-image/turbo", "name": "Z-Image Turbo", "speed": "~2s"},
            {"id": "fal-ai/nano-banana-pro", "name": "Nano Banana Pro (Gemini 3)", "speed": "~8s"},
            {"id": "fal-ai/gpt-image-1.5", "name": "GPT Image 1.5", "speed": "~15s"},
            {"id": "fal-ai/ideogram/v3", "name": "Ideogram V3", "speed": "~5s"},
            {"id": "fal-ai/recraft/v4/pro/text-to-image", "name": "Recraft V4 Pro", "speed": "~8s"},
            {"id": "fal-ai/qwen-image", "name": "Qwen Image", "speed": "~12s"},
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
            {"name": "Z.AI Vision MCP", "tag": "Vision via Z.AI MCP (gratuit, coding plan)", "config_key": "mcp_servers.zai-vision", "config_value": "active", "env_vars": [{"key": "Z_AI_API_KEY", "label": "Z.AI API Key", "url": "https://z.ai"}]},
            {"name": "Mistral (Pixtral)", "tag": "Pixtral Large via Mistral API (fallback)", "config_key": "auxiliary.vision.provider", "config_value": "custom", "env_vars": [{"key": "MISTRAL_API_KEY", "label": "Mistral API Key", "url": "https://console.mistral.ai/api-keys/"}]},
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
        except Exception as e:
            logger.warning("Error loading config.yaml: %s", e)
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


def _get_agent_reach_channels():
    """Fetch Agent-Reach channel statuses via the Python API (raw dict)."""
    import concurrent.futures
    try:
        from agent_reach.channels import get_all_channels
        channels = get_all_channels()
        ar = {}
        # Use threads with per-future timeout so slow channel.check() calls don't block others
        def _check(ch):
            try:
                status_tuple = ch.check()
                status_str = status_tuple[0] if isinstance(status_tuple, tuple) else str(status_tuple)
                message = status_tuple[1] if isinstance(status_tuple, tuple) and len(status_tuple) > 1 else ""
                return ch.name, {"status": status_str, "message": message}
            except Exception as exc:
                return ch.name, {"status": "off", "message": str(exc)[:100]}
        with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
            futures = {pool.submit(_check, ch): ch.name for ch in channels}
            for future in concurrent.futures.as_completed(futures, timeout=30):
                try:
                    name, info = future.result(timeout=10)
                    ar[name] = info
                except concurrent.futures.TimeoutError:
                    pass
                except Exception:
                    pass
        return ar
    except Exception as e:
        logger.debug("Agent-Reach channels unavailable: %s", e)
        return {}


def _build_agent_reach_list(ar_channels: dict) -> list:
    """Build a full dynamic channel list from agent_reach get_all_channels().

    Each channel entry has: name, channel, status, message, config_type, is_configured.
    config_type is auto-detected:
      - "none"  → status is "ok" (zero-config, works out of the box)
      - "action" → status is "off" and message mentions install/config steps
      - "env"   → status is "warn" (partially configured, needs env vars)
    """
    try:
        from agent_reach.channels import get_all_channels
        channels = get_all_channels()
    except Exception:
        return []

    # Friendly display names for known channels
    _DISPLAY_NAMES = {
        "github": "GitHub",
        "twitter": "Twitter / X",
        "youtube": "YouTube",
        "reddit": "Reddit",
        "bilibili": "Bilibili",
        "xiaohongshu": "Xiaohongshu",
        "douyin": "Douyin",
        "linkedin": "LinkedIn",
        "wechat": "WeChat",
        "weibo": "Weibo",
        "xiaoyuzhou": "Xiaoyuzhou",
        "v2ex": "V2EX",
        "xueqiu": "Xueqiu",
        "rss": "RSS / Atom",
        "exa_search": "Exa Search",
        "web": "Web Reader (Jina)",
    }

    ar_list = []
    for ch in channels:
        info = ar_channels.get(ch.name, {})
        status = info.get("status", "off")
        message = info.get("message", "")

        # Auto-detect config_type from status
        if status == "ok":
            config_type = "none"
        elif status == "warn":
            config_type = "env"
        else:
            # "off" — determine if it needs an action (install CLI) or env vars
            msg_lower = message.lower()
            if any(kw in msg_lower for kw in ["pip install", "pipx install", "uv tool", "agent-reach install", "运行"]):
                config_type = "action"
            elif any(kw in msg_lower for kw in ["环境变量", "export", "api key", "token", "cookie", "login", "auth"]):
                config_type = "env"
            else:
                config_type = "action"

        ar_list.append({
            "name": _DISPLAY_NAMES.get(ch.name, ch.name.replace("_", " ").title()),
            "channel": ch.name,
            "status": status,
            "message": message,
            "config_type": config_type,
            "is_configured": status == "ok",
        })

    return ar_list


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

        # Detect active backend from config BEFORE processing providers
        active_config_value = None
        for prov in cat.get("providers", []):
            ck = prov.get("config_key")
            cv = prov.get("config_value")
            if ck and cv:
                parts = ck.split(".")
                cfg_val = config
                for p in parts:
                    cfg_val = cfg_val.get(p, {}) if isinstance(cfg_val, dict) else {}
                if str(cfg_val) == cv:
                    active_config_value = cv
                    break

        # For combined mode: only show combined banner when actively selected
        is_combined_active = active_config_value == "combined"
        if is_combined_active and cat.get("combined_backends"):
            entry["mode"] = "combined"
            entry["mode_description"] = (
                "Queries multiple search APIs in parallel and deduplicates results by URL for maximum coverage. "
                "The more backends you configure, the richer the results."
            )
            entry["combined_backends"] = []
            for be in cat["combined_backends"]:
                val = _get_env_value(be["key"])
                entry["combined_backends"].append({
                    "key": be["key"],
                    "name": be["name"],
                    "url": be.get("url", ""),
                    "is_set": bool(val),
                    "value_preview": val[:4] + "****" if val and len(val) > 8 else ("****" if val else ""),
                })
            entry["combined_active_count"] = sum(1 for be in entry["combined_backends"] if be["is_set"])

        for prov in cat.get("providers", []):
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

        # For the 'web' category: attach Agent-Reach channel statuses dynamically
        if ts_key == "web":
            ar_channels = _get_agent_reach_channels()
            ar_list = _build_agent_reach_list(ar_channels)
            entry["agent_reach_channels"] = ar_list

            # Add Agent-Reach info to combined mode
            if is_combined_active:
                ar_active = [ch for ch in ar_list if ch["status"] == "ok"]
                entry["agent_reach_combined"] = [
                    {"channel": ch["channel"], "name": ch["name"], "status": ch["status"]}
                    for ch in ar_active
                ]
                entry["agent_reach_active_count"] = len(ar_active)

        result[ts_key] = entry

    # Include image_gen model list and current model selection
    if "image_gen" in TOOL_CATEGORIES and "models" in TOOL_CATEGORIES["image_gen"]:
        result["image_gen"]["models"] = TOOL_CATEGORIES["image_gen"]["models"]
        result["image_gen"]["current_model"] = config.get("image_gen", {}).get("model", "")

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
async def set_tool_env(body: ToolEnvRequest):
    """Set an environment variable in ~/.hermes/.env and optionally update config.yaml."""
    try:
        _save_env_value(body.key, body.value)
    except Exception as e:
        raise HTTPException(500, f"Failed to save env var: {e}")

    # If a config key was provided, update config.yaml too
    if body.config_key and body.config_value:
        try:
            config = _load_yaml_config()
            parts = body.config_key.split(".")
            obj = config
            for p in parts[:-1]:
                obj = obj.setdefault(p, {})
            obj[parts[-1]] = body.config_value
            _save_yaml_config(config)
        except Exception as e:
            raise HTTPException(500, f"Env saved but config update failed: {e}")

    return {"status": "ok", "key": body.key}


@router.get("/platform/{platform}")
async def list_tools_platform(platform: str):
    """List tools for a specific platform."""
    try:
        output = await run_hermes("tools", "list", "--platform", platform, timeout=15)
        return {"output": output}
    except RuntimeError as e:
        return {"output": "", "error": str(e)}


@router.post("/enable")
async def enable_tool(body: ToolToggleRequest):
    """Enable a tool for a platform."""
    try:
        output = await run_hermes("tools", "enable", body.tool, "--platform", body.platform, timeout=15)
        return {"status": "enabled", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))


@router.post("/disable")
async def disable_tool(body: ToolToggleRequest):
    """Disable a tool for a platform."""
    try:
        output = await run_hermes("tools", "disable", body.tool, "--platform", body.platform, timeout=15)
        return {"status": "disabled", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))


@router.post("/agent-reach/check")
async def check_agent_reach():
    """Force re-check all Agent-Reach channels and return updated statuses."""
    ar_channels = _get_agent_reach_channels()
    ar_list = _build_agent_reach_list(ar_channels)
    return {"channels": ar_list, "total": len(ar_list), "active": sum(1 for ch in ar_list if ch["status"] == "ok")}


@router.get("/registry")
async def tools_registry():
    """List all tools from the Hermes agent registry with name, toolset, description, and enabled status."""
    config = _load_yaml_config()
    disabled_tools = set(config.get("skills", {}).get("disabled", []) if isinstance(config.get("skills"), dict) else [])
    tools_disabled = set(config.get("tools", {}).get("disabled", []) if isinstance(config.get("tools"), dict) else [])

    try:
        output = await run_hermes("tools", "list", timeout=20)
    except RuntimeError as e:
        return {"tools": [], "error": str(e)}

    tools = []
    current_toolset = "builtin"
    for line in output.splitlines():
        stripped = line.strip()

        ts_match = re.match(r"Built-in toolsets.*?(\w+)", stripped)
        if ts_match:
            current_toolset = ts_match.group(1)
            continue

        m = re.match(r"([✓✗])\s+(enabled|disabled)\s+(\w+)\s+(.+)", stripped)
        if m:
            tool_name = m.group(3)
            toolset = "skill" if tool_name in disabled_tools else current_toolset
            tools.append({
                "name": tool_name,
                "toolset": toolset,
                "description": m.group(4).strip(),
                "enabled": m.group(1) == "✓",
                "disabled_config": tool_name in disabled_tools or tool_name in tools_disabled,
            })

    toolsets = sorted(set(t["toolset"] for t in tools))
    return {"tools": tools, "toolsets": toolsets, "total": len(tools), "enabled_count": sum(1 for t in tools if t["enabled"])}
