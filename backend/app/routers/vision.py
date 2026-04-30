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


def _get_mime_type(filename: str) -> str:
    """Get MIME type from filename extension."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "png"
    mime_map = {
        "jpg": "image/jpeg", "jpeg": "image/jpeg",
        "png": "image/png", "gif": "image/gif", "webp": "image/webp",
    }
    return mime_map.get(ext, "image/png")


def _detect_vision_provider(config: dict) -> str:
    """Detect which vision provider is configured.
    
    Priority: ollama-cloud > zai-mcp > mistral > none
    """
    # Check auxiliary vision provider (explicit config)
    aux_vision = config.get("auxiliary", {}).get("vision", {})
    provider = aux_vision.get("provider", "")
    
    if provider == "ollama-cloud" and _get_env_value("OLLAMA_API_KEY"):
        return "ollama-cloud"
    if provider == "mistral" and _get_env_value("MISTRAL_API_KEY"):
        return "mistral"
    
    # Check MCP servers for zai-mcp-server (has analyze_image tool)
    mcp_servers = config.get("mcp_servers", {})
    if isinstance(mcp_servers, dict):
        for name, val in mcp_servers.items():
            if "zai" in name and val not in (None, "", "off", False):
                return "zai-mcp"
    
    # Auto-detect by available API keys
    if _get_env_value("OLLAMA_API_KEY"):
        return "ollama-cloud"
    if _get_env_value("ZAI_API_KEY") or _get_env_value("Z_AI_API_KEY"):
        return "zai-mcp"
    if _get_env_value("MISTRAL_API_KEY"):
        return "mistral"

    return "none"


def _get_provider_chain(config: dict) -> list:
    """Return ordered list of fallback providers.
    
    Active provider first, then fallbacks.
    """
    primary = _detect_vision_provider(config)
    chain = [primary]
    
    # Add fallbacks in priority order
    for fb in ["ollama-cloud", "zai-mcp", "mistral"]:
        if fb not in chain:
            if fb == "ollama-cloud" and _get_env_value("OLLAMA_API_KEY"):
                chain.append(fb)
            elif fb == "zai-mcp" and (_get_env_value("ZAI_API_KEY") or _get_env_value("Z_AI_API_KEY")):
                chain.append(fb)
            elif fb == "mistral" and _get_env_value("MISTRAL_API_KEY"):
                chain.append(fb)
    
    return [p for p in chain if p != "none"]


async def _analyze_with_ollama_cloud(image_bytes: bytes, filename: str, prompt: str = "") -> str:
    """Analyze image using Ollama Cloud (Gemma 4 31B)."""
    import httpx

    api_key = _get_env_value("OLLAMA_API_KEY")
    if not api_key:
        raise HTTPException(400, "OLLAMA_API_KEY not configured")

    b64_image = base64.b64encode(image_bytes).decode("utf-8")
    mime_type = _get_mime_type(filename)

    config = _load_yaml_config()
    model = config.get("auxiliary", {}).get("vision", {}).get("model", "gemma4:31b")

    user_prompt = prompt or "Please describe this image in detail. What do you see?"

    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_prompt},
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
            "https://ollama.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
        )
        if resp.status_code != 200:
            error_text = resp.text[:500]
            logger.error("Ollama Cloud vision API error: %s", error_text)
            raise HTTPException(502, f"Ollama Cloud API error: {error_text}")
        data = resp.json()
        return data["choices"][0]["message"]["content"]


async def _analyze_with_mistral(image_bytes: bytes, filename: str, prompt: str = "") -> str:
    """Analyze image using Mistral Pixtral API."""
    import httpx

    api_key = _get_env_value("MISTRAL_API_KEY")
    if not api_key:
        raise HTTPException(400, "MISTRAL_API_KEY not configured")

    b64_image = base64.b64encode(image_bytes).decode("utf-8")
    mime_type = _get_mime_type(filename)

    config = _load_yaml_config()
    model = config.get("auxiliary", {}).get("vision", {}).get("model", "pixtral-large-latest")

    user_prompt = prompt or "Please describe this image in detail. What do you see?"

    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_prompt},
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


async def _analyze_with_zai_mcp(image_bytes: bytes, filename: str, prompt: str = "") -> str:
    """Analyze image using Z.AI MCP server (analyze_image tool)."""
    import httpx
    import json as json_mod

    # Read Z.AI API key from config.yaml (providers.zai.api_key)
    config = _load_yaml_config()
    api_key = ""
    
    # Try providers.zai first
    zai_cfg = config.get("providers", {}).get("zai", {})
    if isinstance(zai_cfg, dict):
        api_key = zai_cfg.get("api_key", "")
    
    # Fallback to env var
    if not api_key:
        api_key = _get_env_value("ZAI_API_KEY") or _get_env_value("Z_AI_API_KEY")
    
    if not api_key:
        raise HTTPException(400, "Z.AI API key not configured")

    b64_image = base64.b64encode(image_bytes).decode("utf-8")
    mime_type = _get_mime_type(filename)

    # Save image to temp file for MCP tool
    tmp_path = HERMES_HOME / f"tmp_vision_{filename}"
    tmp_path.write_bytes(image_bytes)

    user_prompt = prompt or "Please describe this image in detail. What do you see?"

    # Call Z.AI vision API
    base_url = config.get("providers", {}).get("zai", {}).get("api", "https://api.z.ai/api/coding/paas/v4")
    model = config.get("model", {}).get("default", "glm-5-turbo")

    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_prompt},
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
        content = data["choices"][0]["message"].get("content", "")
        if not content:
            content = data["choices"][0]["message"].get("reasoning_content", "")
        return content or "No response from Z.AI vision"


@router.get("/status")
async def vision_status():
    """Get current vision provider configuration and available providers."""
    import time
    
    config = _load_yaml_config()
    primary = _detect_vision_provider(config)
    chain = _get_provider_chain(config)
    aux_vision = config.get("auxiliary", {}).get("vision", {})
    
    return {
        "primary_provider": primary,
        "fallback_chain": chain,
        "config": {
            "provider": aux_vision.get("provider", "auto"),
            "model": aux_vision.get("model", ""),
            "base_url": aux_vision.get("base_url", ""),
            "timeout": aux_vision.get("timeout", 30),
        },
        "available": {
            "ollama-cloud": bool(_get_env_value("OLLAMA_API_KEY")),
            "zai-mcp": bool(_get_env_value("ZAI_API_KEY") or _get_env_value("Z_AI_API_KEY")),
            "mistral": bool(_get_env_value("MISTRAL_API_KEY")),
        },
    }


@router.post("/test")
async def vision_test(file: UploadFile = File(...)):
    """Test vision analysis by sending an image to the configured vision provider.
    
    Tries primary provider first, falls back to next available on failure.
    """
    # Validate file type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image (got: %s)" % (file.content_type or "unknown"))

    # Read image bytes (max 10MB)
    image_bytes = await file.read()
    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(400, "Image too large (max 10 MB)")

    config = _load_yaml_config()
    chain = _get_provider_chain(config)

    if not chain:
        raise HTTPException(400, "No vision provider configured. Set OLLAMA_API_KEY, ZAI_API_KEY, or MISTRAL_API_KEY.")

    filename = file.filename or "image.png"
    results = []
    last_error = None

    for provider in chain:
        try:
            import time
            start = time.time()
            
            if provider == "ollama-cloud":
                result = await _analyze_with_ollama_cloud(image_bytes, filename)
            elif provider == "zai-mcp":
                result = await _analyze_with_zai_mcp(image_bytes, filename)
            elif provider == "mistral":
                result = await _analyze_with_mistral(image_bytes, filename)
            else:
                continue

            elapsed = round(time.time() - start, 1)
            
            return {
                "status": "ok",
                "provider": provider,
                "elapsed_seconds": elapsed,
                "result": result,
                "fallback_used": provider != chain[0],
            }
        except HTTPException as e:
            last_error = str(e.detail)
            results.append({"provider": provider, "error": last_error})
            logger.warning("Vision provider %s failed: %s", provider, last_error)
            continue
        except Exception as e:
            last_error = str(e)
            results.append({"provider": provider, "error": last_error})
            logger.warning("Vision provider %s error: %s", provider, last_error)
            continue

    raise HTTPException(502, f"All vision providers failed: {results}")


@router.put("/config")
async def vision_update_config(body: dict):
    """Update vision provider configuration in config.yaml."""
    import yaml

    provider = body.get("provider", "")
    model = body.get("model", "")
    
    if provider not in ("ollama-cloud", "zai-mcp", "mistral", "auto"):
        raise HTTPException(400, f"Invalid provider: {provider}. Must be: ollama-cloud, zai-mcp, mistral, auto")

    # Default models per provider
    default_models = {
        "ollama-cloud": "gemma4:31b",
        "mistral": "pixtral-large-latest",
        "zai-mcp": "glm-5-turbo",
    }

    resolved_model = model or default_models.get(provider, "auto")
    resolved_base_url = ""
    resolved_api_key_env = ""
    
    if provider == "ollama-cloud":
        resolved_base_url = "https://ollama.com/v1"
        resolved_api_key_env = "OLLAMA_API_KEY"
    elif provider == "mistral":
        resolved_base_url = "https://api.mistral.ai/v1"
        resolved_api_key_env = "MISTRAL_API_KEY"
    elif provider == "zai-mcp":
        # Z.AI MCP doesn't need auxiliary config, but store for reference
        resolved_base_url = "https://api.z.ai/api/coding/paas/v4"
        resolved_api_key_env = "ZAI_API_KEY"

    # Update config.yaml
    cfg_path = HERMES_HOME / "config.yaml"
    config = _load_yaml_config()
    
    if "auxiliary" not in config:
        config["auxiliary"] = {}
    
    config["auxiliary"]["vision"] = {
        "provider": provider,
        "model": resolved_model,
        "base_url": resolved_base_url,
        "api_key": resolved_api_key_env,
        "timeout": 30,
        "download_timeout": 30,
    }

    try:
        cfg_path.write_text(yaml.dump(config, default_flow_style=False, allow_unicode=True, sort_keys=False))
        return {"status": "ok", "provider": provider, "model": resolved_model}
    except Exception as e:
        raise HTTPException(500, f"Failed to write config: {e}")
