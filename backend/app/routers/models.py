import json
import logging

from fastapi import APIRouter, HTTPException

from ..schemas.requests import ModelSwitchRequest
from ..utils import hermes_path, run_hermes

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("")
async def get_current_model():
    """Get current model info."""
    import yaml
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        return {"model": "unknown", "provider": "unknown"}
    cfg = yaml.safe_load(config_path.read_text())
    model_cfg = cfg.get("model", {})
    return {
        "model": model_cfg.get("default", "unknown"),
        "provider": model_cfg.get("provider", "unknown"),
        "base_url": model_cfg.get("base_url", ""),
        "max_turns": model_cfg.get("max_turns", 60),
    }


@router.get("/available")
async def list_available_models():
    """List available models from cache."""
    cache_path = hermes_path("models_dev_cache.json")
    if not cache_path.exists():
        return {"models": []}
    try:
        data = json.loads(cache_path.read_text())
        # The cache can be large, return model names only
        if isinstance(data, dict):
            models = list(data.keys())[:100]
        elif isinstance(data, list):
            models = [m.get("id", str(m)) for m in data[:100]]
        else:
            models = []
        return {"models": models}
    except (json.JSONDecodeError, Exception):
        return {"models": []}


def _build_catalog_from_cache(data: dict) -> list:
    """Parse models_dev_cache.json into a flat catalog list."""
    catalog = []
    for provider_id, provider_data in data.items():
        if not isinstance(provider_data, dict):
            continue
        provider_name = provider_data.get("name", provider_id)
        models = provider_data.get("models", {})
        if not isinstance(models, dict):
            continue
        for model_id, model_info in models.items():
            if not isinstance(model_info, dict):
                continue
            # Extract cost info (per 1M tokens)
            cost = model_info.get("cost", {})
            if isinstance(cost, dict):
                input_cost = cost.get("input")
                output_cost = cost.get("output")
            else:
                input_cost = None
                output_cost = None

            # Extract context length
            limit = model_info.get("limit", {})
            if isinstance(limit, dict):
                context_length = limit.get("context")
            else:
                context_length = None

            # Build capabilities list
            capabilities = []
            if model_info.get("tool_call"):
                capabilities.append("tool_call")
            if model_info.get("reasoning"):
                capabilities.append("reasoning")
            if model_info.get("attachment"):
                capabilities.append("vision")
            if model_info.get("temperature"):
                capabilities.append("streaming")
            modalities = model_info.get("modalities", {})
            if isinstance(modalities, dict):
                if "image" in modalities.get("input", []):
                    if "vision" not in capabilities:
                        capabilities.append("vision")
                if "image" in modalities.get("output", []):
                    capabilities.append("image_output")
                if "audio" in modalities.get("input", []):
                    capabilities.append("audio_input")
                if "audio" in modalities.get("output", []):
                    capabilities.append("audio_output")

            catalog.append({
                "name": model_info.get("name", model_id),
                "id": model_id,
                "provider": provider_name,
                "provider_id": provider_id,
                "context_length": context_length,
                "input_cost_per_1m": input_cost,
                "output_cost_per_1m": output_cost,
                "capabilities": capabilities,
                "family": model_info.get("family", ""),
            })
    return catalog


# Hardcoded fallback list of well-known models
_HARDCODED_CATALOG = [
    {"name": "GPT-5.4", "id": "gpt-5.4", "provider": "OpenAI", "provider_id": "openai", "context_length": 1050000, "input_cost_per_1m": 12.0, "output_cost_per_1m": 48.0, "capabilities": ["tool_call", "reasoning", "streaming", "vision"], "family": "gpt"},
    {"name": "GPT-5.4 Mini", "id": "gpt-5.4-mini", "provider": "OpenAI", "provider_id": "openai", "context_length": 400000, "input_cost_per_1m": 2.0, "output_cost_per_1m": 8.0, "capabilities": ["tool_call", "reasoning", "streaming", "vision"], "family": "gpt"},
    {"name": "GPT-5", "id": "gpt-5", "provider": "OpenAI", "provider_id": "openai", "context_length": 400000, "input_cost_per_1m": 10.0, "output_cost_per_1m": 30.0, "capabilities": ["tool_call", "reasoning", "streaming", "vision"], "family": "gpt"},
    {"name": "GPT-4.1", "id": "gpt-4.1", "provider": "OpenAI", "provider_id": "openai", "context_length": 1047576, "input_cost_per_1m": 2.0, "output_cost_per_1m": 8.0, "capabilities": ["tool_call", "streaming", "vision"], "family": "gpt"},
    {"name": "Claude Opus 4.7", "id": "claude-opus-4.7", "provider": "Anthropic", "provider_id": "anthropic", "context_length": 1000000, "input_cost_per_1m": 15.0, "output_cost_per_1m": 75.0, "capabilities": ["tool_call", "reasoning", "streaming", "vision"], "family": "claude"},
    {"name": "Claude Sonnet 4.6", "id": "claude-sonnet-4.6", "provider": "Anthropic", "provider_id": "anthropic", "context_length": 1000000, "input_cost_per_1m": 3.0, "output_cost_per_1m": 15.0, "capabilities": ["tool_call", "reasoning", "streaming", "vision"], "family": "claude"},
    {"name": "Gemini 2.5 Pro", "id": "gemini-2.5-pro", "provider": "Google", "provider_id": "google", "context_length": 1048576, "input_cost_per_1m": 1.25, "output_cost_per_1m": 10.0, "capabilities": ["tool_call", "reasoning", "streaming", "vision"], "family": "gemini"},
    {"name": "Gemini 2.5 Flash", "id": "gemini-2.5-flash", "provider": "Google", "provider_id": "google", "context_length": 1048576, "input_cost_per_1m": 0.15, "output_cost_per_1m": 0.60, "capabilities": ["tool_call", "reasoning", "streaming", "vision"], "family": "gemini"},
    {"name": "DeepSeek R1", "id": "deepseek-r1", "provider": "DeepSeek", "provider_id": "deepseek", "context_length": 128000, "input_cost_per_1m": 0.55, "output_cost_per_1m": 2.19, "capabilities": ["tool_call", "reasoning", "streaming"], "family": "deepseek"},
    {"name": "DeepSeek V3", "id": "deepseek-chat", "provider": "DeepSeek", "provider_id": "deepseek", "context_length": 128000, "input_cost_per_1m": 0.14, "output_cost_per_1m": 0.28, "capabilities": ["tool_call", "streaming"], "family": "deepseek"},
    {"name": "Llama 4 Maverick", "id": "llama-4-maverick", "provider": "Meta", "provider_id": "meta", "context_length": 1048576, "input_cost_per_1m": 0.20, "output_cost_per_1m": 0.80, "capabilities": ["tool_call", "streaming", "vision"], "family": "llama"},
    {"name": "Qwen3 235B", "id": "qwen3-235b-a22b", "provider": "Alibaba", "provider_id": "alibaba", "context_length": 131072, "input_cost_per_1m": 0.70, "output_cost_per_1m": 2.80, "capabilities": ["tool_call", "reasoning", "streaming"], "family": "qwen"},
    {"name": "GLM-5", "id": "glm-5", "provider": "Z.AI", "provider_id": "zai", "context_length": 202752, "input_cost_per_1m": 0.50, "output_cost_per_1m": 2.0, "capabilities": ["tool_call", "streaming"], "family": "glm"},
    {"name": "Grok 4", "id": "grok-4", "provider": "xAI", "provider_id": "xai", "context_length": 256000, "input_cost_per_1m": 3.0, "output_cost_per_1m": 15.0, "capabilities": ["tool_call", "reasoning", "streaming"], "family": "grok"},
]


@router.get("/catalog")
async def get_model_catalog():
    """Get comprehensive model catalog with metadata.

    Tries to parse models_dev_cache.json first, then falls back to a hardcoded list.
    """
    cache_path = hermes_path("models_dev_cache.json")
    if cache_path.exists():
        try:
            data = json.loads(cache_path.read_text())
            if isinstance(data, dict):
                catalog = _build_catalog_from_cache(data)
                if catalog:
                    return {"models": catalog, "source": "cache", "count": len(catalog)}
        except Exception as e:
            logger.warning(f"Failed to parse models_dev_cache.json: {e}")

    # Fallback to hardcoded list
    return {"models": _HARDCODED_CATALOG, "source": "hardcoded", "count": len(_HARDCODED_CATALOG)}


@router.post("/refresh-cache")
async def refresh_model_cache():
    """Refresh the models.dev cache by running hermes models refresh."""
    try:
        output = await run_hermes("models", "refresh", timeout=120)
        return {"status": "ok", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))


@router.post("/switch")
async def switch_model(body: ModelSwitchRequest):
    """Switch model."""
    try:
        args = ["model", "--set", body.model]
        if body.provider:
            args += ["--provider", body.provider]
        output = await run_hermes(*args, timeout=30)
        return {"status": "switched", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))
