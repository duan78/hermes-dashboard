import re
from pathlib import Path

from fastapi import APIRouter, Request
from ..config import HERMES_HOME
from ..utils import hermes_path

router = APIRouter(prefix="/api/env-vars", tags=["env-vars"])

ENV_PATH = HERMES_HOME / ".env"

SENSITIVE_KEYS = re.compile(
    r"(key|token|secret|password|api|auth|credential|private)", re.IGNORECASE
)

REQUIRED_VARS = [
    {"key": "TELEGRAM_BOT_TOKEN", "description": "Telegram bot token for DM communication", "category": "Messaging"},
    {"key": "OPENAI_API_KEY", "description": "OpenAI API key for GPT models", "category": "AI Provider"},
    {"key": "MISTRAL_API_KEY", "description": "Mistral API key for Mistral models", "category": "AI Provider"},
    {"key": "ANTHROPIC_API_KEY", "description": "Anthropic API key for Claude models", "category": "AI Provider"},
    {"key": "ELEVENLABS_API_KEY", "description": "ElevenLabs API key for voice synthesis", "category": "Voice"},
    {"key": "DEEPGRAM_API_KEY", "description": "Deepgram API key for speech-to-text", "category": "Voice"},
    {"key": "GOOGLE_API_KEY", "description": "Google API key for Gemini models", "category": "AI Provider"},
    {"key": "GROQ_API_KEY", "description": "Groq API key for fast inference", "category": "AI Provider"},
]


def _mask_value(value: str) -> str:
    """Show only last 4 characters for sensitive values."""
    if not value or len(value) <= 4:
        return "****"
    return "****" + value[-4:]


def _parse_env() -> list:
    """Parse .env file into list of var dicts."""
    if not ENV_PATH.exists():
        return []
    result = []
    for line in ENV_PATH.read_text(errors="replace").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        key = key.strip()
        value = value.strip()
        # Remove surrounding quotes
        if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
            value = value[1:-1]
        is_sensitive = bool(SENSITIVE_KEYS.search(key))
        result.append({
            "key": key,
            "value": _mask_value(value) if is_sensitive else value,
            "is_sensitive": is_sensitive,
            "has_value": bool(value),
        })
    return result


@router.get("/list")
async def list_env_vars():
    """List all environment variables from .env."""
    return {"vars": _parse_env()}


@router.put("/set")
async def set_env_var(request: Request):
    """Set or update an environment variable in .env."""
    body = await request.json()
    key = body.get("key", "").strip()
    value = body.get("value", "")
    if not key:
        return {"error": "Key is required"}

    # Validate key against allowlist
    ALLOWED_ENV_KEYS = {d.get("key") for d in REQUIRED_VARS if d.get("key")} | {"HERMES_HOME", "HERMES_BIN", "HERMES_PYTHON", "HERMES_AGENT_DIR", "HERMES_MEMORY_PATH", "DASHBOARD_TOKEN"}
    if key not in ALLOWED_ENV_KEYS:
        return {"error": f"Unknown environment variable: {key}"}

    # Read existing lines
    lines = []
    if ENV_PATH.exists():
        lines = ENV_PATH.read_text(errors="replace").splitlines()

    # Find and replace or append
    pattern = re.compile(rf"^{re.escape(key)}=", re.IGNORECASE)
    found = False
    new_lines = []
    for line in lines:
        if pattern.match(line.strip()):
            new_lines.append(f'{key}="{value}"')
            found = True
        else:
            new_lines.append(line)
    if not found:
        new_lines.append(f'{key}="{value}"')

    ENV_PATH.parent.mkdir(parents=True, exist_ok=True)
    ENV_PATH.write_text("\n".join(new_lines) + "\n")
    return {"status": "updated"}


@router.delete("/delete")
async def delete_env_var(request: Request):
    """Delete an environment variable from .env."""
    body = await request.json()
    key = body.get("key", "").strip()
    if not key:
        return {"error": "Key is required"}

    if not ENV_PATH.exists():
        return {"status": "deleted"}

    pattern = re.compile(rf"^{re.escape(key)}=", re.IGNORECASE)
    lines = ENV_PATH.read_text(errors="replace").splitlines()
    new_lines = [l for l in lines if not pattern.match(l.strip())]
    ENV_PATH.write_text("\n".join(new_lines) + "\n")
    return {"status": "deleted"}


@router.get("/required")
async def required_env_vars():
    """List required environment variables with their status."""
    configured_keys = set()
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(errors="replace").splitlines():
            stripped = line.strip()
            if stripped and not stripped.startswith("#") and "=" in stripped:
                configured_keys.add(stripped.split("=", 1)[0].strip())

    result = []
    for var in REQUIRED_VARS:
        result.append({
            **var,
            "configured": var["key"] in configured_keys,
        })
    return {"required": result}
