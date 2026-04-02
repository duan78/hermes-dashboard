from pathlib import Path

from fastapi import APIRouter, HTTPException, Body
from ..utils import hermes_path

router = APIRouter(prefix="/api/memory", tags=["memory"])


@router.get("/soul")
async def get_soul():
    """Read SOUL.md."""
    path = hermes_path("SOUL.md")
    if not path.exists():
        return {"content": "", "exists": False}
    return {"content": path.read_text(), "exists": True}


@router.put("/soul")
async def save_soul(body: dict = Body(...)):
    """Save SOUL.md."""
    content = body.get("content", "")
    path = hermes_path("SOUL.md")
    path.write_text(content)
    return {"status": "saved"}


@router.get("/memory")
async def get_memory():
    """Read MEMORY.md."""
    path = hermes_path("memories", "MEMORY.md")
    if not path.exists():
        return {"content": "", "exists": False}
    return {"content": path.read_text(), "exists": True}


@router.put("/memory")
async def save_memory(body: dict = Body(...)):
    """Save MEMORY.md."""
    content = body.get("content", "")
    path = hermes_path("memories", "MEMORY.md")
    path.write_text(content)
    return {"status": "saved"}


@router.get("/files")
async def list_memory_files():
    """List files in memories/ directory."""
    mem_dir = hermes_path("memories")
    if not mem_dir.exists():
        return {"files": []}
    files = []
    for f in sorted(mem_dir.iterdir()):
        if f.is_file() and not f.name.endswith(".lock"):
            files.append({
                "name": f.name,
                "size": f.stat().st_size,
                "modified": f.stat().st_mtime,
            })
    return {"files": files}


@router.get("/files/{filename}")
async def read_memory_file(filename: str):
    """Read a specific memory file."""
    path = hermes_path("memories", filename)
    if not path.exists() or not path.is_file():
        raise HTTPException(404, "File not found")
    if path.name.endswith(".lock"):
        raise HTTPException(403, "Cannot read lock files")
    return {"name": filename, "content": path.read_text(errors="replace")}


@router.put("/files/{filename}")
async def save_memory_file(filename: str, body: dict = Body(...)):
    """Save a memory file."""
    # Security: prevent path traversal
    if "/" in filename or ".." in filename:
        raise HTTPException(400, "Invalid filename")
    content = body.get("content", "")
    path = hermes_path("memories", filename)
    path.write_text(content)
    return {"status": "saved"}
