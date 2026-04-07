import json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from ..config import HERMES_HOME
from ..utils import hermes_path

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])

# Gateway URL: env var > config.yaml > default
GATEWAY_URL = os.getenv("HERMES_GATEWAY_URL", "")

# ── Simple TTL cache for config reads ──
_config_cache: dict = {"data": None, "timestamp": 0}
_CONFIG_CACHE_TTL = 30  # seconds


def _load_raw_config() -> dict | None:
    """Load config.yaml from disk (used by TTL cache)."""
    import yaml
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        return None
    try:
        return yaml.safe_load(config_path.read_text())
    except Exception:
        return None


def _get_cached_config() -> dict | None:
    """Return cached config, refreshing if TTL expired."""
    now = time.monotonic()
    if _config_cache["data"] is None or (now - _config_cache["timestamp"]) > _CONFIG_CACHE_TTL:
        _config_cache["data"] = _load_raw_config()
        _config_cache["timestamp"] = now
    return _config_cache["data"]


def _get_gateway_url() -> str:
    """Resolve the Hermes gateway base URL (TTL-cached)."""
    if GATEWAY_URL:
        return GATEWAY_URL.rstrip("/")
    cfg = _get_cached_config()
    if cfg:
        gw = cfg.get("gateway", {})
        url = gw.get("url") or gw.get("api_url") or ""
        if url:
            return url.rstrip("/")
    return "http://localhost:8000"


def _get_api_key() -> str:
    """Read API key from config for direct LLM calls (TTL-cached)."""
    cfg = _get_cached_config()
    if cfg:
        model_cfg = cfg.get("model", {})
        return model_cfg.get("api_key", "")
    return ""


def _get_model() -> str:
    """Read model name from config (TTL-cached)."""
    cfg = _get_cached_config()
    if cfg:
        return cfg.get("model", {}).get("default", "gpt-4o")
    return "gpt-4o"


def _save_message_to_session(session_id: str, role: str, content: str):
    """Append a message to a session's JSONL file."""
    sessions_dir = hermes_path("sessions")
    sessions_dir.mkdir(parents=True, exist_ok=True)

    jsonl_path = sessions_dir / f"{session_id}.jsonl"
    msg = {
        "role": role,
        "content": content,
        "timestamp": __import__("time").time(),
    }
    with open(jsonl_path, "a") as f:
        f.write(json.dumps(msg) + "\n")

    # Update or create session metadata
    meta_path = sessions_dir / f"session_{session_id}.json"
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text())
        except Exception:
            meta = {}
    else:
        meta = {
            "session_id": session_id,
            "model": _get_model(),
            "platform": "dashboard",
            "created_at": __import__("datetime").datetime.now().isoformat(),
        }

    meta["message_count"] = meta.get("message_count", 0) + 1
    if role == "user":
        meta["preview"] = content[:100]
    meta_path.write_text(json.dumps(meta, indent=2))


@router.post("/send")
async def chat_send(request: Request):
    """Send a message and receive the complete response (non-streaming)."""
    logger.debug("Chat send request received")
    body = await request.json()
    message = body.get("message", "")
    session_id = body.get("session_id") or str(uuid.uuid4())[:8]
    history = body.get("history", [])

    if not message.strip():
        return {"error": "Message is required"}

    api_messages = []
    for msg in history:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role in ("user", "assistant", "system") and content:
            api_messages.append({"role": role, "content": content})
    api_messages.append({"role": "user", "content": message})

    _save_message_to_session(session_id, "user", message)

    model = _get_model()
    gateway_url = _get_gateway_url()
    full_response = ""

    try:
        chat_url = f"{gateway_url}/v1/chat/completions"
        payload = {"model": model, "messages": api_messages}
        async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=10.0)) as client:
            resp = await client.post(chat_url, json=payload, headers={"Content-Type": "application/json"})
            if resp.status_code != 200:
                return {"error": f"Gateway error {resp.status_code}: {resp.text[:300]}"}
            data = resp.json()
            full_response = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    except httpx.ConnectError:
        # Fallback to direct API
        import yaml
        api_key = _get_api_key()
        if not api_key:
            return {"error": "Gateway unavailable and no API key configured"}
        config_path = hermes_path("config.yaml")
        base_url = "https://api.openai.com/v1"
        if config_path.exists():
            try:
                cfg = yaml.safe_load(config_path.read_text())
                model_cfg = cfg.get("model", {})
                base_url = model_cfg.get("base_url", base_url)
            except Exception:
                pass
        chat_url = f"{base_url}/chat/completions"
        payload = {"model": model, "messages": api_messages}
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
        async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=10.0)) as client:
            resp = await client.post(chat_url, json=payload, headers=headers)
            if resp.status_code != 200:
                return {"error": f"API error {resp.status_code}"}
            data = resp.json()
            full_response = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    except Exception as e:
        return {"error": str(e)}

    if full_response:
        _save_message_to_session(session_id, "assistant", full_response)

    logger.info("Chat send completed for session %s", session_id)
    return {"session_id": session_id, "response": full_response, "model": model}


@router.post("/stop")
async def chat_stop():
    """Signal to stop any in-progress generation (best-effort)."""
    return {"status": "stopped"}


@router.get("/models")
async def chat_models():
    """List available models from Hermes config."""
    import yaml
    config_path = hermes_path("config.yaml")
    models = []
    if config_path.exists():
        try:
            cfg = yaml.safe_load(config_path.read_text())
            model_cfg = cfg.get("model", {})
            default_model = model_cfg.get("default", "gpt-4o")
            models.append({"id": default_model, "name": default_model, "default": True})
            for m in model_cfg.get("available", []):
                if m != default_model:
                    models.append({"id": m, "name": m, "default": False})
        except Exception:
            pass
    if not models:
        models.append({"id": "gpt-4o", "name": "gpt-4o", "default": True})
    return {"models": models}


@router.get("/sessions")
async def chat_sessions():
    """List sessions for the chat sidebar."""
    sessions_dir = hermes_path("sessions")
    if not sessions_dir.exists():
        return []

    sessions = []
    for f in sorted(sessions_dir.glob("session_*.json"), reverse=True):
        try:
            data = json.loads(f.read_text())
            sid = data.get("session_id", f.stem.replace("session_", ""))
            sessions.append({
                "id": sid,
                "model": data.get("model", "unknown"),
                "platform": data.get("platform", "dashboard"),
                "created": data.get("created_at", ""),
                "messages_count": data.get("message_count", 0),
                "preview": data.get("preview", ""),
            })
        except Exception:
            continue
    return sessions


@router.get("/sessions/{session_id}/messages")
async def chat_session_messages(session_id: str):
    """Get messages for a specific session."""
    jsonl_path = hermes_path("sessions", f"{session_id}.jsonl")
    messages = []
    if jsonl_path.exists():
        for line in jsonl_path.read_text(errors="replace").strip().split("\n"):
            if line.strip():
                try:
                    messages.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    return {"session_id": session_id, "messages": messages}


@router.post("/stream")
async def chat_stream(request: Request):
    """Stream chat responses via SSE, proxying to the Hermes gateway."""
    logger.debug("Chat stream request received")
    body = await request.json()
    message = body.get("message", "")
    session_id = body.get("session_id") or str(uuid.uuid4())[:8]
    history = body.get("history", [])

    if not message.strip():
        return {"error": "Message is required"}

    # Build messages array for the API call
    api_messages = []
    for msg in history:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role in ("user", "assistant", "system") and content:
            api_messages.append({"role": role, "content": content})

    api_messages.append({"role": "user", "content": message})

    # Save user message
    _save_message_to_session(session_id, "user", message)

    model = _get_model()
    gateway_url = _get_gateway_url()

    async def generate():
        full_response = ""
        try:
            # Try gateway first
            chat_url = f"{gateway_url}/v1/chat/completions"
            payload = {
                "model": model,
                "messages": api_messages,
                "stream": True,
            }

            async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=10.0)) as client:
                async with client.stream(
                    "POST",
                    chat_url,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                ) as resp:
                    if resp.status_code != 200:
                        error_text = await resp.aread()
                        error_msg = error_text.decode(errors="replace")[:500]
                        yield f"event: error\ndata: {json.dumps({'message': f'Gateway error {resp.status_code}: {error_msg}'})}\n\n"
                        return

                    yield f"event: started\ndata: {json.dumps({'session_id': session_id})}\n\n"

                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            delta = chunk.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                full_response += content
                                yield f"event: chunk\ndata: {json.dumps({'text': content, 'full': full_response})}\n\n"

                            # Check for tool calls
                            tool_calls = delta.get("tool_calls")
                            if tool_calls:
                                for tc in tool_calls:
                                    yield f"event: tool\ndata: {json.dumps({'name': tc.get('function', {}).get('name', 'unknown'), 'phase': 'calling'})}\n\n"

                        except json.JSONDecodeError:
                            continue

        except httpx.ConnectError:
            # Gateway not available — fall back to direct LLM API
            api_key = _get_api_key()
            if not api_key:
                yield f"event: error\ndata: {json.dumps({'message': 'Gateway unavailable and no API key configured'})}\n\n"
                return

            # Determine API base URL from config
            import yaml
            config_path = hermes_path("config.yaml")
            base_url = "https://api.openai.com/v1"
            provider = "openai"
            if config_path.exists():
                try:
                    cfg = yaml.safe_load(config_path.read_text())
                    model_cfg = cfg.get("model", {})
                    provider = model_cfg.get("provider", "openai")
                    base_url = model_cfg.get("base_url", base_url)
                except Exception:
                    pass

            chat_url = f"{base_url}/chat/completions"
            payload = {
                "model": model,
                "messages": api_messages,
                "stream": True,
            }

            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            }
            if provider == "anthropic":
                headers["x-api-key"] = api_key
                headers["anthropic-version"] = "2023-06-01"
                del headers["Authorization"]
                chat_url = f"{base_url}/messages"
                payload = {
                    "model": model,
                    "messages": api_messages,
                    "stream": True,
                    "max_tokens": 4096,
                }

            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=10.0)) as client:
                    async with client.stream("POST", chat_url, json=payload, headers=headers) as resp:
                        if resp.status_code != 200:
                            error_text = await resp.aread()
                            yield f"event: error\ndata: {json.dumps({'message': f'API error {resp.status_code}'})}\n\n"
                            return

                        yield f"event: started\ndata: {json.dumps({'session_id': session_id})}\n\n"

                        if provider == "anthropic":
                            async for line in resp.aiter_lines():
                                if line.startswith("data: "):
                                    try:
                                        evt = json.loads(line[6:])
                                        if evt.get("type") == "content_block_delta":
                                            delta = evt.get("delta", {})
                                            text = delta.get("text", "")
                                            if text:
                                                full_response += text
                                                yield f"event: chunk\ndata: {json.dumps({'text': text, 'full': full_response})}\n\n"
                                    except json.JSONDecodeError:
                                        continue
                        else:
                            async for line in resp.aiter_lines():
                                if not line.startswith("data: "):
                                    continue
                                data_str = line[6:]
                                if data_str.strip() == "[DONE]":
                                    break
                                try:
                                    chunk = json.loads(data_str)
                                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                                    content = delta.get("content", "")
                                    if content:
                                        full_response += content
                                        yield f"event: chunk\ndata: {json.dumps({'text': content, 'full': full_response})}\n\n"
                                except json.JSONDecodeError:
                                    continue
            except Exception as e:
                yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"
                return

        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"
            return

        # Save assistant response
        if full_response:
            _save_message_to_session(session_id, "assistant", full_response)

        yield f"event: done\ndata: {json.dumps({'session_id': session_id, 'state': 'final'})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
