"""Tags/Labels router — CRUD for reusable tags across projects, backlog, wiki."""

import fcntl
import json
import logging
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import HERMES_HOME

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tags", tags=["tags"])

TAGS_FILE = HERMES_HOME / "tags.json"

PRESET_COLORS = [
    "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
    "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
    "#14b8a6", "#e11d48", "#a855f7", "#0ea5e9", "#22c55e",
]


def _read_tags():
    if not TAGS_FILE.exists():
        return {"version": 1, "items": []}
    with open(TAGS_FILE) as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_SH)
        try:
            data = json.load(f)
        finally:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)
    if "items" not in data:
        data["items"] = []
    return data


def _write_tags(data):
    TAGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(TAGS_FILE, "w") as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX)
        try:
            json.dump(data, f, indent=2, ensure_ascii=False)
        finally:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)


# ── Schemas ──

class TagCreate(BaseModel):
    name: str
    color: str = "#8b5cf6"

class TagUpdate(BaseModel):
    name: str | None = None
    color: str | None = None


# ── Endpoints ──

@router.get("")
async def list_tags():
    data = _read_tags()
    items = data.get("items", [])
    return {"items": items, "total": len(items)}


@router.get("/presets")
async def preset_colors():
    return {"colors": PRESET_COLORS}


@router.post("")
async def create_tag(body: TagCreate):
    data = _read_tags()
    items = data.get("items", [])

    # Check duplicate name
    if any(t.get("name").lower() == body.name.lower() for t in items):
        raise HTTPException(409, f"Tag '{body.name}' already exists")

    now = datetime.now().isoformat()
    new_tag = {
        "id": str(uuid.uuid4())[:8],
        "name": body.name,
        "color": body.color,
        "created": now,
    }

    items.append(new_tag)
    data["items"] = items
    _write_tags(data)
    logger.info("Created tag: %s", new_tag["id"])
    return new_tag


@router.patch("/{tag_id}")
async def update_tag(tag_id: str, body: TagUpdate):
    data = _read_tags()
    items = data.get("items", [])

    for i, t in enumerate(items):
        if t.get("id") == tag_id:
            updates = body.model_dump(exclude_none=True)
            # Check duplicate name if renaming
            if body.name and body.name.lower() != t["name"].lower():
                if any(x.get("name").lower() == body.name.lower() for x in items):
                    raise HTTPException(409, f"Tag '{body.name}' already exists")
            items[i].update(updates)
            data["items"] = items
            _write_tags(data)
            return items[i]

    raise HTTPException(404, "Tag not found")


@router.delete("/{tag_id}")
async def delete_tag(tag_id: str):
    data = _read_tags()
    items = data.get("items", [])

    new_items = [t for t in items if t.get("id") != tag_id]
    if len(new_items) == len(items):
        raise HTTPException(404, "Tag not found")

    data["items"] = new_items
    _write_tags(data)
    return {"status": "deleted", "id": tag_id}
