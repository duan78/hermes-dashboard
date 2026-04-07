import os
import re
import stat
import time
import tempfile
from pathlib import Path
from fastapi import APIRouter, HTTPException, Body
import httpx
from ..config import HERMES_HOME

router = APIRouter(prefix="/api/api-keys", tags=["api-keys"])


# ── Key definitions grouped by category ──

API_KEY_DEFINITIONS = [
    # ── Provider keys ──
    {
        "key": "OPENAI_API_KEY",
        "label": "OpenAI API Key",
        "category": "Provider",
        "subcategory": "OpenAI",
        "description": "API key for OpenAI GPT models (GPT-4o, GPT-4, etc.)",
        "url": "https://platform.openai.com/api-keys",
        "is_password": True,
    },
    {
        "key": "OPENAI_BASE_URL",
        "label": "OpenAI Base URL",
        "category": "Provider",
        "subcategory": "OpenAI",
        "description": "Custom base URL for OpenAI-compatible API endpoints",
        "url": "",
        "is_password": False,
    },
    {
        "key": "ANTHROPIC_API_KEY",
        "label": "Anthropic API Key",
        "category": "Provider",
        "subcategory": "Anthropic",
        "description": "API key for Anthropic Claude models",
        "url": "https://console.anthropic.com/settings/keys",
        "is_password": True,
    },
    {
        "key": "GLM_API_KEY",
        "label": "Z.AI API Key (GLM)",
        "category": "Provider",
        "subcategory": "Z.AI",
        "description": "API key for Z.AI / GLM models",
        "url": "",
        "is_password": True,
    },
    {
        "key": "ZAI_API_KEY",
        "label": "Z.AI API Key (Alt)",
        "category": "Provider",
        "subcategory": "Z.AI",
        "description": "Alternative Z.AI API key",
        "url": "",
        "is_password": True,
    },
    {
        "key": "OPENROUTER_API_KEY",
        "label": "OpenRouter API Key",
        "category": "Provider",
        "subcategory": "OpenRouter",
        "description": "API key for OpenRouter — unified access to 100+ LLM providers",
        "url": "https://openrouter.ai/keys",
        "is_password": True,
    },
    {
        "key": "NOUS_BASE_URL",
        "label": "Nous Research Base URL",
        "category": "Provider",
        "subcategory": "Nous",
        "description": "Base URL for Nous Research API endpoint",
        "url": "",
        "is_password": False,
    },
    {
        "key": "NVIDIA_API_KEY",
        "label": "NVIDIA API Key",
        "category": "Provider",
        "subcategory": "NVIDIA",
        "description": "API key for NVIDIA NIM — access to Llama, Mistral, and other NVIDIA-hosted models. Free tier available.",
        "url": "https://build.nvidia.com/",
        "is_password": True,
    },
    {
        "key": "NVIDIA_BASE_URL",
        "label": "NVIDIA Base URL",
        "category": "Provider",
        "subcategory": "NVIDIA",
        "description": "Custom base URL for NVIDIA NIM API endpoint",
        "url": "",
        "is_password": False,
    },
    {
        "key": "CEREBRAS_API_KEY",
        "label": "Cerebras API Key",
        "category": "Provider",
        "subcategory": "Cerebras",
        "description": "API key for Cerebras — ultra-fast inference on Llama models. Free tier available.",
        "url": "https://cloud.cerebras.ai/",
        "is_password": True,
    },
    {
        "key": "CEREBRAS_BASE_URL",
        "label": "Cerebras Base URL",
        "category": "Provider",
        "subcategory": "Cerebras",
        "description": "Custom base URL for Cerebras API endpoint",
        "url": "",
        "is_password": False,
    },
    {
        "key": "GOOGLE_API_KEY",
        "label": "Google Gemini API Key",
        "category": "Provider",
        "subcategory": "Google",
        "description": "API key for Google Gemini models (Gemini Pro, Ultra, Flash). Free tier with rate limits.",
        "url": "https://aistudio.google.com/app/apikey",
        "is_password": True,
    },
    {
        "key": "GOOGLE_BASE_URL",
        "label": "Google Base URL",
        "category": "Provider",
        "subcategory": "Google",
        "description": "Custom base URL for Google Gemini API endpoint",
        "url": "",
        "is_password": False,
    },
    {
        "key": "MISTRAL_API_KEY",
        "label": "Mistral API Key",
        "category": "Provider",
        "subcategory": "Mistral",
        "description": "API key for Mistral AI — Mistral, Mixtral, and Codestral models. Free tier available.",
        "url": "https://console.mistral.ai/api-keys/",
        "is_password": True,
    },
    {
        "key": "MISTRAL_BASE_URL",
        "label": "Mistral Base URL",
        "category": "Provider",
        "subcategory": "Mistral",
        "description": "Custom base URL for Mistral API endpoint",
        "url": "",
        "is_password": False,
    },
    {
        "key": "GROQ_API_KEY",
        "label": "Groq API Key",
        "category": "Provider",
        "subcategory": "Groq",
        "description": "API key for Groq — extremely fast LPU inference on Llama and Mixtral. Free tier available.",
        "url": "https://console.groq.com/keys",
        "is_password": True,
    },
    {
        "key": "GROQ_BASE_URL",
        "label": "Groq Base URL",
        "category": "Provider",
        "subcategory": "Groq",
        "description": "Custom base URL for Groq API endpoint",
        "url": "",
        "is_password": False,
    },
    {
        "key": "DEEPSEEK_API_KEY",
        "label": "DeepSeek API Key",
        "category": "Provider",
        "subcategory": "DeepSeek",
        "description": "API key for DeepSeek — DeepSeek-V3 and DeepSeek-Coder models. Low-cost pricing.",
        "url": "https://platform.deepseek.com/api_keys",
        "is_password": True,
    },
    {
        "key": "DEEPSEEK_BASE_URL",
        "label": "DeepSeek Base URL",
        "category": "Provider",
        "subcategory": "DeepSeek",
        "description": "Custom base URL for DeepSeek API endpoint",
        "url": "",
        "is_password": False,
    },
    {
        "key": "COHERE_API_KEY",
        "label": "Cohere API Key",
        "category": "Provider",
        "subcategory": "Cohere",
        "description": "API key for Cohere — Command, Embed, and Rerank models. Free tier available.",
        "url": "https://dashboard.cohere.com/api-keys",
        "is_password": True,
    },
    {
        "key": "TOGETHER_API_KEY",
        "label": "Together AI API Key",
        "category": "Provider",
        "subcategory": "Together AI",
        "description": "API key for Together AI — open-source model hosting (Llama, FLUX, etc.). Free trial credits.",
        "url": "https://api.together.xyz/settings/api-keys",
        "is_password": True,
    },
    {
        "key": "TOGETHER_BASE_URL",
        "label": "Together AI Base URL",
        "category": "Provider",
        "subcategory": "Together AI",
        "description": "Custom base URL for Together AI API endpoint",
        "url": "",
        "is_password": False,
    },

    # ── Tool keys ──
    {
        "key": "FIRECRAWL_API_KEY",
        "label": "Firecrawl API Key",
        "category": "Tools",
        "subcategory": "Web",
        "description": "API key for Firecrawl — web scraping, search, and crawl service",
        "url": "https://firecrawl.dev",
        "is_password": True,
    },
    {
        "key": "FIRECRAWL_API_URL",
        "label": "Firecrawl API URL",
        "category": "Tools",
        "subcategory": "Web",
        "description": "Custom URL for self-hosted Firecrawl instance",
        "url": "",
        "is_password": False,
    },
    {
        "key": "EXA_API_KEY",
        "label": "Exa API Key",
        "category": "Tools",
        "subcategory": "Web",
        "description": "API key for Exa — AI-native search and content retrieval",
        "url": "https://exa.ai",
        "is_password": True,
    },
    {
        "key": "PARALLEL_API_KEY",
        "label": "Parallel API Key",
        "category": "Tools",
        "subcategory": "Web",
        "description": "API key for Parallel — AI-native search and extraction",
        "url": "https://parallel.ai",
        "is_password": True,
    },
    {
        "key": "TAVILY_API_KEY",
        "label": "Tavily API Key",
        "category": "Tools",
        "subcategory": "Web",
        "description": "API key for Tavily — AI search, extract, and crawl",
        "url": "https://app.tavily.com/home",
        "is_password": True,
    },
    {
        "key": "FAL_KEY",
        "label": "FAL.ai API Key",
        "category": "Tools",
        "subcategory": "Image Gen",
        "description": "API key for FAL.ai — FLUX and other image generation models",
        "url": "https://fal.ai/dashboard/keys",
        "is_password": True,
    },
    {
        "key": "BROWSERBASE_API_KEY",
        "label": "Browserbase API Key",
        "category": "Tools",
        "subcategory": "Browser",
        "description": "API key for Browserbase — cloud browser with stealth and proxies",
        "url": "https://browserbase.com",
        "is_password": True,
    },
    {
        "key": "BROWSERBASE_PROJECT_ID",
        "label": "Browserbase Project ID",
        "category": "Tools",
        "subcategory": "Browser",
        "description": "Project ID for your Browserbase instance",
        "url": "",
        "is_password": False,
    },
    {
        "key": "BROWSER_USE_API_KEY",
        "label": "Browser Use API Key",
        "category": "Tools",
        "subcategory": "Browser",
        "description": "API key for Browser Use — cloud browser with remote execution",
        "url": "https://browser-use.com",
        "is_password": True,
    },
    {
        "key": "CAMOFOX_URL",
        "label": "Camofox Server URL",
        "category": "Tools",
        "subcategory": "Browser",
        "description": "URL for local Camofox anti-detection browser (Firefox/Camoufox)",
        "url": "",
        "is_password": False,
    },
    {
        "key": "ELEVENLABS_API_KEY",
        "label": "ElevenLabs API Key",
        "category": "Tools",
        "subcategory": "TTS",
        "description": "API key for ElevenLabs — premium natural-sounding text-to-speech",
        "url": "https://elevenlabs.io/app/settings/api-keys",
        "is_password": True,
    },
    {
        "key": "VOICE_TOOLS_OPENAI_KEY",
        "label": "OpenAI TTS Key",
        "category": "Tools",
        "subcategory": "TTS",
        "description": "OpenAI API key used for TTS voice generation",
        "url": "https://platform.openai.com/api-keys",
        "is_password": True,
    },
    {
        "key": "HASS_TOKEN",
        "label": "Home Assistant Token",
        "category": "Tools",
        "subcategory": "Home Assistant",
        "description": "Long-lived access token for Home Assistant REST API",
        "url": "",
        "is_password": True,
    },
    {
        "key": "HASS_URL",
        "label": "Home Assistant URL",
        "category": "Tools",
        "subcategory": "Home Assistant",
        "description": "URL of your Home Assistant instance",
        "url": "",
        "is_password": False,
    },
    {
        "key": "TINKER_API_KEY",
        "label": "Tinker API Key",
        "category": "Tools",
        "subcategory": "RL Training",
        "description": "API key for Tinker / Atropos RL training platform",
        "url": "https://tinker-console.thinkingmachines.ai/keys",
        "is_password": True,
    },
    {
        "key": "WANDB_API_KEY",
        "label": "WandB API Key",
        "category": "Tools",
        "subcategory": "WandB",
        "description": "API key for Weights & Biases experiment tracking",
        "url": "https://wandb.ai/authorize",
        "is_password": True,
    },

    # ── Platform keys ──
    {
        "key": "TELEGRAM_BOT_TOKEN",
        "label": "Telegram Bot Token",
        "category": "Platforms",
        "subcategory": "Telegram",
        "description": "Bot token from @BotFather for Telegram integration",
        "url": "https://t.me/BotFather",
        "is_password": True,
    },
    {
        "key": "DISCORD_BOT_TOKEN",
        "label": "Discord Bot Token",
        "category": "Platforms",
        "subcategory": "Discord",
        "description": "Bot token for Discord integration",
        "url": "https://discord.com/developers/applications",
        "is_password": True,
    },
    {
        "key": "DISCORD_HOME_CHANNEL",
        "label": "Discord Home Channel",
        "category": "Platforms",
        "subcategory": "Discord",
        "description": "Default channel ID for Discord bot messages",
        "url": "",
        "is_password": False,
    },
    {
        "key": "SLACK_BOT_TOKEN",
        "label": "Slack Bot Token",
        "category": "Platforms",
        "subcategory": "Slack",
        "description": "Bot token (xoxb-) for Slack integration",
        "url": "https://api.slack.com/apps",
        "is_password": True,
    },
    {
        "key": "SLACK_APP_TOKEN",
        "label": "Slack App Token",
        "category": "Platforms",
        "subcategory": "Slack",
        "description": "App-level token (xapp-) for Slack Socket Mode",
        "url": "https://api.slack.com/apps",
        "is_password": True,
    },
    {
        "key": "WHATSAPP_MODE",
        "label": "WhatsApp Mode",
        "category": "Platforms",
        "subcategory": "WhatsApp",
        "description": "WhatsApp connection mode configuration",
        "url": "",
        "is_password": False,
    },
    {
        "key": "WHATSAPP_ENABLED",
        "label": "WhatsApp Enabled",
        "category": "Platforms",
        "subcategory": "WhatsApp",
        "description": "Enable/disable WhatsApp integration",
        "url": "",
        "is_password": False,
    },
    {
        "key": "SIGNAL_ACCOUNT",
        "label": "Signal Account",
        "category": "Platforms",
        "subcategory": "Signal",
        "description": "Signal account phone number for integration",
        "url": "",
        "is_password": False,
    },
    {
        "key": "SIGNAL_HTTP_URL",
        "label": "Signal HTTP URL",
        "category": "Platforms",
        "subcategory": "Signal",
        "description": "URL of signal-cli REST API instance",
        "url": "",
        "is_password": False,
    },
    {
        "key": "MATRIX_PASSWORD",
        "label": "Matrix Password",
        "category": "Platforms",
        "subcategory": "Matrix",
        "description": "Password for Matrix bot account",
        "url": "",
        "is_password": True,
    },
    {
        "key": "MATRIX_ENCRYPTION",
        "label": "Matrix Encryption",
        "category": "Platforms",
        "subcategory": "Matrix",
        "description": "Encryption key/passphrase for Matrix E2EE",
        "url": "",
        "is_password": True,
    },
    {
        "key": "MATRIX_HOME_ROOM",
        "label": "Matrix Home Room",
        "category": "Platforms",
        "subcategory": "Matrix",
        "description": "Default room ID for Matrix bot messages",
        "url": "",
        "is_password": False,
    },
]


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


def _delete_env_value(key: str):
    """Remove a key from ~/.hermes/.env."""
    env_path = HERMES_HOME / ".env"
    if not env_path.exists():
        return
    lines = env_path.read_text(errors="replace").splitlines(keepends=True)
    new_lines = [line for line in lines if not line.strip().startswith(f"{key}=")]
    if len(new_lines) == len(lines):
        return  # key not found
    fd, tmp_path = tempfile.mkstemp(dir=str(env_path.parent), suffix='.tmp', prefix='.env_')
    try:
        with os.fdopen(fd, 'w') as f:
            f.writelines(new_lines)
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
    os.environ.pop(key, None)


@router.get("")
async def get_api_keys():
    """Return all API key definitions with their current status."""
    result = {"categories": {}, "keys": []}
    known_keys = {d["key"] for d in API_KEY_DEFINITIONS}
    _CUSTOM_KEY_RE = re.compile(r'^[A-Z][A-Z0-9_]*(?:_KEY|_TOKEN|_SECRET|_URL|_API)$')
    for defn in API_KEY_DEFINITIONS:
        val = _get_env_value(defn["key"])
        is_set = bool(val)
        masked = ""
        if is_set:
            if len(val) > 8:
                masked = val[:4] + "****"
            else:
                masked = "****"
        key_info = {
            "key": defn["key"],
            "label": defn["label"],
            "category": defn["category"],
            "subcategory": defn["subcategory"],
            "description": defn["description"],
            "url": defn["url"],
            "is_password": defn["is_password"],
            "is_set": is_set,
            "value_preview": masked,
        }
        result["keys"].append(key_info)
        cat = defn["category"]
        if cat not in result["categories"]:
            result["categories"][cat] = {}
        sub = defn["subcategory"]
        if sub not in result["categories"][cat]:
            result["categories"][cat][sub] = []
        result["categories"][cat][sub].append(key_info)

    # Discover custom keys from .env file that are not in known definitions
    env_path = HERMES_HOME / ".env"
    if env_path.exists():
        for line in env_path.read_text(errors="replace").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            ck = line.split("=", 1)[0].strip()
            if ck in known_keys:
                continue
            if not _CUSTOM_KEY_RE.match(ck):
                continue
            val = _get_env_value(ck)
            is_set = bool(val)
            masked = ""
            if is_set:
                if len(val) > 8:
                    masked = val[:4] + "****"
                else:
                    masked = "****"
            is_password = ck.endswith(("_KEY", "_TOKEN", "_SECRET", "_API"))
            key_info = {
                "key": ck,
                "label": ck.replace("_", " ").title(),
                "category": "Custom",
                "subcategory": "Custom",
                "description": "Custom environment variable",
                "url": "",
                "is_password": is_password,
                "is_set": is_set,
                "value_preview": masked,
            }
            result["keys"].append(key_info)
            if "Custom" not in result["categories"]:
                result["categories"]["Custom"] = {}
            if "Custom" not in result["categories"]["Custom"]:
                result["categories"]["Custom"]["Custom"] = []
            result["categories"]["Custom"]["Custom"].append(key_info)

    return result


@router.post("/set")
async def set_api_key(body: dict = Body(...)):
    """Set an API key in ~/.hermes/.env."""
    key = body.get("key")
    value = body.get("value", "")
    if not key:
        raise HTTPException(400, "Missing 'key'")
    # Validate against known keys or custom key pattern
    known_keys = {d["key"] for d in API_KEY_DEFINITIONS}
    _CUSTOM_KEY_RE = re.compile(r'^[A-Z][A-Z0-9_]*(?:_KEY|_TOKEN|_SECRET|_URL|_API)$')
    if key not in known_keys and not _CUSTOM_KEY_RE.match(key):
        raise HTTPException(400, f"Unknown key: {key}")
    try:
        _save_env_value(key, value)
    except Exception as e:
        raise HTTPException(500, f"Failed to save: {e}")
    return {"status": "ok", "key": key}


@router.post("/delete")
async def delete_api_key(body: dict = Body(...)):
    """Remove an API key from ~/.hermes/.env."""
    key = body.get("key")
    if not key:
        raise HTTPException(400, "Missing 'key'")
    known_keys = {d["key"] for d in API_KEY_DEFINITIONS}
    _CUSTOM_KEY_RE = re.compile(r'^[A-Z][A-Z0-9_]*(?:_KEY|_TOKEN|_SECRET|_URL|_API)$')
    if key not in known_keys and not _CUSTOM_KEY_RE.match(key):
        raise HTTPException(400, f"Unknown key: {key}")
    try:
        _delete_env_value(key)
    except Exception as e:
        raise HTTPException(500, f"Failed to delete: {e}")
    return {"status": "ok", "key": key}


# ── Provider test configuration ──

PROVIDER_TEST_CONFIG = {
    "OPENAI_API_KEY": {
        "base_url_env": "OPENAI_BASE_URL",
        "default_base_url": "https://api.openai.com/v1",
        "model": "gpt-4o-mini",
    },
    "ANTHROPIC_API_KEY": {
        "base_url_env": None,
        "default_base_url": "https://api.anthropic.com/v1",
        "model": "claude-3-haiku-20240307",
        "anthropic": True,
    },
    "GLM_API_KEY": {
        "base_url_env": None,
        "default_base_url": "https://open.bigmodel.cn/api/paas/v4",
        "model": "glm-4-flash",
    },
    "ZAI_API_KEY": {
        "base_url_env": None,
        "default_base_url": "https://api.z-ai.io/v1",
        "model": "glm-5-turbo",
    },
    "OPENROUTER_API_KEY": {
        "base_url_env": None,
        "default_base_url": "https://openrouter.ai/api/v1",
        "model": "meta-llama/llama-3.1-8b-instruct:free",
    },
    "NVIDIA_API_KEY": {
        "base_url_env": "NVIDIA_BASE_URL",
        "default_base_url": "https://integrate.api.nvidia.com/v1",
        "model": "meta/llama-3.1-8b-instruct",
    },
    "CEREBRAS_API_KEY": {
        "base_url_env": "CEREBRAS_BASE_URL",
        "default_base_url": "https://api.cerebras.ai/v1",
        "model": "llama3.1-8b",
    },
    "GOOGLE_API_KEY": {
        "base_url_env": "GOOGLE_BASE_URL",
        "default_base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "model": "gemini-2.0-flash",
    },
    "MISTRAL_API_KEY": {
        "base_url_env": "MISTRAL_BASE_URL",
        "default_base_url": "https://api.mistral.ai/v1",
        "model": "mistral-small-latest",
    },
    "GROQ_API_KEY": {
        "base_url_env": "GROQ_BASE_URL",
        "default_base_url": "https://api.groq.com/openai/v1",
        "model": "llama-3.1-8b-instant",
    },
    "DEEPSEEK_API_KEY": {
        "base_url_env": "DEEPSEEK_BASE_URL",
        "default_base_url": "https://api.deepseek.com/v1",
        "model": "deepseek-chat",
    },
    "COHERE_API_KEY": {
        "base_url_env": None,
        "default_base_url": "https://api.cohere.com/v2",
        "model": "command-r",
        "cohere": True,
    },
    "TOGETHER_API_KEY": {
        "base_url_env": "TOGETHER_BASE_URL",
        "default_base_url": "https://api.together.xyz/v1",
        "model": "meta-llama/Llama-3-8b-chat-hf",
    },
    "ELEVENLABS_API_KEY": {
        "base_url_env": None,
        "default_base_url": "https://api.elevenlabs.io",
        "model": None,
        "elevenlabs": True,
    },
    "HASS_TOKEN": {
        "base_url_env": "HASS_URL",
        "default_base_url": None,
        "model": None,
        "homeassistant": True,
    },
}


@router.post("/test")
async def test_api_key(body: dict = Body(...)):
    """Test if an API key works by making a minimal API call."""
    key_name = body.get("key", "")
    if not key_name:
        raise HTTPException(400, "Missing 'key'")

    api_key = _get_env_value(key_name)
    if not api_key:
        return {"status": "error", "error": f"Key {key_name} is not set"}

    config = PROVIDER_TEST_CONFIG.get(key_name)

    # For unknown keys, try a generic OpenAI-compatible approach
    if not config:
        base_url_key = key_name.replace("_KEY", "_BASE_URL").replace("_TOKEN", "_BASE_URL").replace("_SECRET", "_BASE_URL")
        base_url = _get_env_value(base_url_key)
        if not base_url:
            return {"status": "error", "error": "No test available for this key"}
        config = {
            "base_url_env": base_url_key,
            "default_base_url": None,
            "model": "gpt-3.5-turbo",
        }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            start = time.time()

            # ── Anthropic ──
            if config.get("anthropic"):
                base_url = config["default_base_url"]
                if config.get("base_url_env"):
                    custom = _get_env_value(config["base_url_env"])
                    if custom:
                        base_url = custom
                resp = await client.post(
                    f"{base_url}/messages",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": config["model"],
                        "max_tokens": 1,
                        "messages": [{"role": "user", "content": "hi"}],
                    },
                )
                latency = int((time.time() - start) * 1000)
                if resp.status_code == 200:
                    return {"status": "ok", "latency_ms": latency, "model": config["model"]}
                else:
                    try:
                        err = resp.json()
                        msg = err.get("error", {}).get("message", resp.text[:200])
                    except Exception:
                        msg = resp.text[:200]
                    return {"status": "error", "error": f"HTTP {resp.status_code}: {msg}"}

            # ── Cohere ──
            elif config.get("cohere"):
                base_url = config["default_base_url"]
                if config.get("base_url_env"):
                    custom = _get_env_value(config["base_url_env"])
                    if custom:
                        base_url = custom
                resp = await client.post(
                    f"{base_url}/chat",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": config["model"],
                        "message": "hi",
                        "max_tokens": 1,
                    },
                )
                latency = int((time.time() - start) * 1000)
                if resp.status_code == 200:
                    return {"status": "ok", "latency_ms": latency, "model": config["model"]}
                else:
                    try:
                        err = resp.json()
                        msg = err.get("message", resp.text[:200])
                    except Exception:
                        msg = resp.text[:200]
                    return {"status": "error", "error": f"HTTP {resp.status_code}: {msg}"}

            # ── ElevenLabs ──
            elif config.get("elevenlabs"):
                base_url = config["default_base_url"]
                resp = await client.get(
                    f"{base_url}/v1/user",
                    headers={"xi-api-key": api_key},
                )
                latency = int((time.time() - start) * 1000)
                if resp.status_code == 200:
                    return {"status": "ok", "latency_ms": latency, "model": "elevenlabs"}
                else:
                    try:
                        err = resp.json()
                        msg = err.get("detail", {}).get("message", resp.text[:200])
                    except Exception:
                        msg = resp.text[:200]
                    return {"status": "error", "error": f"HTTP {resp.status_code}: {msg}"}

            # ── Home Assistant ──
            elif config.get("homeassistant"):
                base_url = _get_env_value("HASS_URL")
                if not base_url:
                    return {"status": "error", "error": "HASS_URL is not configured"}
                base_url = base_url.rstrip("/")
                resp = await client.get(
                    f"{base_url}/api/",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                latency = int((time.time() - start) * 1000)
                if resp.status_code == 200:
                    return {"status": "ok", "latency_ms": latency, "model": "homeassistant"}
                else:
                    try:
                        err = resp.json()
                        msg = err.get("message", resp.text[:200])
                    except Exception:
                        msg = resp.text[:200]
                    return {"status": "error", "error": f"HTTP {resp.status_code}: {msg}"}

            # ── OpenAI-compatible (default) ──
            else:
                base_url = config.get("default_base_url", "")
                if config.get("base_url_env"):
                    custom = _get_env_value(config["base_url_env"])
                    if custom:
                        base_url = custom
                if not base_url:
                    return {"status": "error", "error": "No base URL configured for this provider"}
                # Strip trailing /chat/completions if user included it in the base URL
                endpoint = f"{base_url}/chat/completions"
                endpoint = endpoint.replace("//chat/completions", "/chat/completions")
                if endpoint.count("/chat/completions") > 1:
                    endpoint = endpoint.replace("/chat/completions", "", 1)
                resp = await client.post(
                    endpoint,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": config.get("model", "gpt-3.5-turbo"),
                        "max_tokens": 1,
                        "messages": [{"role": "user", "content": "hi"}],
                    },
                )
                latency = int((time.time() - start) * 1000)
                if resp.status_code == 200:
                    return {"status": "ok", "latency_ms": latency, "model": config.get("model", "unknown")}
                else:
                    try:
                        err = resp.json()
                        msg = err.get("error", {}).get("message", resp.text[:200])
                    except Exception:
                        msg = resp.text[:200]
                    return {"status": "error", "error": f"HTTP {resp.status_code}: {msg}"}

    except httpx.TimeoutException:
        return {"status": "error", "error": "Connection timed out (15s)"}
    except Exception as e:
        return {"status": "error", "error": str(e)[:300]}
