"""RL Training monitoring endpoints."""
import os

from fastapi import APIRouter

from ..config import HERMES_HOME

router = APIRouter(prefix="/api/rl-training", tags=["rl-training"])


def _get_env_value(key: str) -> str:
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


@router.get("/status")
async def rl_training_status():
    """Get RL training configuration and status."""
    tinker_key = _get_env_value("TINKER_API_KEY")
    wandb_key = _get_env_value("WANDB_API_KEY")

    return {
        "api_keys": {
            "tinker": {"configured": bool(tinker_key), "key_set": bool(tinker_key)},
            "wandb": {"configured": bool(wandb_key), "key_set": bool(wandb_key)},
        },
        "training_runs": [],
        "message": "Configure Tinker and WandB API keys in Tools > RL Training to enable training runs.",
    }


@router.post("/check-results")
async def check_rl_results():
    """Check for RL training results."""
    return {
        "results": [],
        "message": "No training results found. Start a training run first.",
    }
