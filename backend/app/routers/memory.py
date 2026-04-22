import asyncio
import logging
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi import APIRouter, HTTPException

from ..config import HERMES_HOME
from ..schemas.requests import (
    ContentSaveRequest,
    MemoryFileCreateRequest,
    MemoryFileDeleteRequest,
    MemoryFileSaveRequest,
    VectorDeleteRequest,
    VectorStoreRequest,
)
from ..utils import hermes_path

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/memory", tags=["memory"])

# ── Vector memory (LanceDB) ──
_claw_store = None
_claw_embedder = None
_claw_error = None

_MEMORY_CLAW_DB_PATH = str(HERMES_HOME / "memory.lance")


class _LanceDBStore:
    """Lightweight LanceDB wrapper compatible with the dashboard's vector memory interface."""

    def __init__(self, db_path: str):
        import lancedb
        self._db = lancedb.connect(db_path)
        tables = list(self._db.table_names())
        if "memories" not in tables:
            raise RuntimeError(f"No 'memories' table in {db_path} (tables: {tables})")
        self._table = self._db.open_table("memories")

    def get_stats(self) -> dict:
        return {"total": self._table.count_rows()}

    def search(self, vector: list, limit: int = 10) -> list[dict]:
        results = self._table.search(vector).limit(limit).to_list()
        out = []
        for r in results:
            r.pop("vector", None)
            if "_distance" in r:
                r["score"] = 1.0 / (1.0 + r.pop("_distance"))
            out.append(r)
        return out

    def add(self, text: str, vector: list, importance: float = 0.5,
            category: str = "fact", source: str = "manual") -> str:
        import time
        import uuid
        memory_id = str(uuid.uuid4())
        self._table.add([{
            "id": memory_id,
            "text": text,
            "vector": vector,
            "source": source,
            "session_id": "",
            "created_at": time.time(),
            "metadata": "",
        }])
        return memory_id

    def delete(self, memory_id: str) -> bool:
        try:
            self._table.delete(f"id = '{memory_id}'")
            return True
        except Exception:
            return False


def _get_claw():
    """Lazy-load LanceDB store + optional embedder."""
    global _claw_store, _claw_embedder, _claw_error
    if _claw_store is not None:
        return _claw_store, _claw_embedder
    if _claw_error is not None:
        return None, None
    try:
        _claw_store = _LanceDBStore(_MEMORY_CLAW_DB_PATH)
        logger.info("LanceDB: loaded store from %s", _MEMORY_CLAW_DB_PATH)

        # Embedder is optional — needed for semantic search/store only
        try:
            _HERMES_AGENT_PATH = "/root/.hermes/hermes-agent"
            if _HERMES_AGENT_PATH not in sys.path:
                sys.path.insert(0, _HERMES_AGENT_PATH)

            api_key = os.environ.get("MISTRAL_API_KEY", "")
            if not api_key:
                env_path = HERMES_HOME / ".env"
                if env_path.exists():
                    for line in env_path.read_text().splitlines():
                        line = line.strip()
                        if line.startswith("MISTRAL_API_KEY="):
                            api_key = line.split("=", 1)[1].strip().strip("\"'")
                            os.environ["MISTRAL_API_KEY"] = api_key
                            break

            from plugins.memory.memory_claw.embedder import MistralEmbedder
            _claw_embedder = MistralEmbedder(api_key=api_key)
        except Exception as e:
            logger.debug("Embedder not available (search/store will be limited): %s", e)
            _claw_embedder = None

        return _claw_store, _claw_embedder
    except Exception as e:
        _claw_error = str(e)
        logger.warning("LanceDB: failed to load: %s", e)
        return None, None

_executor = ThreadPoolExecutor(max_workers=4)


@router.get("/vector/available")
async def vector_available():
    """Check if vector memory (memory-claw / LanceDB) is available."""
    store, embedder = _get_claw()
    if store:
        return {"available": True}
    return {"available": False, "error": _claw_error or "memory-claw not available"}


def _vm_unavailable():
    raise HTTPException(503, f"Vector memory unavailable: {_claw_error or 'import failed'}")

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
async def save_soul(body: ContentSaveRequest):
    """Save SOUL.md."""
    logger.info("Saving SOUL.md (%d chars)", len(body.content))
    path = hermes_path("SOUL.md")
    path.write_text(body.content)
    return {"status": "saved"}


@router.get("/memory")
async def get_memory():
    """Read MEMORY.md."""
    path = hermes_path("memories", "MEMORY.md")
    if not path.exists():
        return {"content": "", "exists": False}
    return {"content": path.read_text(), "exists": True}


@router.put("/memory")
async def save_memory(body: ContentSaveRequest):
    """Save MEMORY.md."""
    path = hermes_path("memories", "MEMORY.md")
    path.write_text(body.content)
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
async def save_memory_file(filename: str, body: ContentSaveRequest):
    """Save a memory file."""
    if "/" in filename or ".." in filename:
        raise HTTPException(400, "Invalid filename")
    path = hermes_path("memories", filename)
    path.write_text(body.content)
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
async def save_file(body: MemoryFileSaveRequest):
    """Save (create or overwrite) a file within ~/.hermes/."""
    path_str = body.path.strip()
    if not path_str:
        raise HTTPException(400, "path is required")
    resolved = _resolve_path(path_str)
    if not path_str.endswith(".md"):
        raise HTTPException(400, "Only .md files are allowed")
    # Create parent dirs if needed
    resolved.parent.mkdir(parents=True, exist_ok=True)
    resolved.write_text(body.content)
    return {"status": "saved", "path": path_str}


@router.post("/create")
async def create_file(body: MemoryFileCreateRequest):
    """Create a new empty .md file in ~/.hermes/memories/."""
    name = body.name.strip()
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
async def delete_file(body: MemoryFileDeleteRequest):
    """Delete a file within ~/.hermes/. Cannot delete SOUL.md."""
    path_str = body.path.strip()
    if not path_str:
        raise HTTPException(400, "path is required")
    resolved = _resolve_path(path_str)
    if not resolved.exists() or not resolved.is_file():
        raise HTTPException(404, "File not found")
    if resolved.name == "SOUL.md":
        raise HTTPException(403, "Cannot delete SOUL.md — it is the agent's identity file")
    resolved.unlink()
    return {"status": "deleted", "path": path_str}


# ── Vector Memory endpoints (memory-claw backend) ──

@router.get("/vector/stats")
async def vector_stats():
    """Return vector memory statistics."""
    store, embedder = _get_claw()
    if not store:
        if _claw_error:
            _vm_unavailable()
        return {"total_memories": 0, "db_size_mb": 0, "sources": {}, "oldest": None, "newest": None}
    try:
        stats = await asyncio.to_thread(store.get_stats)
        total = stats.get("total", 0)

        # Compute db_size_mb from the LanceDB directory
        db_size_mb = 0.0
        db_path = Path(_MEMORY_CLAW_DB_PATH)
        if db_path.exists():
            try:
                db_size_mb = sum(
                    f.stat().st_size for f in db_path.rglob("*") if f.is_file()
                ) / (1024 * 1024)
            except Exception:
                pass

        # Get source breakdown and timestamps by listing all memories
        sources = {}
        oldest = None
        newest = None
        if total > 0:
            items = await asyncio.to_thread(lambda: store.search([0.0] * 1024, limit=min(total, 10000)))
            for item in items:
                src = item.get("source", "unknown") or "unknown"
                sources[src] = sources.get(src, 0) + 1
                ts = item.get("created_at", "")
                if ts:
                    if oldest is None or ts < oldest:
                        oldest = ts
                    if newest is None or ts > newest:
                        newest = ts

        return {
            "total_memories": total,
            "db_size_mb": round(db_size_mb, 2),
            "sources": sources,
            "oldest": oldest,
            "newest": newest,
        }
    except Exception as e:
        raise HTTPException(500, f"Stats error: {e}")


@router.get("/vector/list")
async def vector_list(limit: int = 50, source: str = "all"):
    """List vector memories."""
    store, embedder = _get_claw()
    if not store:
        if _claw_error:
            _vm_unavailable()
        return {"memories": []}
    try:
        # Use zero-vector search to list all memories
        items = await asyncio.to_thread(lambda: store.search([0.0] * 1024, limit=min(limit, 500)))
        if source != "all":
            items = [m for m in items if m.get("source") == source]
        # Map claw fields → frontend-expected fields
        memories = []
        for item in items:
            memories.append({
                "id": item.get("id", ""),
                "text": item.get("text", ""),
                "score": item.get("score"),
                "source": item.get("source", ""),
                "created_at": item.get("created_at", ""),
                "importance": item.get("importance"),
                "category": item.get("category", ""),
                "tier": item.get("tier", ""),
                "tags": item.get("tags", []),
                "hit_count": item.get("hit_count", 0),
            })
        return {"memories": memories}
    except Exception as e:
        raise HTTPException(500, f"List error: {e}")


@router.get("/vector/search")
async def vector_search(q: str = "", top_k: int = 10):
    """Semantic search in vector memory."""
    if not q:
        raise HTTPException(400, "Query parameter 'q' is required")
    store, embedder = _get_claw()
    if not store or not embedder:
        _vm_unavailable()
    try:
        vector = await asyncio.to_thread(lambda: embedder.embed(q))
        if not vector:
            raise HTTPException(502, "Failed to generate embedding for query")
        results = await asyncio.to_thread(lambda: store.search(vector, limit=min(top_k, 50)))
        # Map fields for frontend
        mapped = []
        for item in results:
            mapped.append({
                "id": item.get("id", ""),
                "text": item.get("text", ""),
                "score": item.get("score"),
                "source": item.get("source", ""),
                "created_at": item.get("created_at", ""),
                "importance": item.get("importance"),
                "category": item.get("category", ""),
                "tier": item.get("tier", ""),
                "tags": item.get("tags", []),
                "hit_count": item.get("hit_count", 0),
            })
        return {"results": mapped}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Search error: {e}")


@router.post("/vector/store")
async def vector_store(body: VectorStoreRequest):
    """Store a new vector memory manually."""
    store, embedder = _get_claw()
    if not store or not embedder:
        _vm_unavailable()
    try:
        vector = await asyncio.to_thread(lambda: embedder.embed(body.text))
        if not vector:
            raise HTTPException(502, "Failed to generate embedding for text")
        memory_id = await asyncio.to_thread(
            lambda: store.add(
                text=body.text,
                vector=vector,
                importance=0.5,
                category="fact",
                source=body.source or "manual",
            )
        )
        if not memory_id:
            raise HTTPException(500, "Failed to store memory in LanceDB")
        return {"status": "stored", "id": memory_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Store error: {e}")


@router.delete("/vector/delete")
async def vector_delete(body: VectorDeleteRequest):
    """Delete a vector memory by ID."""
    store, embedder = _get_claw()
    if not store:
        _vm_unavailable()
    try:
        deleted = await asyncio.to_thread(lambda: store.delete(body.memory_id))
        if not deleted:
            raise HTTPException(404, f"Memory '{body.memory_id}' not found")
        return {"status": "deleted", "id": body.memory_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Delete error: {e}")


@router.get("/vector/usage")
async def vector_usage():
    """Estimate Mistral embedding API usage."""
    store, embedder = _get_claw()
    if not store:
        if _claw_error:
            _vm_unavailable()
        return {"estimated_embed_calls": 0, "estimated_tokens": 0}
    try:
        stats = await asyncio.to_thread(store.get_stats)
        total = stats.get("total", 0)
        # Estimate tokens from listing all memory texts
        total_chars = 0
        if total > 0:
            items = await asyncio.to_thread(lambda: store.search([0.0] * 1024, limit=min(total, 10000)))
            total_chars = sum(len(m.get("text", "")) for m in items)
        return {
            "estimated_embed_calls": total,
            "estimated_tokens": int(total_chars * 1.3),
        }
    except Exception as e:
        raise HTTPException(500, f"Usage error: {e}")


