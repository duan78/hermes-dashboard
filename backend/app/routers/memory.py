import asyncio
import logging
import sys
import os
import yaml
from pathlib import Path
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, HTTPException
from ..config import HERMES_HOME
from ..utils import hermes_path
from ..schemas.requests import (
    ContentSaveRequest, MemoryFileSaveRequest, MemoryFileCreateRequest,
    MemoryFileDeleteRequest, VectorStoreRequest, VectorDeleteRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/memory", tags=["memory"])

# ── Vector memory (memory-claw / LanceDB) ──
_claw_store = None
_claw_embedder = None
_claw_error = None

# Path to memory-claw source (for direct import, not from venv)
_HERMES_AGENT_PATH = "/root/.hermes/hermes-agent"
_MEMORY_CLAW_DB_PATH = str(HERMES_HOME / "memory-claw")


def _get_claw():
    """Lazy-load MemoryStore + MistralEmbedder from memory-claw plugin."""
    global _claw_store, _claw_embedder, _claw_error
    if _claw_store is not None:
        return _claw_store, _claw_embedder
    if _claw_error is not None:
        return None, None
    try:
        # Add hermes-agent source to sys.path for plugin imports
        if _HERMES_AGENT_PATH not in sys.path:
            sys.path.insert(0, _HERMES_AGENT_PATH)

        # Ensure MISTRAL_API_KEY is available (may be in ~/.hermes/.env)
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

        from plugins.memory.memory_claw.store import MemoryStore
        from plugins.memory.memory_claw.embedder import MistralEmbedder

        _claw_store = MemoryStore(_MEMORY_CLAW_DB_PATH)
        _claw_store.open()
        _claw_embedder = MistralEmbedder(api_key=api_key)
        logger.info("memory-claw: loaded store from %s", _MEMORY_CLAW_DB_PATH)
        return _claw_store, _claw_embedder
    except Exception as e:
        _claw_error = str(e)
        logger.warning("memory-claw: failed to load: %s", e)
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


# ── Honcho Memory ──
_honcho_client = None
_honcho_available = None
_honcho_error = None


def _get_honcho_api_key():
    """Read HONCHO_API_KEY from ~/.hermes/.env."""
    env_path = hermes_path(".env")
    if not env_path.exists():
        return None
    try:
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line.startswith("HONCHO_API_KEY="):
                return line.split("=", 1)[1].strip()
    except Exception as e:
        logger.debug("Error reading HONCHO_API_KEY from .env: %s", e)
    return None


def _get_honcho_provider():
    """Read memory.provider from ~/.hermes/config.yaml.
    
    Supports both string ("honcho") and list (["honcho", "memory_claw"]) formats.
    Returns True if 'honcho' is in the provider list, False otherwise.
    """
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        return None
    try:
        cfg = yaml.safe_load(config_path.read_text())
        if isinstance(cfg, dict):
            memory = cfg.get("memory", {})
            if isinstance(memory, dict):
                provider = memory.get("provider")
                if isinstance(provider, list):
                    return "honcho" in provider
                return provider == "honcho"
    except Exception as e:
        logger.debug("Error reading memory provider from config: %s", e)
    return None


def _get_honcho_workspace_id():
    """Read honcho.workspace_id from ~/.hermes/config.yaml."""
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        return "hermes"
    try:
        cfg = yaml.safe_load(config_path.read_text())
        if isinstance(cfg, dict):
            honcho = cfg.get("honcho", {})
            if isinstance(honcho, dict):
                wid = honcho.get("workspace_id", "").strip()
                if wid:
                    return wid
    except Exception as e:
        logger.debug("Error reading honcho workspace_id from config: %s", e)
    return "hermes"


def _get_honcho_client():
    global _honcho_client, _honcho_available, _honcho_error
    if _honcho_available is not None:
        return _honcho_client if _honcho_available else None
    if _honcho_error is not None:
        return None
    try:
        from honcho import Honcho
        api_key = _get_honcho_api_key()
        if not api_key:
            _honcho_available = False
            _honcho_error = "HONCHO_API_KEY not found in ~/.hermes/.env"
            return None
        workspace_id = _get_honcho_workspace_id()
        _honcho_client = Honcho(api_key=api_key, workspace_id=workspace_id, timeout=10)
        # Test connectivity (best effort — don't block if API is slow)
        try:
            _honcho_client.get_configuration()
            _honcho_available = True
        except Exception as e:
            _honcho_available = False
            _honcho_error = str(e)
            _honcho_client = None
        return _honcho_client if _honcho_available else None
    except Exception as e:
        _honcho_available = False
        _honcho_error = str(e)
        return None


async def _get_honcho_client_async():
    """Async wrapper for _get_honcho_client with timeout protection."""
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_get_honcho_client),
            timeout=12
        )
    except asyncio.TimeoutError:
        global _honcho_available, _honcho_error
        _honcho_available = False
        _honcho_error = "Connection timed out"
        return None


def _honcho_unavailable():
    raise HTTPException(503, f"Honcho unavailable: {_honcho_error or 'not configured'}")


def _serialize_message(msg):
    """Serialize a Honcho Message object to dict."""
    d = {
        "id": getattr(msg, "id", None),
        "content": getattr(msg, "content", ""),
        "peer_id": getattr(msg, "peer_id", None),
        "session_id": getattr(msg, "session_id", None),
        "workspace_id": getattr(msg, "workspace_id", None),
        "metadata": getattr(msg, "metadata", {}),
        "token_count": getattr(msg, "token_count", 0),
    }
    created = getattr(msg, "created_at", None)
    if created:
        if isinstance(created, datetime):
            d["created_at"] = created.isoformat()
        else:
            d["created_at"] = str(created)
    return d


def _serialize_session(s):
    """Serialize a Honcho Session object to dict."""
    d = {
        "id": getattr(s, "id", None),
        "is_active": getattr(s, "is_active", None),
    }
    created = getattr(s, "created_at", None)
    if created:
        if isinstance(created, datetime):
            d["created_at"] = created.isoformat()
        else:
            d["created_at"] = str(created)
    return d


@router.get("/honcho/status")
async def honcho_status():
    """Check if Honcho memory is configured and functional."""
    provider = _get_honcho_provider()
    api_key = _get_honcho_api_key()
    config_ok = provider is True
    key_ok = bool(api_key)

    if not config_ok or not key_ok:
        return {
            "available": False,
            "configured": config_ok,
            "api_key_set": key_ok,
            "error": "Not configured as memory provider" if not config_ok else "API key missing",
        }

    # Try to connect with a timeout
    client = await _get_honcho_client_async()
    if client:
        return {"available": True, "configured": True, "api_key_set": True}
    return {
        "available": False,
        "configured": True,
        "api_key_set": True,
        "error": _honcho_error or "Connection failed",
    }


@router.get("/honcho/stats")
async def honcho_stats():
    """Get Honcho memory statistics."""
    client = _get_honcho_client()
    if not client:
        _honcho_unavailable()
    try:
        results = await asyncio.wait_for(
            asyncio.gather(
                asyncio.to_thread(lambda: client.sessions(page=1, size=1)),
                asyncio.to_thread(lambda: client.peers(page=1, size=1)),
                asyncio.to_thread(client.get_metadata),
                asyncio.to_thread(client.get_configuration),
            ),
            timeout=15,
        )
        sessions_page, peers_page, metadata, config = results
        return {
            "total_sessions": sessions_page.total,
            "total_peers": peers_page.total,
            "metadata": metadata or {},
            "configuration": str(config),
        }
    except asyncio.TimeoutError:
        raise HTTPException(504, "Honcho API timed out")
    except Exception as e:
        raise HTTPException(500, f"Honcho stats error: {e}")


@router.get("/honcho/profile")
async def honcho_profile():
    """Get Honcho user profile (peers + configuration)."""
    client = _get_honcho_client()
    if not client:
        _honcho_unavailable()
    try:
        results = await asyncio.wait_for(
            asyncio.gather(
                asyncio.to_thread(lambda: client.peers(page=1, size=50)),
                asyncio.to_thread(client.get_configuration),
                asyncio.to_thread(client.get_metadata),
            ),
            timeout=15,
        )
        peers_page, config, metadata = results

        peers_data = []
        for p in peers_page.items:
            peer_info = {
                "id": getattr(p, "id", None),
                "created_at": str(getattr(p, "created_at", "")),
            }
            try:
                card = await asyncio.wait_for(asyncio.to_thread(p.get_card), timeout=5)
                peer_info["card"] = card
            except Exception as e:
                logger.debug("Failed to get peer card: %s", e)
                peer_info["card"] = None
            peers_data.append(peer_info)

        return {
            "peers": peers_data,
            "total_peers": peers_page.total,
            "configuration": str(config),
            "metadata": metadata or {},
        }
    except asyncio.TimeoutError:
        raise HTTPException(504, "Honcho API timed out")
    except Exception as e:
        raise HTTPException(500, f"Honcho profile error: {e}")


@router.get("/honcho/memories")
async def honcho_memories(limit: int = 50):
    """List recent Honcho sessions (as memory context)."""
    client = _get_honcho_client()
    if not client:
        _honcho_unavailable()
    try:
        sessions_page = await asyncio.wait_for(
            asyncio.to_thread(
                lambda: client.sessions(page=1, size=min(limit, 100), reverse=True)
            ),
            timeout=15,
        )
        sessions_data = []
        for s in sessions_page.items:
            s_dict = _serialize_session(s)
            # Try to get summaries for each session
            try:
                summaries = await asyncio.wait_for(asyncio.to_thread(s.summaries), timeout=5)
                s_dict["summary"] = {
                    "short": getattr(summaries, "short_summary", None),
                    "long": getattr(summaries, "long_summary", None),
                }
            except Exception as e:
                logger.debug("Failed to get session summary: %s", e)
                s_dict["summary"] = None
            sessions_data.append(s_dict)

        return {"memories": sessions_data, "total": sessions_page.total}
    except asyncio.TimeoutError:
        raise HTTPException(504, "Honcho API timed out")
    except Exception as e:
        raise HTTPException(500, f"Honcho memories error: {e}")


@router.get("/honcho/search")
async def honcho_search(q: str = "", top_k: int = 10):
    """Semantic search in Honcho memory."""
    if not q:
        raise HTTPException(400, "Query parameter 'q' is required")
    client = _get_honcho_client()
    if not client:
        _honcho_unavailable()
    try:
        results = await asyncio.wait_for(
            asyncio.to_thread(
                lambda: client.search(query=q, limit=min(top_k, 100))
            ),
            timeout=15,
        )
        serialized = [_serialize_message(m) for m in results]
        return {"results": serialized, "count": len(serialized)}
    except asyncio.TimeoutError:
        raise HTTPException(504, "Honcho search timed out")
    except Exception as e:
        raise HTTPException(500, f"Honcho search error: {e}")


# ── Brain Search (unified search across all 3 memory systems) ──

@router.get("/brain/search")
async def brain_search(q: str = "", top_k: int = 5):
    """Unified search across Memory Claw (LanceDB), Honcho, Backlog, and Wiki.
    
    Queries all available systems in parallel and returns merged results.
    Each system is optional — if one is down or empty, it's simply skipped.
    """
    if not q or len(q.strip()) < 2:
        raise HTTPException(400, "Query parameter 'q' is required (min 2 chars)")
    
    q = q.strip()
    top_k = min(top_k, 20)
    results = {}
    errors = {}
    
    # 1. Memory Claw (LanceDB vector search)
    try:
        claw_results = await asyncio.wait_for(
            asyncio.to_thread(_brain_search_claw, q, top_k),
            timeout=10,
        )
        results["claw"] = claw_results
    except Exception as e:
        errors["claw"] = str(e)
        results["claw"] = []
    
    # 2. Honcho semantic search
    try:
        honcho_results = await _brain_search_honcho(q, top_k)
        results["honcho"] = honcho_results
    except Exception as e:
        errors["honcho"] = str(e)
        results["honcho"] = []
    
    # 3. Backlog text search
    try:
        backlog_results = await asyncio.to_thread(_brain_search_backlog, q, top_k)
        results["backlog"] = backlog_results
    except Exception as e:
        errors["backlog"] = str(e)
        results["backlog"] = []
    
    # 4. Wiki text search
    try:
        wiki_results = await asyncio.to_thread(_brain_search_wiki, q, top_k)
        results["wiki"] = wiki_results
    except Exception as e:
        errors["wiki"] = str(e)
        results["wiki"] = []
    
    total = sum(len(v) for v in results.values())
    return {
        "query": q,
        "results": results,
        "total": total,
        "errors": errors if errors else None,
    }


def _brain_search_claw(q: str, top_k: int) -> list:
    """Search Memory Claw (LanceDB) for relevant memories."""
    global _claw_store, _claw_embedder, _claw_error
    
    if _claw_error or not _claw_store or not _claw_embedder:
        return []
    
    try:
        query_embedding = _claw_embedder.embed(q)
        if not query_embedding:
            return []
        search_results = _claw_store.search(query_embedding, limit=top_k)

        items = []
        for r in search_results:
            items.append({
                "id": r.get("id", ""),
                "content": r.get("text", ""),
                "source": r.get("source", ""),
                "importance": r.get("importance", 0),
                "created_at": r.get("created_at", ""),
                "score": r.get("score"),
            })
        return items
    except Exception:
        return []


async def _brain_search_honcho(q: str, top_k: int) -> list:
    """Search Honcho memory for relevant context."""
    client = _get_honcho_client()
    if not client:
        return []
    
    try:
        honcho_results = await asyncio.wait_for(
            asyncio.to_thread(lambda: client.search(query=q, limit=top_k)),
            timeout=8,
        )
        items = []
        for m in honcho_results:
            items.append({
                "id": getattr(m, "id", None),
                "content": getattr(m, "content", ""),
                "peer_id": getattr(m, "peer_id", None),
                "created_at": getattr(m, "created_at", None),
            })
        return items
    except Exception:
        return []


def _brain_search_backlog(q: str, top_k: int) -> list:
    """Search backlog items by text matching."""
    import json, re
    
    backlog_path = hermes_path("backlog.json")
    if not backlog_path.exists():
        return []
    
    try:
        with open(backlog_path) as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return []
    
    items = data.get("items", [])
    if not items:
        return []
    
    # Simple relevance scoring based on word overlap
    q_words = set(re.findall(r"\w+", q.lower()))
    if not q_words:
        return []
    
    scored = []
    for item in items:
        text = f"{item.get('title', '')} {item.get('description', '')}".lower()
        text_words = set(re.findall(r"\w+", text))
        overlap = len(q_words & text_words)
        if overlap > 0:
            scored.append((item, overlap))
    
    scored.sort(key=lambda x: x[1], reverse=True)
    
    results = []
    for item, score in scored[:top_k]:
        results.append({
            "id": item.get("id", ""),
            "title": item.get("title", ""),
            "description": item.get("description", "")[:200],
            "category": item.get("category", ""),
            "status": item.get("status", ""),
            "priority": item.get("priority", ""),
            "score": score,
        })
    return results


def _brain_search_wiki(q: str, top_k: int) -> list:
    """Search wiki pages by text matching."""
    import json, re, os
    
    wiki_root = Path(os.path.expanduser("~/wiki"))
    if not wiki_root.exists():
        return []
    
    q_words = set(re.findall(r"\w+", q.lower()))
    if not q_words:
        return []
    
    # Search in wiki index and page files
    scored = []
    
    # Read index.md for page list
    index_path = wiki_root / "index.md"
    if index_path.exists():
        content = index_path.read_text(errors="ignore")
        lines = content.splitlines()
        for line in lines:
            # Wiki index format: - [Page Title](path)
            match = re.match(r"-\s+\[([^\]]+)\]\(([^)]+)\)", line)
            if match:
                title, rel_path = match.groups()
                full_path = wiki_root / rel_path
                if not full_path.exists():
                    full_path = wiki_root / (rel_path + ".md")
                
                score = len(q_words & set(re.findall(r"\w+", title.lower())))
                score += len(q_words & set(re.findall(r"\w+", rel_path.lower())))
                
                if score > 0:
                    scored.append({
                        "title": title,
                        "path": rel_path,
                        "content_preview": "",
                        "score": score,
                    })
    
    # Search in individual page files
    for md_file in wiki_root.rglob("*.md"):
        if md_file.name in ("index.md", "log.md", "SCHEMA.md"):
            continue
        try:
            content = md_file.read_text(errors="ignore")[:1000]
            text_words = set(re.findall(r"\w+", content.lower()))
            overlap = len(q_words & text_words)
            if overlap > 1:
                rel = str(md_file.relative_to(wiki_root))
                title = md_file.stem
                # Check if already scored from index
                existing = next((s for s in scored if s["path"] == rel or s["path"] == rel.replace(".md", "")), None)
                if existing:
                    existing["score"] += overlap
                    existing["content_preview"] = content[:200].replace("\n", " ").strip()
                else:
                    scored.append({
                        "title": title,
                        "path": rel,
                        "content_preview": content[:200].replace("\n", " ").strip(),
                        "score": overlap,
                    })
        except (OSError, IOError):
            continue
    
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_k]
