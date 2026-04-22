"""TTS test endpoint for voice preview."""
import asyncio
import tempfile
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse, Response

from ..config import HERMES_HOME

router = APIRouter(prefix="/api/tts", tags=["tts"])


def _load_yaml_config() -> dict:
    import yaml
    cfg_path = HERMES_HOME / "config.yaml"
    if cfg_path.exists():
        try:
            return yaml.safe_load(cfg_path.read_text()) or {}
        except Exception:
            pass
    return {}


@router.get("/test")
async def tts_test(text: str = "Hello, this is a test of the text to speech system.", provider: str = ""):
    """Generate a TTS audio sample."""
    config = _load_yaml_config()
    voice = config.get("tts", {}).get("edge", {}).get("voice", "en-US-AriaNeural")

    try:
        tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
        tmp_path = tmp.name
        tmp.close()

        proc = await asyncio.create_subprocess_exec(
            "edge-tts", "--voice", voice, "--text", text, "--write-media", tmp_path,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        await asyncio.wait_for(proc.communicate(), timeout=30)

        if proc.returncode == 0 and Path(tmp_path).exists():
            return FileResponse(tmp_path, media_type="audio/mpeg", filename="tts_test.mp3")
    except Exception:
        pass

    return Response(content=b"", media_type="audio/mpeg")
