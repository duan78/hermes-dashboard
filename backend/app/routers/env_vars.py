import re

from fastapi import APIRouter, HTTPException, Request

from ..config import HERMES_HOME

router = APIRouter(prefix="/api/env-vars", tags=["env-vars"])

ENV_PATH = HERMES_HOME / ".env"

SENSITIVE_KEYS = re.compile(
    r"(key|token|secret|password|api|auth|credential|private)", re.IGNORECASE
)

# ── Allowlist for env-vars/set ──────────────────────────────────────────
# Keys explicitly allowed.  Covers all REQUIRED_VARS, PLATFORM_ENV_VARS,
# and common Hermes config keys used across the codebase.
_ALLOWED_KEYS: set[str] = {
    # Required API keys
    "TELEGRAM_BOT_TOKEN", "OPENAI_API_KEY", "MISTRAL_API_KEY",
    "ANTHROPIC_API_KEY", "ELEVENLABS_API_KEY", "DEEPGRAM_API_KEY",
    "GOOGLE_API_KEY", "GROQ_API_KEY",
    # Platform vars (telegram / discord / whatsapp / signal / slack / matrix / dingtalk / feishu)
    "TELEGRAM_ALLOWED_USERS",
    "DISCORD_BOT_TOKEN", "DISCORD_HOME_CHANNEL",
    "WHATSAPP_MODE", "WHATSAPP_ENABLED",
    "SIGNAL_ACCOUNT", "SIGNAL_HTTP_URL",
    "SLACK_BOT_TOKEN", "SLACK_APP_TOKEN",
    "MATRIX_PASSWORD", "MATRIX_ENCRYPTION", "MATRIX_HOME_ROOM",
    "DINGTALK_CLIENT_ID", "DINGTALK_CLIENT_SECRET",
    "FEISHU_APP_ID", "FEISHU_APP_SECRET",
    # Hermes core config
    "HERMES_HOME", "HERMES_DASHBOARD_TOKEN", "HERMES_BIN",
    "HERMES_PYTHON", "HERMES_AGENT_DIR", "HERMES_MEMORY_PATH",
    "DASHBOARD_TOKEN",
    # General safe env name pattern: uppercase letters, digits, underscores,
    # ending with a known suffix — allows user-defined keys like MY_CUSTOM_KEY
    # without letting through dangerous names like PATH, HOME, LD_PRELOAD, etc.
}

# Safe suffixes for user-defined keys
_SAFE_KEY_RE = re.compile(r'^[A-Z][A-Z0-9_]*(?:_KEY|_TOKEN|_SECRET|_URL|_ID|_MODE|_ENABLED|_PATH|_DIR|_HOST|_PORT|_USER|_PASS(?:WORD)?|_CONFIG)$')
# Keys that must NEVER be overwritten
_BLOCKED_KEYS = frozenset({
    "PATH", "HOME", "USER", "SHELL", "LD_PRELOAD", "LD_LIBRARY_PATH",
    "PYTHONPATH", "PYTHONHOME", "HOSTNAME", "LANG", "TERM",
    "PWD", "OLDPWD", "DISPLAY", "XAUTHORITY", "SSH_AUTH_SOCK",
})


def _validate_env_key(key: str) -> None:
    """Raise 400 if *key* is not allowed via the allowlist."""
    if key in _BLOCKED_KEYS:
        raise HTTPException(400, f"Key '{key}' is blocked for security reasons")
    if key in _ALLOWED_KEYS:
        return
    if _SAFE_KEY_RE.match(key):
        return
    raise HTTPException(
        400,
        f"Key '{key}' is not in the allowed list. "
        "Allowed: known Hermes keys, or names matching "
        "PREFIX_{KEY,TOKEN,SECRET,URL,ID,MODE,ENABLED,PATH,DIR,HOST,PORT,USER,PASS,CONFIG}.",
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
            "raw_value": value,
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
        raise HTTPException(400, "Key is required")

    _validate_env_key(key)

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
        raise HTTPException(400, "Key is required")

    _validate_env_key(key)

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
