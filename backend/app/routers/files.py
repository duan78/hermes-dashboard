import logging
import os
import stat
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Query, HTTPException
from ..config import HERMES_HOME
from ..schemas.requests import FileWriteRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/files", tags=["files"])

# Only allow access under HERMES_HOME
HERMES_HOME_RESOLVED = HERMES_HOME.resolve()

# Directories to show at root level
ROOT_DIRS = [
    "skills", "memory", "sessions", "config", "audio_cache",
    "fine-tune", "logs", "cron", "tools",
]

# Binary extensions to refuse reading
BINARY_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp",
    ".mp3", ".mp4", ".wav", ".ogg", ".flac", ".m4a",
    ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar",
    ".pkl", ".pickle", ".pyc", ".pyo", ".so", ".dll", ".dylib",
    ".db", ".sqlite", ".woff", ".woff2", ".ttf", ".eot",
}


def _resolve_path(rel_path: str) -> Path:
    """Resolve a relative path under HERMES_HOME, preventing traversal."""
    if not rel_path:
        return HERMES_HOME_RESOLVED
    resolved = (HERMES_HOME_RESOLVED / rel_path).resolve()
    if not str(resolved).startswith(str(HERMES_HOME_RESOLVED)):
        raise HTTPException(403, "Access denied: path outside HERMES_HOME")
    return resolved


def _is_binary(path: Path) -> bool:
    return path.suffix.lower() in BINARY_EXTENSIONS


def _file_entry(path: Path, rel: str):
    """Build a file/directory metadata dict."""
    try:
        st = path.stat()
    except OSError:
        st = None
    return {
        "name": path.name,
        "path": rel,
        "is_dir": path.is_dir(),
        "size": st.st_size if st else 0,
        "modified": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat() if st else None,
    }


@router.get("")
async def list_files(path: str = Query(default="", description="Relative path under HERMES_HOME")):
    """List files and directories at the given path."""
    target = _resolve_path(path)
    if not target.exists():
        raise HTTPException(404, f"Path not found: {path}")
    if not target.is_dir():
        raise HTTPException(400, f"Not a directory: {path}")

    entries = []
    try:
        for item in sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
            if item.name.startswith(".") and item.name not in (".env",):
                continue  # skip hidden files except .env
            rel = str(item.relative_to(HERMES_HOME_RESOLVED))
            entries.append(_file_entry(item, rel))
    except PermissionError:
        raise HTTPException(403, "Permission denied")

    return {
        "path": path,
        "absolute": str(target),
        "entries": entries,
    }


@router.get("/tree")
async def directory_tree():
    """Get the top-level directory tree structure for the sidebar."""
    dirs = []
    # Add HERMES_HOME root files
    root_files = []
    if HERMES_HOME_RESOLVED.exists():
        for item in sorted(HERMES_HOME_RESOLVED.iterdir()):
            if item.name.startswith(".") and item.name not in (".env",):
                continue
            rel = str(item.relative_to(HERMES_HOME_RESOLVED))
            if item.is_dir() and item.name in ROOT_DIRS:
                dirs.append(_file_entry(item, rel))
            elif item.is_file():
                root_files.append(_file_entry(item, rel))

    # Also include directories that exist but aren't in our expected list
    if HERMES_HOME_RESOLVED.exists():
        existing_names = {d["name"] for d in dirs}
        for item in sorted(HERMES_HOME_RESOLVED.iterdir()):
            if item.name.startswith("."):
                continue
            if item.is_dir() and item.name not in existing_names:
                rel = str(item.relative_to(HERMES_HOME_RESOLVED))
                dirs.append(_file_entry(item, rel))

    return {"directories": dirs, "root_files": root_files}


@router.get("/read")
async def read_file(path: str = Query(..., description="Relative file path under HERMES_HOME")):
    """Read a file's content."""
    target = _resolve_path(path)
    if not target.exists():
        raise HTTPException(404, f"File not found: {path}")
    if target.is_dir():
        raise HTTPException(400, f"Path is a directory: {path}")
    if _is_binary(target):
        raise HTTPException(400, f"Binary file, cannot display: {target.suffix}")
    if target.stat().st_size > 5 * 1024 * 1024:  # 5MB limit
        raise HTTPException(400, "File too large (>5MB)")

    try:
        content = target.read_text(errors="replace")
    except PermissionError:
        raise HTTPException(403, "Permission denied")

    return {
        "path": path,
        "name": target.name,
        "size": target.stat().st_size,
        "modified": datetime.fromtimestamp(target.stat().st_mtime, tz=timezone.utc).isoformat(),
        "extension": target.suffix.lower(),
        "content": content,
    }


@router.put("/write")
async def write_file(body: FileWriteRequest):
    """Write content to a file."""
    rel_path = body.path

    logger.info("Writing file: %s", rel_path)

    target = _resolve_path(rel_path)

    # Prevent writing to directories or creating files outside HERMES_HOME
    if target.is_dir():
        raise HTTPException(400, "Cannot write to a directory")

    # Ensure parent directory exists
    target.parent.mkdir(parents=True, exist_ok=True)

    try:
        target.write_text(body.content)
    except PermissionError:
        raise HTTPException(403, "Permission denied")

    return {
        "status": "saved",
        "path": rel_path,
        "size": target.stat().st_size,
        "modified": datetime.fromtimestamp(target.stat().st_mtime, tz=timezone.utc).isoformat(),
    }


@router.delete("")
async def delete_file(path: str = Query(..., description="Relative file path to delete")):
    """Delete a file (not a directory)."""
    logger.info("Deleting file: %s", path)
    target = _resolve_path(path)
    if not target.exists():
        raise HTTPException(404, f"File not found: {path}")
    if target.is_dir():
        raise HTTPException(400, "Cannot delete directories")
    try:
        target.unlink()
    except PermissionError:
        raise HTTPException(403, "Permission denied")
    return {"status": "deleted", "path": path}
