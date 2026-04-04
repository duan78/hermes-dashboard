import asyncio
import sys
from pathlib import Path
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, HTTPException, Body
from ..config import HERMES_HOME
from ..utils import hermes_path

router = APIRouter(prefix="/api/memory", tags=["memory"])

# ── Vector memory (hermes-memory / LanceDB) ──
_hermes_memory = None
_hermes_memory_error = None

def _get_hermes_memory():
    global _hermes_memory, _hermes_memory_error
    if _hermes_memory is not None:
        return _hermes_memory
    if _hermes_memory_error is not None:
        return None
    try:
        sys.path.insert(0, str(HERMES_HOME / "hermes-memory"))
        from hermes_memory import HermesMemory
        _hermes_memory = HermesMemory()
        return _hermes_memory
    except Exception as e:
        _hermes_memory_error = str(e)
        return None

_executor = ThreadPoolExecutor(max_workers=4)


@router.get("/vector/available")
async def vector_available():
    """Check if vector memory (hermes-memory / LanceDB) is available."""
    mem = _get_hermes_memory()
    if mem:
        return {"available": True}
    return {"available": False, "error": _hermes_memory_error or "hermes-memory not installed"}


def _vm_unavailable():
    raise HTTPException(503, f"Vector memory unavailable: {_hermes_memory_error or 'import failed'}")

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


# ── Vector Memory endpoints ──

@router.get("/vector/stats")
async def vector_stats():
    """Return vector memory statistics."""
    mem = _get_hermes_memory()
    if not mem:
        if _hermes_memory_error:
            _vm_unavailable()
        return {"total_memories": 0, "db_size_mb": 0, "sources": {}, "oldest": None, "newest": None}
    try:
        stats = await asyncio.to_thread(mem.stats)
        # Get source breakdown from list
        items = await asyncio.to_thread(lambda: mem.list(limit=10000))
        sources = {}
        oldest = None
        newest = None
        for item in items:
            src = item.get("source", "unknown")
            sources[src] = sources.get(src, 0) + 1
            ts = item.get("created_at")
            if ts:
                if oldest is None or ts < oldest:
                    oldest = ts
                if newest is None or ts > newest:
                    newest = ts
        return {
            "total_memories": stats.get("total_memories", len(items)),
            "db_size_mb": stats.get("db_size_mb", 0),
            "sources": sources,
            "oldest": oldest,
            "newest": newest,
        }
    except Exception as e:
        raise HTTPException(500, f"Stats error: {e}")


@router.get("/vector/list")
async def vector_list(limit: int = 50, source: str = "all"):
    """List vector memories."""
    mem = _get_hermes_memory()
    if not mem:
        if _hermes_memory_error:
            _vm_unavailable()
        return {"memories": []}
    try:
        items = await asyncio.to_thread(lambda: mem.list(limit=min(limit, 500)))
        if source != "all":
            items = [m for m in items if m.get("source") == source]
        return {"memories": items}
    except Exception as e:
        raise HTTPException(500, f"List error: {e}")


@router.get("/vector/search")
async def vector_search(q: str = "", top_k: int = 10):
    """Semantic search in vector memory."""
    if not q:
        raise HTTPException(400, "Query parameter 'q' is required")
    mem = _get_hermes_memory()
    if not mem:
        _vm_unavailable()
    try:
        results = await mem.search(query=q, top_k=min(top_k, 50))
        return {"results": results}
    except Exception as e:
        raise HTTPException(500, f"Search error: {e}")


@router.post("/vector/store")
async def vector_store(body: dict = Body(...)):
    """Store a new vector memory manually."""
    text = body.get("text", "").strip()
    if not text:
        raise HTTPException(400, "text is required")
    mem = _get_hermes_memory()
    if not mem:
        _vm_unavailable()
    try:
        memory_id = await mem.store(
            text=text,
            source=body.get("source", "manual"),
            metadata=body.get("metadata"),
        )
        return {"status": "stored", "id": memory_id}
    except Exception as e:
        raise HTTPException(500, f"Store error: {e}")


@router.delete("/vector/delete")
async def vector_delete(body: dict = Body(...)):
    """Delete a vector memory by ID."""
    memory_id = body.get("memory_id", "").strip()
    if not memory_id:
        raise HTTPException(400, "memory_id is required")
    mem = _get_hermes_memory()
    if not mem:
        _vm_unavailable()
    try:
        deleted = await mem.delete(memory_id)
        if not deleted:
            raise HTTPException(404, f"Memory '{memory_id}' not found")
        return {"status": "deleted", "id": memory_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Delete error: {e}")


@router.get("/vector/usage")
async def vector_usage():
    """Estimate Mistral embedding API usage."""
    mem = _get_hermes_memory()
    if not mem:
        if _hermes_memory_error:
            _vm_unavailable()
        return {"estimated_embed_calls": 0, "estimated_tokens": 0}
    try:
        items = await asyncio.to_thread(lambda: mem.list(limit=10000))
        total_chars = sum(len(m.get("text", "")) for m in items)
        return {
            "estimated_embed_calls": len(items),
            "estimated_tokens": int(total_chars * 1.3),
        }
    except Exception as e:
        raise HTTPException(500, f"Usage error: {e}")
