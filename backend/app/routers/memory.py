from pathlib import Path
from datetime import datetime

from fastapi import APIRouter, HTTPException, Body
from ..utils import hermes_path

router = APIRouter(prefix="/api/memory", tags=["memory"])

# Directories to scan for .md files
_HERMES_ROOT = hermes_path()
_SCAN_DIRS = [
    _HERMES_ROOT,                    # ~/.hermes/*.md
    hermes_path("memories"),         # ~/.hermes/memories/*.md
    hermes_path("memory"),           # ~/.hermes/memory/*.md (legacy)
]


def _resolve_path(path: str) -> Path:
    """Resolve a relative path within ~/.hermes/ and ensure no traversal."""
    p = _HERMES_ROOT / path
    try:
        p = p.resolve(strict=False)
    except (OSError, ValueError):
        raise HTTPException(400, "Invalid path")
    root = _HERMES_ROOT.resolve()
    if not str(p).startswith(str(root) + "/") and p != root:
        raise HTTPException(403, "Path must be within ~/.hermes/")
    return p


# ── Legacy endpoints (kept for backwards compat) ──

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
    """List files in memories/ directory (legacy)."""
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
    if "/" in filename or ".." in filename:
        raise HTTPException(400, "Invalid filename")
    content = body.get("content", "")
    path = hermes_path("memories", filename)
    path.write_text(content)
    return {"status": "saved"}


# ── New CRUD endpoints ──

@router.get("/all")
async def list_all_files():
    """List all .md files in ~/.hermes/ and subdirectories."""
    seen = set()
    files = []
    root = _HERMES_ROOT

    # Scan ~/.hermes/*.md
    if root.exists():
        for f in sorted(root.iterdir()):
            if f.is_file() and f.suffix == ".md" and not f.name.endswith(".lock"):
                key = str(f)
                if key not in seen:
                    seen.add(key)
                    st = f.stat()
                    files.append({
                        "name": f.name,
                        "path": f.name,
                        "size": st.st_size,
                        "modified": st.st_mtime,
                        "is_root": True,
                    })

    # Scan subdirectories
    for subdir in ["memories", "memory", "skills"]:
        sd = hermes_path(subdir)
        if not sd.exists():
            continue
        for f in sorted(sd.iterdir()):
            if f.is_file() and f.suffix == ".md" and not f.name.endswith(".lock"):
                key = str(f)
                if key not in seen:
                    seen.add(key)
                    st = f.stat()
                    rel = f.relative_to(root)
                    files.append({
                        "name": f.name,
                        "path": str(rel),
                        "size": st.st_size,
                        "modified": st.st_mtime,
                        "is_root": False,
                    })

    return {"files": files}


@router.get("/read")
async def read_file(path: str):
    """Read any file within ~/.hermes/ by relative path."""
    resolved = _resolve_path(path)
    if not resolved.exists() or not resolved.is_file():
        raise HTTPException(404, "File not found")
    if resolved.name.endswith(".lock"):
        raise HTTPException(403, "Cannot read lock files")
    st = resolved.stat()
    return {
        "path": path,
        "content": resolved.read_text(errors="replace"),
        "size": st.st_size,
        "modified": st.st_mtime,
    }


@router.post("/save")
async def save_file(body: dict = Body(...)):
    """Save (create or overwrite) a file within ~/.hermes/."""
    path_str = body.get("path", "").strip()
    content = body.get("content", "")
    if not path_str:
        raise HTTPException(400, "path is required")
    resolved = _resolve_path(path_str)
    if not path_str.endswith(".md"):
        raise HTTPException(400, "Only .md files are allowed")
    # Create parent dirs if needed
    resolved.parent.mkdir(parents=True, exist_ok=True)
    resolved.write_text(content)
    return {"status": "saved", "path": path_str}


@router.post("/create")
async def create_file(body: dict = Body(...)):
    """Create a new empty .md file in ~/.hermes/memories/."""
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(400, "name is required")
    # Sanitize
    name = name.replace("/", "").replace("\\", "").replace("..", "")
    if not name.endswith(".md"):
        name += ".md"
    if name.endswith(".lock"):
        raise HTTPException(400, "Cannot create lock files")
    path = hermes_path("memories", name)
    if path.exists():
        raise HTTPException(409, f"File '{name}' already exists")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("")
    st = path.stat()
    return {
        "status": "created",
        "name": name,
        "path": f"memories/{name}",
        "size": 0,
        "modified": st.st_mtime,
    }


@router.delete("/delete")
async def delete_file(body: dict = Body(...)):
    """Delete a file within ~/.hermes/. Cannot delete SOUL.md."""
    path_str = body.get("path", "").strip()
    if not path_str:
        raise HTTPException(400, "path is required")
    resolved = _resolve_path(path_str)
    if not resolved.exists() or not resolved.is_file():
        raise HTTPException(404, "File not found")
    if resolved.name == "SOUL.md":
        raise HTTPException(403, "Cannot delete SOUL.md — it is the agent's identity file")
    resolved.unlink()
    return {"status": "deleted", "path": path_str}
