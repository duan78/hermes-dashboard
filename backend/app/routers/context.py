"""Context compression monitoring endpoints."""

import json
import logging
import re
from pathlib import Path

import yaml
from fastapi import APIRouter

from ..config import HERMES_HOME
from ..utils import hermes_path

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/context", tags=["context"])

# Known model context lengths (approximate)
MODEL_CONTEXT_LENGTHS = {
    "gpt-4o": 128000,
    "gpt-4o-mini": 128000,
    "gpt-4-turbo": 128000,
    "gpt-4": 128000,
    "gpt-3.5-turbo": 16385,
    "claude-sonnet-4": 200000,
    "claude-opus-4": 200000,
    "claude-3.5-sonnet": 200000,
    "claude-3-opus": 200000,
    "claude-3-sonnet": 200000,
    "claude-3-haiku": 200000,
    "glm-5": 128000,
    "glm-4": 128000,
    "gemini-pro": 32000,
    "gemini-1.5-pro": 1000000,
    "gemini-2.0-flash": 1048576,
    "mistral-large": 128000,
    "mistral-medium": 32000,
    "mistral-small": 32000,
    "deepseek-chat": 128000,
    "deepseek-coder": 128000,
    "llama-3": 8192,
    "llama-3.1": 131072,
}

DEFAULT_CONTEXT_LENGTH = 128000


def _get_context_length(model_name: str) -> int:
    """Estimate context window size for a model name."""
    if not model_name:
        return DEFAULT_CONTEXT_LENGTH
    name_lower = model_name.lower()
    for key, length in MODEL_CONTEXT_LENGTHS.items():
        if key in name_lower:
            return length
    return DEFAULT_CONTEXT_LENGTH


@router.get("/status")
async def get_context_status():
    """Get context window usage and compression history.

    Reads the current model's context window size from config,
    estimates current usage (placeholder from logs),
    and reads compression events from log files.
    """
    # Read config for model info
    config_path = hermes_path("config.yaml")
    model_name = "unknown"
    context_length = DEFAULT_CONTEXT_LENGTH
    compression_enabled = False

    if config_path.exists():
        try:
            cfg = yaml.safe_load(config_path.read_text())
            model_cfg = cfg.get("model", {})
            model_name = model_cfg.get("default", "unknown")
            context_length = _get_context_length(model_name)

            comp_cfg = cfg.get("compression", {})
            compression_enabled = comp_cfg.get("enabled", False)
        except Exception as e:
            logger.warning("Failed to read config for context status: %s", e)

    # Estimate current usage from session files (placeholder heuristic)
    estimated_tokens = 0
    sessions_dir = hermes_path("sessions")
    if sessions_dir.exists():
        try:
            session_files = sorted(sessions_dir.glob("session_*.json"), key=lambda f: f.stat().st_mtime, reverse=True)
            if session_files:
                # Read most recent session for a rough estimate
                with open(session_files[0], "r") as f:
                    session_data = json.load(f)
                message_count = session_data.get("message_count", 0)
                # Rough estimate: ~150 tokens per message pair on average
                estimated_tokens = min(message_count * 75, context_length)
        except Exception as e:
            logger.debug("Could not estimate token usage: %s", e)

    # Read compression events from logs
    compression_events = []
    logs_dir = hermes_path("logs")
    log_files = []
    if logs_dir.exists():
        log_files = sorted(logs_dir.glob("*.log"), key=lambda f: f.stat().st_mtime, reverse=True)
    else:
        single_log = hermes_path("gateway.log")
        if single_log.exists():
            log_files = [single_log]

    compression_pattern = re.compile(
        r"(?P<date>\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}).*compress"
        r"(?:.*ratio[:\s]*(?P<ratio>[\d.]+))?"
        r"(?:.*messages?[:\s]*(?P<msg_count>\d+))?",
        re.IGNORECASE,
    )

    for log_file in log_files[:3]:
        try:
            text = log_file.read_text(errors="replace")
            for line in text.splitlines():
                m = compression_pattern.search(line)
                if m:
                    groups = m.groupdict()
                    compression_events.append({
                        "date": groups.get("date", ""),
                        "ratio": float(groups["ratio"]) if groups.get("ratio") else None,
                        "messages_affected": int(groups["msg_count"]) if groups.get("msg_count") else None,
                    })
        except Exception as e:
            logger.debug("Error reading log for compression events: %s", e)

    # Sort by date descending
    compression_events.sort(key=lambda x: x.get("date", ""), reverse=True)

    usage_percent = round((estimated_tokens / context_length) * 100, 1) if context_length > 0 else 0

    return {
        "model": model_name,
        "context_length": context_length,
        "estimated_tokens": estimated_tokens,
        "usage_percent": usage_percent,
        "compression_enabled": compression_enabled,
        "compression_events": compression_events[:20],
    }
