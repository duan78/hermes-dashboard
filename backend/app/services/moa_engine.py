"""
Standalone MOA (Mixture-of-Agents) engine for the Hermes dashboard.

Runs independently from the hermes-agent mixture_of_agents_tool.py — uses httpx
directly to call OpenAI-compatible chat/completions endpoints.

Provider fallback order: Ollama Cloud → DeepSeek → Mistral
"""

import asyncio
import logging
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

# Control chars that are illegal in JSON strings (RFC 7159 §7).
# Matches U+0000–U+001F except TAB (0x09), LF (0x0A), CR (0x0D).
_CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def _sanitize_control_chars(text: str) -> str:
    """Remove control chars that would break JSON serialization."""
    return _CONTROL_CHAR_RE.sub("", text)

# Provider registry — tried in order for fallback
BUILTIN_PROVIDERS = {
    "ollama_cloud": {
        "base_url": "https://ollama.com/v1",
        "api_key_env": "OLLAMA_API_KEY",
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com/v1",
        "api_key_env": "DEEPSEEK_API_KEY",
    },
    "mistral": {
        "base_url": "https://api.mistral.ai/v1",
        "api_key_env": "MISTRAL_API_KEY",
    },
}

AGGREGATOR_SYSTEM_PROMPT = (
    "You have been provided with a set of responses from various open-source models "
    "to the latest user query. Your task is to synthesize these responses into a single, "
    "high-quality response. It is crucial to critically evaluate the information provided "
    "in these responses, recognizing that some of it may be biased or incorrect. Your "
    "response should not simply replicate the given answers but should offer a refined, "
    "accurate, and comprehensive reply to the instruction. Ensure your response is "
    "well-structured, coherent, and adheres to the highest standards of accuracy and reliability.\n\n"
    "Responses from models:"
)

_TIMEOUT_PER_CALL = 90       # seconds per individual API call (base)
_TIMEOUT_PER_CALL_LONG = 300  # extended timeout for large outputs (writing tasks)
_LONG_TASK_PROMPT_THRESHOLD = 2000  # chars in prompt that triggers extended timeout
_MAX_RETRIES = 2

def _get_timeout_for_prompt(prompt: str) -> int:
    """Return appropriate timeout based on prompt size.

    Large prompts (writing tasks, long-form content) need significantly more
    time for the LLM to generate responses.  Scale linearly above the threshold.
    """
    prompt_len = len(prompt) if prompt else 0
    if prompt_len > _LONG_TASK_PROMPT_THRESHOLD:
        extra_chars = prompt_len - _LONG_TASK_PROMPT_THRESHOLD
        extra_time = min(int(extra_chars / 10), _TIMEOUT_PER_CALL_LONG - _TIMEOUT_PER_CALL)
        return _TIMEOUT_PER_CALL + extra_time
    return _TIMEOUT_PER_CALL

# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_env(key: str) -> str:
    """Resolve env var from os.environ or ~/.hermes/.env."""
    val = os.environ.get(key, "")
    if val:
        return val
    env_path = Path.home() / ".hermes" / ".env"
    if env_path.exists():
        for line in env_path.read_text(errors="replace").splitlines():
            line = line.strip()
            if line.startswith(f"{key}="):
                return line[len(key) + 1 :].strip().strip("\"'")
    return ""


def _resolve_provider_config(
    provider_id: str, providers: dict
) -> Optional[Tuple[str, str]]:
    """Return (api_key, base_url) for a provider, or None."""
    # Check user-configured providers first
    pcfg = providers.get(provider_id)
    if pcfg and pcfg.get("base_url"):
        env_key = pcfg.get("api_key_env", "")
        api_key = _get_env(env_key) if env_key else ""
        if api_key:
            return api_key, pcfg["base_url"].rstrip("/")

    # Fall back to built-in providers
    builtin = BUILTIN_PROVIDERS.get(provider_id)
    if builtin:
        api_key = _get_env(builtin["api_key_env"])
        if api_key:
            return api_key, builtin["base_url"].rstrip("/")
    return None


async def _chat_completion(
    client: httpx.AsyncClient,
    api_key: str,
    base_url: str,
    model: str,
    messages: list,
    temperature: float = 0.6,
    max_tokens: int = 8192,
) -> Tuple[str, bool]:
    """Single chat completion call. Returns (content, success)."""
    url = f"{base_url}/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    try:
        resp = await client.post(url, json=payload, headers=headers)
        if resp.status_code != 200:
            logger.warning(
                "MOA call %s/%s → HTTP %s: %s",
                base_url, model, resp.status_code, resp.text[:200],
            )
            return f"HTTP {resp.status_code}: {resp.text[:100]}", False
        data = resp.json()
        content = ""
        choices = data.get("choices") or []
        if choices:
            msg = choices[0].get("message", {})
            content = msg.get("content", "")
        if not content:
            return "Empty response from model", False
        return _sanitize_control_chars(content), True
    except Exception as e:
        logger.warning("MOA call %s/%s error: %s", base_url, model, e)
        return str(e), False


async def _run_proposer_with_fallback(
    client: httpx.AsyncClient,
    model: str,
    provider_id: str,
    providers: dict,
    messages: list,
    temperature: float,
) -> Tuple[str, str, bool, str]:
    """Run a single proposer, falling back through providers on failure.

    Returns (model, content, success, provider_used).
    """
    # Try the assigned provider first
    resolved = _resolve_provider_config(provider_id, providers)
    providers_to_try = []
    if resolved:
        providers_to_try.append((provider_id, resolved[0], resolved[1]))

    # Add fallback providers (all built-in except the one already tried)
    for pid, bprov in BUILTIN_PROVIDERS.items():
        if pid == provider_id:
            continue
        key = _get_env(bprov["api_key_env"])
        if key:
            providers_to_try.append((pid, key, bprov["base_url"]))

    for pid, api_key, base_url in providers_to_try:
        for attempt in range(_MAX_RETRIES):
            content, success = await _chat_completion(
                client, api_key, base_url, model, messages, temperature,
            )
            if success:
                return model, content, True, pid
            logger.warning(
                "Proposer %s via %s attempt %s failed: %s",
                model, pid, attempt + 1, content[:80],
            )
            if attempt < _MAX_RETRIES - 1:
                await asyncio.sleep(1)
        logger.warning("Proposer %s via %s exhausted retries", model, pid)

    return model, f"Failed on all providers", False, ""


# ── Main engine ──────────────────────────────────────────────────────────────

async def run_moa(
    prompt: str,
    config: dict,
    providers: dict,
) -> dict:
    """Execute a Mixture-of-Agents run.

    Args:
        prompt: The user query.
        config: MOA config section (reference_models, aggregator_model, etc.).
        providers: moa_providers dict from config.yaml.

    Returns:
        dict with keys: success, response, models_used, timing, failed_models, proposer_results.
    """
    t0 = time.monotonic()

    ref_models_raw = config.get("reference_models", [])
    aggregator_model = config.get("aggregator_model", "mistral-large-3:675b")
    aggregator_provider = config.get("aggregator_provider", "ollama_cloud")
    ref_temp = float(config.get("reference_temperature", 0.6))
    agg_temp = float(config.get("aggregator_temperature", 0.3))
    min_refs = int(config.get("min_successful_references", 1))

    # Normalize reference_models to list of {model, provider}
    ref_entries: List[Dict[str, str]] = []
    for entry in ref_models_raw:
        if isinstance(entry, str):
            ref_entries.append({"model": entry, "provider": aggregator_provider})
        elif isinstance(entry, dict) and entry.get("model"):
            ref_entries.append({
                "model": entry["model"],
                "provider": entry.get("provider", aggregator_provider),
            })

    if not ref_entries:
        return {
            "success": False,
            "response": "No reference models configured",
            "models_used": {"reference_models": [], "aggregator_model": aggregator_model},
            "timing": time.monotonic() - t0,
            "failed_models": [],
            "proposer_results": [],
        }

    logger.info("MOA run: %d proposers, aggregator=%s", len(ref_entries), aggregator_model)

    # Phase 1: Run proposers in parallel
    proposer_messages = [{"role": "user", "content": prompt}]
    proposer_results = []

    proposer_timeout = _get_timeout_for_prompt(prompt)
    logger.info("MOA proposer timeout: %ds (prompt: %d chars)", proposer_timeout, len(prompt))
    async with httpx.AsyncClient(timeout=proposer_timeout) as client:
        tasks = [
            _run_proposer_with_fallback(
                client, e["model"], e["provider"], providers,
                proposer_messages, ref_temp,
            )
            for e in ref_entries
        ]
        results = await asyncio.gather(*tasks)

    successful = []
    failed_models = []
    for model, content, success, provider_used in results:
        proposer_results.append({
            "model": model,
            "success": success,
            "provider": provider_used,
            "content_length": len(content) if success else 0,
            "error": content if not success else None,
        })
        if success:
            successful.append({"model": model, "content": content, "provider": provider_used})
        else:
            failed_models.append(model)

    if len(successful) < min_refs:
        elapsed = time.monotonic() - t0
        return {
            "success": False,
            "response": (
                f"Insufficient successful proposers ({len(successful)}/{len(ref_entries)}). "
                f"Need at least {min_refs}. Failed: {', '.join(failed_models) or 'none'}"
            ),
            "models_used": {
                "reference_models": [e["model"] for e in ref_entries],
                "aggregator_model": aggregator_model,
            },
            "timing": elapsed,
            "failed_models": failed_models,
            "proposer_results": proposer_results,
        }

    logger.info(
        "MOA proposers done: %d/%d succeeded in %.1fs",
        len(successful), len(ref_entries), time.monotonic() - t0,
    )

    # Phase 2: Aggregator
    responses_text = "\n".join(
        f"{i + 1}. [{s['model']} via {s['provider']}]:\n{s['content']}"
        for i, s in enumerate(successful)
    )
    agg_system = f"{AGGREGATOR_SYSTEM_PROMPT}\n\n{responses_text}"
    agg_messages = [
        {"role": "system", "content": agg_system},
        {"role": "user", "content": prompt},
    ]

    agg_content = ""
    agg_success = False
    agg_provider_used = ""

    agg_timeout = _get_timeout_for_prompt(prompt)
    async with httpx.AsyncClient(timeout=agg_timeout) as client:
        # Try assigned aggregator provider, then fallback chain
        resolved = _resolve_provider_config(aggregator_provider, providers)
        agg_providers_to_try = []
        if resolved:
            agg_providers_to_try.append((aggregator_provider, resolved[0], resolved[1]))
        for pid, bprov in BUILTIN_PROVIDERS.items():
            if pid == aggregator_provider:
                continue
            key = _get_env(bprov["api_key_env"])
            if key:
                agg_providers_to_try.append((pid, key, bprov["base_url"]))

        for pid, api_key, base_url in agg_providers_to_try:
            content, success = await _chat_completion(
                client, api_key, base_url, aggregator_model,
                agg_messages, agg_temp,
            )
            if success:
                agg_content = content
                agg_success = True
                agg_provider_used = pid
                break
            logger.warning("Aggregator via %s failed: %s", pid, content[:80])

    elapsed = time.monotonic() - t0

    if not agg_success:
        return {
            "success": False,
            "response": f"Aggregator failed on all providers. Proposers returned {len(successful)} responses.",
            "models_used": {
                "reference_models": [e["model"] for e in ref_entries],
                "aggregator_model": aggregator_model,
            },
            "timing": elapsed,
            "failed_models": failed_models + [aggregator_model],
            "proposer_results": proposer_results,
        }

    logger.info("MOA complete in %.1fs — aggregator via %s", elapsed, agg_provider_used)

    return {
        "success": True,
        "response": agg_content,
        "models_used": {
            "reference_models": [s["model"] for s in successful],
            "aggregator_model": aggregator_model,
            "aggregator_provider": agg_provider_used,
        },
        "timing": round(elapsed, 2),
        "failed_models": failed_models,
        "proposer_results": proposer_results,
    }
