import asyncio
import io
import logging
import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from ..config import HERMES_HOME

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tts", tags=["tts"])


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


async def _generate_edge_tts(text: str, voice: str) -> bytes:
    """Generate TTS audio using edge-tts (free Microsoft Edge TTS)."""
    try:
        import edge_tts
    except ImportError:
        raise HTTPException(400, "edge-tts is not installed. Install with: pip install edge-tts")

    communicate = edge_tts.Communicate(text, voice)
    audio_buffer = io.BytesIO()

    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_buffer.write(chunk["data"])

    audio_bytes = audio_buffer.getvalue()
    if not audio_bytes:
        raise HTTPException(500, "edge-tts produced no audio output")
    return audio_bytes


async def _generate_openai_tts(text: str, config: dict) -> bytes:
    """Generate TTS audio using OpenAI TTS API."""
    import httpx

    api_key = _get_env_value("VOICE_TOOLS_OPENAI_KEY") or _get_env_value("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(400, "OPENAI_API_KEY not configured for TTS")

    base_url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")

    payload = {
        "model": "tts-1",
        "input": text,
        "voice": "alloy",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{base_url}/audio/speech",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
        )
        if resp.status_code != 200:
            raise HTTPException(502, f"OpenAI TTS error: {resp.text[:300]}")
        return resp.content


async def _generate_elevenlabs_tts(text: str, config: dict) -> bytes:
    """Generate TTS audio using ElevenLabs API."""
    import httpx

    api_key = _get_env_value("ELEVENLABS_API_KEY")
    if not api_key:
        raise HTTPException(400, "ELEVENLABS_API_KEY not configured")

    voice_id = config.get("tts", {}).get("elevenlabs", {}).get("voice_id", "21m00Tcm4TlvDq8ikWAM")

    payload = {
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
            headers={"xi-api-key": api_key, "Content-Type": "application/json"},
            json=payload,
        )
        if resp.status_code != 200:
            raise HTTPException(502, f"ElevenLabs TTS error: {resp.text[:300]}")
        return resp.content


@router.get("/test")
async def tts_test(
    text: str = Query("Hello, this is a test of the text-to-speech system."),
    provider: str = Query(None),
):
    """Test TTS by generating audio from text using the configured provider."""
    config = _load_yaml_config()
    tts_provider = provider or config.get("tts", {}).get("provider", "edge")

    voice = config.get("tts", {}).get("edge", {}).get("voice", "en-US-AriaNeural")

    audio_bytes = None
    content_type = "audio/mpeg"
    used_provider = tts_provider

    try:
        if tts_provider == "edge":
            audio_bytes = await _generate_edge_tts(text, voice)
            content_type = "audio/mpeg"
        elif tts_provider == "openai":
            audio_bytes = await _generate_openai_tts(text, config)
            content_type = "audio/mpeg"
        elif tts_provider == "elevenlabs":
            audio_bytes = await _generate_elevenlabs_tts(text, config)
            content_type = "audio/mpeg"
        else:
            # Unknown provider, fall back to edge
            audio_bytes = await _generate_edge_tts(text, voice)
            used_provider = "edge (fallback)"
            content_type = "audio/mpeg"
    except HTTPException:
        # If the configured provider fails, fall back to edge-tts
        if tts_provider != "edge":
            logger.warning("TTS provider %s failed, falling back to edge-tts", tts_provider)
            try:
                audio_bytes = await _generate_edge_tts(text, voice)
                used_provider = "edge (fallback)"
                content_type = "audio/mpeg"
            except Exception as e2:
                raise HTTPException(500, f"All TTS providers failed: {str(e2)}")
        else:
            raise

    if not audio_bytes:
        raise HTTPException(500, "No audio generated")

    return Response(
        content=audio_bytes,
        media_type=content_type,
        headers={
            "X-TTS-Provider": used_provider,
            "Content-Disposition": "inline; filename=tts_test.mp3",
        },
    )
