import json

from fastapi import APIRouter, HTTPException

from ..schemas.requests import ModelSwitchRequest
from ..utils import hermes_path, run_hermes

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
