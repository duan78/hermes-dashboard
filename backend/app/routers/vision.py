import base64
import io
import logging
import os

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse

from ..config import HERMES_HOME

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/vision", tags=["vision"])


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


def _detect_vision_provider(config: dict) -> str:
    """Detect which vision provider is configured."""
    # Check MCP servers for zai-vision
    mcp_servers = config.get("mcp_servers", {})
    if isinstance(mcp_servers, dict):
        for name, val in mcp_servers.items():
            if "zai-vision" in name and val not in (None, "", "off", False):
                return "zai"

    # Check auxiliary vision provider
    aux_vision = config.get("auxiliary", {}).get("vision", {})
    provider = aux_vision.get("provider", "auto")
    if provider != "auto":
        return provider

    # Default: try zai first, then mistral
    if _get_env_value("Z_AI_API_KEY"):
        return "zai"
    if _get_env_value("MISTRAL_API_KEY"):
        return "mistral"

    return "none"


async def _analyze_with_mistral(image_bytes: bytes, filename: str) -> str:
    """Analyze image using Mistral Pixtral API."""
    import httpx

    api_key = _get_env_value("MISTRAL_API_KEY")
    if not api_key:
        raise HTTPException(400, "MISTRAL_API_KEY not configured")

    b64_image = base64.b64encode(image_bytes).decode("utf-8")

    # Determine mime type
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "png"
    mime_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif", "webp": "image/webp"}
    mime_type = mime_map.get(ext, "image/png")

    config = _load_yaml_config()
    model = config.get("auxiliary", {}).get("vision", {}).get("model", "pixtral-large-latest")

    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Please describe this image in detail. What do you see?"},
                    {
                        "type": "image_url",
                        "image_url": f"data:{mime_type};base64,{b64_image}",
                    },
                ],
            }
        ],
        "max_tokens": 1024,
    }

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.mistral.ai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
        )
        if resp.status_code != 200:
            error_text = resp.text[:500]
            logger.error("Mistral vision API error: %s", error_text)
            raise HTTPException(502, f"Mistral API error: {error_text}")
        data = resp.json()
        return data["choices"][0]["message"]["content"]


async def _analyze_with_zai(image_bytes: bytes, filename: str) -> str:
    """Analyze image using Z.AI API."""
    import httpx

    api_key = _get_env_value("Z_AI_API_KEY")
    if not api_key:
        raise HTTPException(400, "Z_AI_API_KEY not configured")

    b64_image = base64.b64encode(image_bytes).decode("utf-8")

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "png"
    mime_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif", "webp": "image/webp"}
    mime_type = mime_map.get(ext, "image/png")

    config = _load_yaml_config()
    base_url = config.get("providers", {}).get("zai", {}).get("api", "https://api.z.ai/api/coding/paas/v4")
    model = config.get("model", {}).get("default", "glm-5-turbo")

    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Please describe this image in detail. What do you see?"},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime_type};base64,{b64_image}"},
                    },
                ],
            }
        ],
        "max_tokens": 1024,
    }

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
        )
        if resp.status_code != 200:
            error_text = resp.text[:500]
            logger.error("Z.AI vision API error: %s", error_text)
            raise HTTPException(502, f"Z.AI API error: {error_text}")
        data = resp.json()
        return data["choices"][0]["message"]["content"]


@router.post("/test")
async def vision_test(file: UploadFile = File(...)):
    """Test vision analysis by sending an image to the configured vision provider."""
    # Validate file type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image (got: %s)" % (file.content_type or "unknown"))

    # Read image bytes (max 10MB)
    image_bytes = await file.read()
    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(400, "Image too large (max 10 MB)")

    config = _load_yaml_config()
    provider = _detect_vision_provider(config)

    if provider == "none":
        raise HTTPException(400, "No vision provider configured. Set Z_AI_API_KEY or MISTRAL_API_KEY, or configure a vision provider in Auxiliary Models.")

    filename = file.filename or "image.png"

    try:
        if provider == "mistral":
            result = await _analyze_with_mistral(image_bytes, filename)
        elif provider == "zai":
            result = await _analyze_with_zai(image_bytes, filename)
        else:
            # Generic fallback: try mistral API format
            result = await _analyze_with_mistral(image_bytes, filename)

        return {"status": "ok", "provider": provider, "result": result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Vision test error: %s", e)
        raise HTTPException(500, f"Vision analysis failed: {str(e)}")
