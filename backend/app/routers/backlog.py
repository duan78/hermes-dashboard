import json
import re
import fcntl
import subprocess
import time
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
    result: Optional[str] = None

class StatusPatch(BaseModel):
    status: str


# ── Tmux helpers ──

def _tmux_session_exists(session_name: str) -> bool:
    """Check if a tmux session exists."""
    result = subprocess.run(
        ["tmux", "has-session", "-t", session_name],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    return result.returncode == 0


def _get_tmux_output(session_name: str, lines: int = 500) -> str:
    """Capture the current visible output of a tmux session."""
    # Use capture-pane to get the visible buffer
    result = subprocess.run(
        ["tmux", "capture-pane", "-t", session_name, "-p", "-S", f"-{lines}"],
        capture_output=True, text=True
    )
    if result.returncode == 0:
        return result.stdout.strip()
    return ""


def _get_tmux_scrollback(session_name: str, lines: int = 2000) -> str:
    """Capture the scrollback history of a tmux session."""
    result = subprocess.run(
        ["tmux", "capture-pane", "-t", session_name, "-p", "-S", f"-{lines}"],
        capture_output=True, text=True
    )
    if result.returncode == 0:
        return result.stdout.strip()
    return ""


def _detect_claude_done(output: str) -> bool:
    """Detect if Claude Code has finished and returned to prompt."""
    if not output:
        return False
    lines = output.strip().split("\n")
    # Check last few lines for Claude's idle prompt indicators
    for line in lines[-10:]:
        stripped = line.strip()
        # Claude Code shows a prompt like "❯" or "> " or "? for shortcuts" when idle
        if re.search(r'[❯>]\s*$', stripped):
            return True
        if re.search(r'\?\s*for\s+shortcuts', stripped):
            return True
    return False


def _update_item_status(item_id: str, status: str, result: str = None):
    """Helper to update an item's status and optionally capture result."""
    data = _read_backlog()
    items = data.get("items", [])
    for i, item in enumerate(items):
        if item.get("id") == item_id:
            items[i]["status"] = status
            if status == "done":
                items[i]["done_date"] = datetime.now().isoformat()
            else:
                items[i]["done_date"] = None
            if result is not None:
                items[i]["result"] = result
            data["items"] = items
            _write_backlog(data)
            logger.info("Item %s status -> %s (result captured: %s)", item_id, status, result is not None)
            return items[i]
    return None


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


@router.post("/{item_id}/run")
async def run_backlog_item(item_id: str):
    """Launch a Claude Code session to execute this backlog item."""
    data = _read_backlog()
    items = data.get("items", [])

    target_item = None
    target_index = -1
    for i, item in enumerate(items):
        if item.get("id") == item_id:
            target_item = item
            target_index = i
            break

    if target_item is None:
        raise HTTPException(404, "Backlog item not found")

    if target_item.get("status") == "done":
        # Allow re-running by resetting to pending first
        items[target_index]["status"] = "pending"
        items[target_index]["done_date"] = None
        items[target_index]["result"] = None
        data["items"] = items
        _write_backlog(data)
        logger.info("Resetting done task %s for re-run", item_id)

    # Build task prompt
    title = target_item.get("title", "")
    description = target_item.get("description", "")
    if description:
        task_prompt = "Task from Hermes Backlog:\n\n## " + title + "\n\n" + description + "\n\n## Instructions\nExecute this task autonomously. When done, report the results."
    else:
        task_prompt = "Task from Hermes Backlog:\n\n## " + title + "\n\n## Instructions\nExecute this task autonomously. When done, report the results."

    session_name = "task-" + item_id

    # Check if tmux session already exists
    result = subprocess.run(
        ["tmux", "has-session", "-t", session_name],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    if result.returncode == 0:
        # Session already exists
        return {"ok": True, "session": session_name, "status": "in-progress", "prompt": task_prompt, "existing": True}

    # Create new tmux session
    subprocess.run(["tmux", "new-session", "-d", "-s", session_name])

    # Send Claude Code launch command
    subprocess.run(["tmux", "send-keys", "-t", session_name, "/root/.local/bin/claude -p \"" + task_prompt.replace('"', '\\"') + "\"", "Enter"])

    # Wait for Claude Code to start
    time.sleep(2)

    # Update item status to in-progress
    items[target_index]["status"] = "in-progress"
    data["items"] = items
    _write_backlog(data)
    logger.info("Launched Claude Code session %s for backlog item %s", session_name, item_id)

    return {"ok": True, "session": session_name, "status": "in-progress", "prompt": task_prompt}


@router.get("/{item_id}/session")
async def get_session_status(item_id: str):
    """Check if a Claude Code session is running for this backlog item."""
    session_name = "task-" + item_id
    result = subprocess.run(
        ["tmux", "has-session", "-t", session_name],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    running = result.returncode == 0
    return {"session": session_name, "running": running}


@router.get("/{item_id}/check")
async def check_backlog_completion(item_id: str):
    """Check if a running Claude Code session has completed for this item."""
    session_name = "task-" + item_id

    data = _read_backlog()
    items = data.get("items", [])
    target_item = None
    target_index = -1
    for i, item in enumerate(items):
        if item.get("id") == item_id:
            target_item = item
            target_index = i
            break

    if target_item is None:
        raise HTTPException(404, "Backlog item not found")

    current_status = target_item.get("status", "pending")

    # Already done?
    if current_status == "done":
        return {"item_id": item_id, "status": "done", "session_exists": False, "completed": True, "output": ""}

    # Check if tmux session exists
    session_exists = _tmux_session_exists(session_name)

    if not session_exists:
        # Session gone — mark as done if still in-progress
        if current_status == "in-progress":
            _update_item_status(item_id, "done", result="Session ended (tmux session no longer exists)")
            return {"item_id": item_id, "status": "done", "session_exists": False, "completed": True, "output": ""}
        return {"item_id": item_id, "status": current_status, "session_exists": False, "completed": False, "output": ""}

    # Session exists — check if Claude has finished
    output = _get_tmux_output(session_name)
    claude_done = _detect_claude_done(output)

    if claude_done and current_status == "in-progress":
        # Capture the last portion of output as the result
        full_output = _get_tmux_scrollback(session_name, 500)
        # Extract the meaningful result (last 2000 chars)
        result_text = full_output[-2000:] if len(full_output) > 2000 else full_output
        _update_item_status(item_id, "done", result=result_text)
        return {"item_id": item_id, "status": "done", "session_exists": True, "completed": True, "output": output}

    return {
        "item_id": item_id,
        "status": current_status,
        "session_exists": True,
        "completed": claude_done,
        "claude_idle": claude_done,
        "output": output,
    }


@router.get("/{item_id}/output")
async def get_backlog_output(item_id: str, lines: int = Query(200, ge=1, le=5000)):
    """Get the live output from a Claude Code tmux session."""
    session_name = "task-" + item_id

    if not _tmux_session_exists(session_name):
        # Try to return cached result from backlog item
        data = _read_backlog()
        items = data.get("items", [])
        for item in items:
            if item.get("id") == item_id:
                cached = item.get("result", "")
                return {
                    "item_id": item_id,
                    "session": session_name,
                    "running": False,
                    "output": cached,
                    "cached": True,
                }
        raise HTTPException(404, "No session found and item not in backlog")

    output = _get_tmux_output(session_name, lines)
    return {
        "item_id": item_id,
        "session": session_name,
        "running": True,
        "output": output,
        "cached": False,
    }


@router.post("/{item_id}/complete")
async def force_complete_item(item_id: str, capture_lines: int = Query(200, ge=1, le=5000)):
    """Force-mark a backlog item as done and capture the session output as result."""
    session_name = "task-" + item_id

    data = _read_backlog()
    items = data.get("items", [])
    target_item = None
    for i, item in enumerate(items):
        if item.get("id") == item_id:
            target_item = item
            break

    if target_item is None:
        raise HTTPException(404, "Backlog item not found")

    # Capture output if session exists
    result_text = ""
    if _tmux_session_exists(session_name):
        result_text = _get_tmux_scrollback(session_name, capture_lines)
        # Take last 3000 chars as result
        if len(result_text) > 3000:
            result_text = "...(truncated)...\n" + result_text[-3000:]
    else:
        result_text = "Session already ended. No live output captured."

    updated = _update_item_status(item_id, "done", result=result_text)

    # Optionally kill the tmux session
    if _tmux_session_exists(session_name):
        subprocess.run(
            ["tmux", "kill-session", "-t", session_name],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )

    return {"ok": True, "item_id": item_id, "item": updated}
