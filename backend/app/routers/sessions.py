import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from ..utils import hermes_path, run_hermes

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.get("")
async def list_sessions():
    """List all unique sessions with metadata, deduplicated by session_id."""
    sessions_dir = hermes_path("sessions")
    if not sessions_dir.exists():
        return []

    seen_ids = set()
    sessions = []

    for f in sorted(sessions_dir.glob("session_*.json"), reverse=True):
        try:
            data = json.loads(f.read_text())
            sid = data.get("session_id", f.stem.replace("session_", ""))

            # Deduplicate: keep first (most recent) occurrence per session_id
            if sid in seen_ids:
                continue
            seen_ids.add(sid)

            # Count actual messages from JSONL if available
            msg_count = data.get("message_count", 0)
            jsonl_path = hermes_path("sessions", f"{sid}.jsonl")
            if jsonl_path.exists():
                try:
                    lines = jsonl_path.read_text(errors="replace").strip().split("\n")
                    msg_count = sum(1 for l in lines if l.strip())
                except Exception:
                    pass

            # Build a useful preview/title
            preview = data.get("preview", "")
            created_at = data.get("created_at", "")
            if not preview:
                # Use first user message from JSONL as preview
                if jsonl_path.exists():
                    try:
                        for line in jsonl_path.read_text(errors="replace").strip().split("\n"):
                            if not line.strip():
                                continue
                            msg = json.loads(line)
                            if msg.get("role") == "user" and msg.get("content"):
                                preview = msg["content"][:80]
                                break
                    except Exception:
                        pass
            if not preview and created_at:
                preview = created_at

            sessions.append({
                "id": sid,
                "model": data.get("model", "unknown"),
                "platform": data.get("platform", "unknown"),
                "created": created_at,
                "messages_count": msg_count,
                "tokens": data.get("tokens", {}),
                "preview": preview,
            })
        except (json.JSONDecodeError, Exception):
            continue
    return sessions


@router.get("/stats")
async def sessions_stats():
    """Global sessions stats."""
    try:
        output = await run_hermes("sessions", "stats", timeout=15)
        return {"output": output}
    except RuntimeError as e:
        return {"output": "", "error": str(e)}


@router.get("/{session_id}")
async def get_session(session_id: str):
    """Get session detail with messages."""
    # Try JSON format first
    session_file = hermes_path("sessions", f"session_{session_id}.json")
    if session_file.exists():
        data = json.loads(session_file.read_text())
        # Also load JSONL messages if available
        jsonl_file = hermes_path("sessions", f"{session_id}.jsonl")
        messages = []
        if jsonl_file.exists():
            for line in jsonl_file.read_text(errors="replace").strip().split("\n"):
                if line.strip():
                    try:
                        messages.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
        data["messages"] = messages
        return data

    # Fallback: try JSONL only
    jsonl_file = hermes_path("sessions", f"{session_id}.jsonl")
    if jsonl_file.exists():
        messages = []
        for line in jsonl_file.read_text(errors="replace").strip().split("\n"):
            if line.strip():
                try:
                    messages.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        return {"session_id": session_id, "messages": messages}

    raise HTTPException(404, f"Session {session_id} not found")


@router.delete("/{session_id}")
async def delete_session(session_id: str):
    """Delete a session."""
    try:
        output = await run_hermes("sessions", "delete", session_id, "--yes", timeout=15)
        return {"status": "deleted", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))


@router.post("/prune")
async def prune_sessions(days: int = Query(default=30)):
    """Prune old sessions."""
    try:
        output = await run_hermes("sessions", "prune", "--days", str(days), "--yes", timeout=15)
        return {"status": "pruned", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))


@router.get("/{session_id}/export")
async def export_session(session_id: str):
    """Export a session."""
    jsonl_file = hermes_path("sessions", f"{session_id}.jsonl")
    if jsonl_file.exists():
        return {"format": "jsonl", "data": jsonl_file.read_text(errors="replace")}
    session_file = hermes_path("sessions", f"session_{session_id}.json")
    if session_file.exists():
        return {"format": "json", "data": session_file.read_text()}
    raise HTTPException(404, f"Session {session_id} not found")
