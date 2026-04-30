"""Notifications router — CRUD + WebSocket broadcast for real-time notifications."""

import fcntl
import json
import logging
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..config import HERMES_HOME

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

NOTIFICATIONS_FILE = HERMES_HOME / "notifications.json"

VALID_TYPES = ["action_required", "info", "success", "warning", "error"]
VALID_CATEGORIES = ["project", "backlog", "wiki", "system", "claude-code"]
VALID_STATUSES = ["unread", "read", "actioned", "dismissed"]


def _read_notifications():
    if not NOTIFICATIONS_FILE.exists():
        return {"version": 1, "items": []}
    with open(NOTIFICATIONS_FILE) as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_SH)
        try:
            data = json.load(f)
        finally:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)
    if "items" not in data:
        data["items"] = []
    return data


def _write_notifications(data):
    NOTIFICATIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(NOTIFICATIONS_FILE, "w") as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX)
        try:
            json.dump(data, f, indent=2, ensure_ascii=False)
        finally:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)


# ── Schemas ──

class NotificationCreate(BaseModel):
    type: str = "info"
    category: str = "system"
    title: str
    description: str = ""
    data: dict | None = None
    actions: list[dict] | None = None  # [{id, label, style}]
    expires: str | None = None

class NotificationPatch(BaseModel):
    status: str | None = None
    action_id: str | None = None

class NotificationBulkAction(BaseModel):
    action: str = "mark_read"  # mark_read, dismiss_all


# ── Endpoints ──

@router.get("")
async def list_notifications(
    status: str | None = Query(None),
    category: str | None = Query(None),
    type: str | None = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
):
    data = _read_notifications()
    items = data.get("items", [])

    now = datetime.now().isoformat()
    # Filter expired
    items = [i for i in items if not i.get("expires") or i["expires"] > now]

    if status:
        items = [i for i in items if i.get("status") == status]
    if category:
        items = [i for i in items if i.get("category") == category]
    if type:
        items = [i for i in items if i.get("type") == type]

    items.sort(key=lambda x: x.get("created", ""), reverse=True)
    total = len(items)
    return {"items": items[offset:offset + limit], "total": total}


@router.get("/stats")
async def notification_stats():
    data = _read_notifications()
    items = data.get("items", [])
    now = datetime.now().isoformat()
    active = [i for i in items if not i.get("expires") or i["expires"] > now]

    by_status = {}
    by_type = {}
    for item in active:
        s = item.get("status", "unread")
        by_status[s] = by_status.get(s, 0) + 1
        t = item.get("type", "info")
        by_type[t] = by_type.get(t, 0) + 1

    unread = by_status.get("unread", 0)
    return {
        "total": len(active),
        "unread": unread,
        "by_status": by_status,
        "by_type": by_type,
    }


@router.post("")
async def create_notification(body: NotificationCreate):
    if body.type not in VALID_TYPES:
        raise HTTPException(400, f"Invalid type. Valid: {VALID_TYPES}")
    if body.category not in VALID_CATEGORIES:
        raise HTTPException(400, f"Invalid category. Valid: {VALID_CATEGORIES}")

    data = _read_notifications()
    items = data.get("items", [])

    now = datetime.now().isoformat()
    new_notif = {
        "id": str(uuid.uuid4()),
        "type": body.type,
        "category": body.category,
        "title": body.title,
        "description": body.description,
        "data": body.data or {},
        "actions": body.actions or [],
        "status": "unread",
        "created": now,
        "expires": body.expires,
    }

    items.append(new_notif)
    data["items"] = items
    _write_notifications(data)

    # Broadcast via WebSocket
    try:
        from ..websocket_hub import hub
        import asyncio
        asyncio.get_event_loop().create_task(
            hub.broadcast("notification:new", {"id": new_notif["id"], "type": new_notif["type"], "title": new_notif["title"]})
        )
    except Exception:
        pass

    logger.info("Created notification: %s", new_notif["id"])
    return new_notif


@router.get("/list")
async def list_notifications_alias(
    status: str | None = Query(None),
    category: str | None = Query(None),
    type: str | None = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
):
    """Alias for GET /api/notifications (for clients that call /list)."""
    return await list_notifications(status=status, category=category, type=type, limit=limit, offset=offset)


@router.get("/{notif_id}")
async def get_notification(notif_id: str):
    data = _read_notifications()
    for item in data.get("items", []):
        if item.get("id") == notif_id:
            return item
    raise HTTPException(404, "Notification not found")


@router.patch("/{notif_id}")
async def patch_notification(notif_id: str, body: NotificationPatch):
    if body.status and body.status not in VALID_STATUSES:
        raise HTTPException(400, f"Invalid status. Valid: {VALID_STATUSES}")

    data = _read_notifications()
    items = data.get("items", [])

    for i, item in enumerate(items):
        if item.get("id") == notif_id:
            if body.status:
                items[i]["status"] = body.status
            if body.action_id:
                items[i]["status"] = "actioned"
                items[i]["actioned_id"] = body.action_id
            data["items"] = items
            _write_notifications(data)
            return items[i]

    raise HTTPException(404, "Notification not found")


@router.delete("/{notif_id}")
async def delete_notification(notif_id: str):
    data = _read_notifications()
    items = data.get("items", [])

    new_items = [i for i in items if i.get("id") != notif_id]
    if len(new_items) == len(items):
        raise HTTPException(404, "Notification not found")

    data["items"] = new_items
    _write_notifications(data)
    return {"status": "deleted", "id": notif_id}


@router.post("/bulk")
async def bulk_notifications_action(body: NotificationBulkAction):
    data = _read_notifications()
    items = data.get("items", [])

    if body.action == "mark_read":
        for item in items:
            if item.get("status") == "unread":
                item["status"] = "read"
    elif body.action == "dismiss_all":
        for item in items:
            if item.get("status") in ("unread", "read"):
                item["status"] = "dismissed"

    data["items"] = items
    _write_notifications(data)
    return {"status": "ok", "action": body.action}
