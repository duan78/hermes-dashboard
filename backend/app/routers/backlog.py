import json
import re
import fcntl
import logging
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/backlog", tags=["backlog"])

BACKLOG_FILE = Path("/root/.hermes/backlog.json")


def _read_backlog():
    """Read the backlog file with file locking."""
    if not BACKLOG_FILE.exists():
        return {"version": 1, "created": datetime.now().strftime("%Y-%m-%d"), "items": []}
    with open(BACKLOG_FILE, "r") as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_SH)
        try:
            data = json.load(f)
        finally:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)
    if "items" not in data:
        data["items"] = []
    return data


def _write_backlog(data):
    """Write the backlog file with file locking."""
    BACKLOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(BACKLOG_FILE, "w") as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX)
        try:
            json.dump(data, f, indent=2, ensure_ascii=False)
        finally:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)


def _slugify(title):
    """Create a slug from title: lowercase, spaces to hyphens, remove special chars."""
    slug = title.lower().strip()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"[\s]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    slug = slug.strip("-")
    return slug or "item"


# ── Schemas ──

class BacklogItemCreate(BaseModel):
    title: str
    description: str = ""
    category: str = "other"
    priority: str = "normale"
    status: str = "pending"
    blocked_reason: str = ""

class BacklogItemUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    blocked_reason: Optional[str] = None
    done_date: Optional[str] = None

class StatusPatch(BaseModel):
    status: str


# ── Endpoints ──

@router.get("")
async def list_backlog_items(
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
):
    """List all backlog items, with optional filtering."""
    data = _read_backlog()
    items = data.get("items", [])

    if status:
        items = [i for i in items if i.get("status") == status]
    if category:
        items = [i for i in items if i.get("category") == category]
    if priority:
        items = [i for i in items if i.get("priority") == priority]

    return {"items": items, "total": len(items)}


@router.get("/stats")
async def backlog_stats():
    """Return aggregate statistics for the backlog."""
    data = _read_backlog()
    items = data.get("items", [])

    by_status = {}
    by_category = {}
    for item in items:
        s = item.get("status", "unknown")
        by_status[s] = by_status.get(s, 0) + 1
        c = item.get("category", "unknown")
        by_category[c] = by_category.get(c, 0) + 1

    return {"total": len(items), "by_status": by_status, "by_category": by_category}


@router.post("")
async def create_backlog_item(body: BacklogItemCreate):
    """Create a new backlog item. ID is auto-generated from title."""
    data = _read_backlog()
    items = data.get("items", [])

    item_id = _slugify(body.title)
    # Ensure uniqueness
    existing_ids = {i.get("id") for i in items}
    if item_id in existing_ids:
        counter = 2
        while f"{item_id}-{counter}" in existing_ids:
            counter += 1
        item_id = f"{item_id}-{counter}"

    now = datetime.now().isoformat()
    new_item = {
        "id": item_id,
        "title": body.title,
        "description": body.description,
        "category": body.category,
        "priority": body.priority,
        "status": body.status,
        "created": now,
    }
    if body.blocked_reason:
        new_item["blocked_reason"] = body.blocked_reason
    if body.status == "done":
        new_item["done_date"] = now

    items.append(new_item)
    data["items"] = items
    _write_backlog(data)
    logger.info("Created backlog item: %s", item_id)
    return new_item


@router.put("/{item_id}")
async def update_backlog_item(item_id: str, body: BacklogItemUpdate):
    """Update fields of an existing backlog item."""
    data = _read_backlog()
    items = data.get("items", [])

    for i, item in enumerate(items):
        if item.get("id") == item_id:
            updates = body.model_dump(exclude_none=True)
            # If status is being set to done and no done_date, set it
            if updates.get("status") == "done" and not updates.get("done_date"):
                updates["done_date"] = datetime.now().isoformat()
            # If status is being changed away from done, clear done_date
            if updates.get("status") and updates.get("status") != "done":
                updates["done_date"] = None
            items[i].update(updates)
            data["items"] = items
            _write_backlog(data)
            logger.info("Updated backlog item: %s", item_id)
            return items[i]

    raise HTTPException(404, "Backlog item not found")


@router.delete("/{item_id}")
async def delete_backlog_item(item_id: str):
    """Delete a backlog item by ID."""
    data = _read_backlog()
    items = data.get("items", [])

    new_items = [i for i in items if i.get("id") != item_id]
    if len(new_items) == len(items):
        raise HTTPException(404, "Backlog item not found")

    data["items"] = new_items
    _write_backlog(data)
    logger.info("Deleted backlog item: %s", item_id)
    return {"status": "deleted", "id": item_id}


@router.patch("/{item_id}/status")
async def patch_backlog_status(item_id: str, body: StatusPatch):
    """Change the status of a backlog item."""
    data = _read_backlog()
    items = data.get("items", [])

    for i, item in enumerate(items):
        if item.get("id") == item_id:
            items[i]["status"] = body.status
            if body.status == "done":
                items[i]["done_date"] = datetime.now().isoformat()
            else:
                items[i]["done_date"] = None
            data["items"] = items
            _write_backlog(data)
            logger.info("Patched status of %s to %s", item_id, body.status)
            return items[i]

    raise HTTPException(404, "Backlog item not found")
