"""Context compression monitoring endpoints."""
import json
import re
from pathlib import Path

from fastapi import APIRouter

from ..config import HERMES_HOME

router = APIRouter(prefix="/api/context", tags=["context"])


def _load_yaml_config() -> dict:
    import yaml
    cfg_path = HERMES_HOME / "config.yaml"
    if cfg_path.exists():
        try:
            return yaml.safe_load(cfg_path.read_text()) or {}
        except Exception:
            pass
    return {}


# Known model context lengths
MODEL_CONTEXT_LENGTHS = {
    "gpt-4o": 128000, "gpt-4o-mini": 128000, "gpt-4-turbo": 128000,
    "gpt-4": 8192, "gpt-3.5-turbo": 16385,
    "claude-sonnet-4": 200000, "claude-opus-4": 200000, "claude-haiku-4": 200000,
    "claude-3-5-sonnet": 200000, "claude-3-opus": 200000, "claude-3-haiku": 200000,
    "glm-5-turbo": 128000, "deepseek-chat": 128000, "deepseek-reasoner": 128000,
    "mistral-large": 128000, "mistral-medium": 32000, "mistral-small": 32000,
    "gemini-3-flash": 1048576, "gemini-3-pro": 2097152,
}


def _get_context_length(model: str) -> int:
    for k, v in MODEL_CONTEXT_LENGTHS.items():
        if k in model.lower():
            return v
    return 128000  # default


@router.get("/status")
async def context_status():
    """Get current context usage and compression history."""
    config = _load_yaml_config()
    model = config.get("model", {}).get("default", "gpt-4o")
    context_length = _get_context_length(model)
    compression = config.get("compression", {})

    # Parse compression history from logs
    compression_events = []
    log_dir = HERMES_HOME / "logs"
    if log_dir.exists():
        for log_file in sorted(log_dir.glob("*.log"), reverse=True):
            try:
                for line in reversed(log_file.read_text(errors="replace").splitlines()):
                    if "compress" in line.lower() and ("ratio" in line.lower() or "token" in line.lower()):
                        ts_match = re.match(r"(\d{4}[-/]\d{2}[-/]\d{2}[\sT]\d{2}:\d{2}:\d{2})", line)
                        ratio_match = re.search(r"ratio[:\s]+([\d.]+)", line)
                        msgs_match = re.search(r"(\d+)\s+messages?", line)
                        compression_events.append({
                            "date": ts_match.group(1) if ts_match else "",
                            "ratio": float(ratio_match.group(1)) if ratio_match else 0,
                            "messages_affected": int(msgs_match.group(1)) if msgs_match else 0,
                        })
                        if len(compression_events) >= 20:
                            break
                if len(compression_events) >= 20:
                    break
            except OSError:
                pass

    return {
        "model": model,
        "context_length": context_length,
        "compression": {
            "enabled": compression.get("enabled", False),
            "threshold": compression.get("threshold", 0.5),
            "target_ratio": compression.get("target_ratio", 0.2),
            "protect_last_n": compression.get("protect_last_n", 20),
        },
        "compression_events": compression_events,
    }
