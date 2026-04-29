import json
import logging

from fastapi import APIRouter, HTTPException, Query

from ..schemas.sessions import (
    SessionDetail,
    SessionExport,
    SessionSearchResult,
    SessionStats,
    SessionSummary,
)
from ..utils import hermes_path, run_hermes

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.get("/search", response_model=list[SessionSearchResult])
async def search_sessions(q: str = Query(min_length=1, max_length=200)):
    """Search sessions by content. Searches through session previews and JSONL message content."""
    sessions_dir = hermes_path("sessions")
    if not sessions_dir.exists():
        return []

    query_lower = q.lower()
    results = []
    seen_ids = set()

    # Search through session JSON files for metadata matches
    for f in sorted(sessions_dir.glob("session_*.json"), reverse=True):
        try:
            data = json.loads(f.read_text())
            sid = data.get("session_id", f.stem.replace("session_", ""))
            if sid in seen_ids:
                continue

            # Check metadata fields
            preview = data.get("preview", "")
            model = data.get("model", "")
            platform = data.get("platform", "")
            matched_in = []

            if query_lower in preview.lower():
                matched_in.append("preview")
            if query_lower in model.lower():
                matched_in.append("model")
            if query_lower in platform.lower():
                matched_in.append("platform")

            # Check JSONL messages for content match
            jsonl_path = hermes_path("sessions", f"{sid}.jsonl")
            snippet = ""
            if jsonl_path.exists():
                try:
                    for line in jsonl_path.read_text(errors="replace").strip().split("\n"):
                        if not line.strip():
                            continue
                        msg = json.loads(line)
                        content = msg.get("content", "")
                        if content and query_lower in content.lower():
                            if not matched_in:
                                matched_in.append("messages")
                            # Extract a snippet around the match
                            idx = content.lower().find(query_lower)
                            start = max(0, idx - 40)
                            end = min(len(content), idx + len(q) + 40)
                            snippet = (content[start:end]).strip()
                            if start > 0:
                                snippet = "..." + snippet
                            if end < len(content):
                                snippet = snippet + "..."
                            break
                except Exception as e:
                    logger.warning("Error reading JSONL messages for session %s: %s", sid, e)

            if matched_in:
                seen_ids.add(sid)
                msg_count = data.get("message_count", 0)
                if jsonl_path.exists():
                    try:
                        lines = jsonl_path.read_text(errors="replace").strip().split("\n")
                        msg_count = sum(1 for l in lines if l.strip())
                    except Exception as e:
                        logger.debug("Skipping message count for matched session %s: %s", sid, e)

                results.append({
                    "id": sid,
                    "model": model or "unknown",
                    "platform": platform or "unknown",
                    "created": data.get("created_at") or "",
                    "messages_count": msg_count,
                    "preview": preview or "",
                    "matched_in": matched_in,
                    "snippet": snippet,
                })
        except (json.JSONDecodeError, Exception) as e:
            logger.debug("Skipping session file %s: %s", f.name, e)
            continue

    return results


@router.get("", response_model=list[SessionSummary])
async def list_sessions(limit: int = Query(default=100, ge=1, le=500), offset: int = Query(default=0, ge=0)):
    """List unique sessions with metadata, paginated and deduplicated by session_id."""
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

            # Early exit if we have enough sessions past the offset
            if len(sessions) >= offset + limit:
                break

            created_at = data.get("created_at", "")
            preview = data.get("preview", "")
            msg_count = data.get("message_count", 0)

            # Only read JSONL if we're missing critical data
            jsonl_path = hermes_path("sessions", f"{sid}.jsonl")
            if (not msg_count or not preview) and jsonl_path.exists():
                try:
                    jsonl_text = jsonl_path.read_text(errors="replace").strip()
                    lines = jsonl_text.split("\n")

                    if not msg_count:
                        msg_count = sum(1 for l in lines if l.strip())

                    if not preview:
                        for line in lines[:20]:  # Only scan first 20 lines
                            if not line.strip():
                                continue
                            msg = json.loads(line)
                            if msg.get("role") == "user" and msg.get("content"):
                                preview = msg["content"][:80]
                                break
                except Exception as e:
                    logger.debug("Skipping JSONL read for session %s: %s", sid, e)

            if not preview and created_at:
                preview = created_at

            sessions.append({
                "id": sid,
                "model": data.get("model") or "unknown",
                "platform": data.get("platform") or "unknown",
                "created": created_at,
                "messages_count": msg_count,
                "tokens": data.get("tokens", {}),
                "preview": preview,
            })
        except (json.JSONDecodeError, Exception) as e:
            logger.debug("Skipping session file %s: %s", f.name, e)
            continue
    # Apply pagination
    return sessions[offset:offset + limit]


@router.get("/stats", response_model=SessionStats)
async def sessions_stats():
    """Global sessions stats."""
    try:
        output = await run_hermes("sessions", "stats", timeout=15)
        return {"output": output}
    except RuntimeError as e:
        return {"output": "", "error": str(e)}


@router.get("/linked-projects")
async def get_linked_projects():
    """Return mapping of session_id -> project for sessions that match a project.

    Optimized: reads each session file only once, matches against all projects
    in a single pass.
    """
    projects_file = hermes_path("projects.json")
    if not projects_file.exists():
        return {"mappings": {}}

    projects_data = json.loads(projects_file.read_text())
    projects = projects_data.get("items", projects_data) if isinstance(projects_data, dict) else projects_data
    sessions_dir = hermes_path("sessions")
    if not sessions_dir.exists():
        return {"mappings": {}}

    # Pre-build project search terms (only projects with keywords)
    proj_terms = []
    for proj in projects:
        name = proj.get("name", "").lower()
        keywords = [k.lower() for k in proj.get("keywords", [])]
        if not name and not keywords:
            continue
        search_terms = [name] + keywords
        long_terms = [t for t in search_terms if len(t) >= 4]
        proj_terms.append({
            "id": proj.get("id", ""),
            "name": proj.get("name", ""),
            "type": proj.get("type", ""),
            "search_terms": search_terms,
            "long_terms": long_terms,
        })

    if not proj_terms:
        return {"mappings": {}}

    mappings = {}

    # Single pass through sessions — read each file once
    for f in sessions_dir.glob("session_*.json"):
        try:
            data = json.loads(f.read_text())
            sid = data.get("session_id", f.stem.replace("session_", ""))

            # Use the preview field from the JSON metadata (already extracted)
            head_content = (data.get("preview", "") or "").lower()

            # If preview is too short, read first 3 user messages from JSONL
            if len(head_content) < 100:
                jsonl_path = sessions_dir / f"{sid}.jsonl"
                if jsonl_path.exists():
                    extra = []
                    for line in jsonl_path.read_text(errors="replace").strip().split("\n")[:10]:
                        if not line.strip():
                            continue
                        try:
                            msg = json.loads(line)
                            if msg.get("role") in ("system", "context", "compaction", "session_meta"):
                                continue
                            c = msg.get("content", "")
                            if isinstance(c, str) and c:
                                extra.append(c.lower())
                            if len(extra) >= 3:
                                break
                        except Exception:
                            continue
                    head_content = " ".join(extra)

            if not head_content:
                continue

            # Match against all projects
            for pt in proj_terms:
                matches = sum(1 for t in pt["search_terms"] if t and t in head_content)
                long_matches = sum(1 for t in pt["long_terms"] if t and t in head_content)

                if (matches >= 2 and long_matches >= 1) or (len(pt["search_terms"]) == 1 and matches >= 1):
                    mappings[sid] = {
                        "id": pt["id"],
                        "name": pt["name"],
                        "type": pt["type"],
                    }
                    break  # One session → one project max

        except Exception:
            continue

    return {"mappings": mappings}


@router.get("/{session_id}", response_model=SessionDetail)
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
    logger.info("Deleting session: %s", session_id)
    try:
        output = await run_hermes("sessions", "delete", session_id, "--yes", timeout=15)
        return {"status": "deleted", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))


@router.post("/prune")
async def prune_sessions(days: int = Query(default=30)):
    """Prune old sessions."""
    logger.info("Pruning sessions older than %d days", days)
    try:
        output = await run_hermes("sessions", "prune", "--days", str(days), "--yes", timeout=15)
        return {"status": "pruned", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))


@router.get("/{session_id}/export", response_model=SessionExport)
async def export_session(session_id: str):
    """Export a session."""
    jsonl_file = hermes_path("sessions", f"{session_id}.jsonl")
    if jsonl_file.exists():
        return {"format": "jsonl", "data": jsonl_file.read_text(errors="replace")}
    session_file = hermes_path("sessions", f"session_{session_id}.json")
    if session_file.exists():
        return {"format": "json", "data": session_file.read_text()}
    raise HTTPException(404, f"Session {session_id} not found")


@router.post("/export-all")
async def export_all_sessions():
    """Export all sessions as a single JSON array."""
    sessions_dir = hermes_path("sessions")
    if not sessions_dir.exists():
        return {"sessions": [], "count": 0}

    all_sessions = []
    seen_ids = set()

    for f in sorted(sessions_dir.glob("session_*.json"), reverse=True):
        try:
            data = json.loads(f.read_text())
            sid = data.get("session_id", f.stem.replace("session_", ""))
            if sid in seen_ids:
                continue
            seen_ids.add(sid)

            # Load messages from JSONL
            jsonl_file = hermes_path("sessions", f"{sid}.jsonl")
            messages = []
            if jsonl_file.exists():
                for line in jsonl_file.read_text(errors="replace").strip().split("\n"):
                    if line.strip():
                        try:
                            messages.append(json.loads(line))
                        except json.JSONDecodeError:
                            continue
            data["messages"] = messages
            all_sessions.append(data)
        except (json.JSONDecodeError, Exception):
            continue

    return {"sessions": all_sessions, "count": len(all_sessions)}
