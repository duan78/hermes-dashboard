"""Activity Feed router — append-only log of actions across modules."""

import fcntl
import json
import logging
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Query

from ..config import HERMES_HOME

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/activity", tags=["activity"])

ACTIVITY_FILE = HERMES_HOME / "activity.json"
MAX_ENTRIES = 500


def _read_activity():
    if not ACTIVITY_FILE.exists():
        return {"version": 1, "entries": []}
    with open(ACTIVITY_FILE) as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_SH)
        try:
            data = json.load(f)
        finally:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)
    if "entries" not in data:
        data["entries"] = []
    return data


def _write_activity(data):
    ACTIVITY_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(ACTIVITY_FILE, "w") as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX)
        try:
            json.dump(data, f, indent=2, ensure_ascii=False)
        finally:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)


def log_activity(action: str, entity_type: str, entity_id: str = "",
                 entity_name: str = "", actor: str = "system",
                 details: dict | None = None, metadata: dict | None = None):
    """Public helper to append an activity entry. Called from other routers."""
    data = _read_activity()
    entries = data.get("entries", [])

    entry = {
        "id": str(uuid.uuid4())[:8],
        "timestamp": datetime.now().isoformat(),
        "action": action,
        "actor": actor,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "entity_name": entity_name,
        "details": details or {},
        "metadata": metadata or {},
    }

    entries.append(entry)

    # FIFO rotation: keep only MAX_ENTRIES
    if len(entries) > MAX_ENTRIES:
        entries = entries[-MAX_ENTRIES:]

    data["entries"] = entries
    _write_activity(data)

    # Broadcast via WebSocket
    try:
        from ..websocket_hub import hub
        import asyncio
        asyncio.get_event_loop().create_task(
            hub.broadcast("activity:new", {"action": action, "entity_type": entity_type, "entity_name": entity_name})
        )
    except Exception:
        pass

    return entry


# ── Endpoints ──

@router.get("")
async def list_activity(
    entity_type: str | None = Query(None),
    action: str | None = Query(None),
    since: str | None = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
):
    data = _read_activity()
    entries = data.get("entries", [])

    if entity_type:
        entries = [e for e in entries if e.get("entity_type") == entity_type]
    if action:
        entries = [e for e in entries if e.get("action") == action]
    if since:
        entries = [e for e in entries if e.get("timestamp", "") >= since]

    entries.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    total = len(entries)
    return {"entries": entries[offset:offset + limit], "total": total}


@router.get("/stats")
async def activity_stats():
    data = _read_activity()
    entries = data.get("entries", [])

    by_action = {}
    by_entity_type = {}
    for e in entries:
        a = e.get("action", "unknown")
        by_action[a] = by_action.get(a, 0) + 1
        et = e.get("entity_type", "unknown")
        by_entity_type[et] = by_entity_type.get(et, 0) + 1

    return {
        "total": len(entries),
        "by_action": by_action,
        "by_entity_type": by_entity_type,
    }
