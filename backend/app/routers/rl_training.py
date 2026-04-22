"""RL Training monitoring endpoints."""
import logging
import os

from fastapi import APIRouter, HTTPException

from ..config import HERMES_HOME

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/rl-training", tags=["rl-training"])


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


@router.get("/status")
async def rl_training_status():
    """Get RL training configuration and status."""
    config = _load_yaml_config()
    tinker_key = _get_env_value("TINKER_API_KEY")
    wandb_key = _get_env_value("WANDB_API_KEY")
    rl_config = config.get("rl_training", {})

    return {
        "api_keys": {
            "tinker": {
                "configured": bool(tinker_key),
                "preview": tinker_key[:4] + "****" if tinker_key and len(tinker_key) > 8 else ("****" if tinker_key else ""),
            },
            "wandb": {
                "configured": bool(wandb_key),
                "preview": wandb_key[:4] + "****" if wandb_key and len(wandb_key) > 8 else ("****" if wandb_key else ""),
            },
        },
        "config": rl_config,
        "configured": bool(tinker_key) or bool(wandb_key),
        "fully_configured": bool(tinker_key) and bool(wandb_key),
        "training_runs": [],
        "message": "Configure Tinker and WandB API keys in Tools > RL Training to enable training runs.",
    }


@router.post("/check-results")
async def check_rl_results():
    """Check for RL training results."""
    tinker_key = _get_env_value("TINKER_API_KEY")

    if not tinker_key:
        return {
            "results": [],
            "message": "TINKER_API_KEY not configured. Set it in Tools > RL Training to check results.",
        }

    # Check for training results directory
    results_dir = HERMES_HOME / "rl_results"
    results = []
    if results_dir.exists():
        for f in sorted(results_dir.iterdir(), reverse=True):
            if f.is_file() and f.suffix in (".json", ".csv", ".yaml", ".yml"):
                results.append({
                    "name": f.name,
                    "size": f.stat().st_size,
                    "modified": f.stat().st_mtime,
                })

    return {
        "results": results[:20],
        "results_available": len(results) > 0,
        "message": f"Found {len(results)} result file(s)" if results else "No training results found. Start a training run first.",
    }
