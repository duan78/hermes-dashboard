import asyncio
import sys
import os
import yaml
from pathlib import Path
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, HTTPException, Body
from ..config import HERMES_HOME, HERMES_MEMORY_PATH
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
        sys.path.insert(0, HERMES_MEMORY_PATH)
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
    except Exception:
        pass
    return None


def _get_honcho_provider():
    """Read memory.provider from ~/.hermes/config.yaml."""
    config_path = hermes_path("config.yaml")
    if not config_path.exists():
        return None
    try:
        cfg = yaml.safe_load(config_path.read_text())
        if isinstance(cfg, dict):
            memory = cfg.get("memory", {})
            if isinstance(memory, dict):
                return memory.get("provider")
    except Exception:
        pass
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
    except Exception:
        pass
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
    config_ok = provider == "honcho"
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
            except Exception:
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
            except Exception:
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
        raise HTTPException(504, "Honcho API timed out")
    except Exception as e:
        raise HTTPException(500, f"Honcho search error: {e}")
