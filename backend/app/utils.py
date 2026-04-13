import asyncio
import re
from pathlib import Path
from typing import Any

from .config import HERMES_BIN, HERMES_HOME

# Patterns for detecting secrets in values
SECRET_PATTERNS = [
    re.compile(r"(api_key|apikey|api-key|token|secret|password|auth)", re.IGNORECASE),
]


def mask_secrets(data: Any, depth: int = 0) -> Any:
    """Recursively mask sensitive values in dicts/lists."""
    if isinstance(data, dict):
        return {k: _mask_value(k, v) for k, v in data.items()}
    if isinstance(data, list):
        return [mask_secrets(item, depth + 1) for item in data]
    return data


def _mask_value(key: str, value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return mask_secrets(value)
    if not isinstance(value, str):
        return value
    if not value or value in ("", "not set", "not configured"):
        return value
    for pat in SECRET_PATTERNS:
        if pat.search(str(key)):
            if len(value) <= 8:
                return "****"
            return value[:4] + "****" + value[-4:]
    return value


def hermes_path(*parts: str) -> Path:
    return HERMES_HOME.joinpath(*parts)


async def run_hermes(*args: str, timeout: int = 30) -> str:
    """Run a hermes CLI command and return stdout."""
    hermes_bin = HERMES_BIN
    cmd = [hermes_bin] + list(args)
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except TimeoutError:
        proc.kill()
        raise RuntimeError(f"Command timed out: {' '.join(cmd)}")
    if proc.returncode != 0:
        err = stderr.decode(errors="replace").strip()
        raise RuntimeError(err or f"Command failed with code {proc.returncode}")
    return stdout.decode(errors="replace")
