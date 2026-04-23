"""Global search router — searches across projects, backlog, wiki, sessions, skills, tags, notifications, activity."""

import json
import logging
from pathlib import Path

from fastapi import APIRouter, Query

from ..config import HERMES_HOME

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("")
async def global_search(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, le=50),
):
    """Search across all modules: projects, backlog, wiki, sessions, skills, tags, notifications, activity."""
    results = {
        "projects": [],
        "backlog": [],
        "wiki": [],
        "sessions": [],
        "skills": [],
        "tags": [],
        "notifications": [],
        "activity": [],
    }
    query = q.lower().strip()

    # ── Search projects (with tags) ──
    projects_file = HERMES_HOME / "projects.json"
    if projects_file.exists():
        try:
            with open(projects_file) as f:
                pdata = json.load(f)
            for p in pdata.get("items", []):
                search_texts = [p.get("name", ""), p.get("description", "")] + p.get("keywords", []) + p.get("tags", [])
                if _matches(query, search_texts):
                    results["projects"].append({
                        "id": p.get("id"),
                        "name": p.get("name"),
                        "description": (p.get("description") or "")[:100],
                        "status": p.get("status"),
                        "type": p.get("type"),
                        "route": "/projects",
                    })
                    if len(results["projects"]) >= limit:
                        break
        except Exception:
            pass

    # ── Search backlog (with tags) ──
    backlog_file = HERMES_HOME / "backlog.json"
    if backlog_file.exists():
        try:
            with open(backlog_file) as f:
                bdata = json.load(f)
            for item in bdata.get("items", []):
                search_texts = [item.get("title", ""), item.get("description", "")] + item.get("tags", [])
                if _matches(query, search_texts):
                    results["backlog"].append({
                        "id": item.get("id"),
                        "title": item.get("title"),
                        "status": item.get("status"),
                        "priority": item.get("priority"),
                        "category": item.get("category"),
                        "route": "/backlog",
                    })
                    if len(results["backlog"]) >= limit:
                        break
        except Exception:
            pass

    # ── Search wiki pages ──
    wiki_path = Path.home() / "wiki"
    if wiki_path.exists():
        for subdir in ["entities", "concepts", "comparisons", "queries"]:
            dir_path = wiki_path / subdir
            if not dir_path.exists():
                continue
            for f in sorted(dir_path.glob("*.md")):
                try:
                    content = f.read_text(errors="ignore")
                    title = f.stem.replace("-", " ").title()
                    if content.startswith("---"):
                        fm_end = content.find("---", 3)
                        if fm_end > 0:
                            fm = content[3:fm_end]
                            for line in fm.splitlines():
                                if line.startswith("title:"):
                                    title = line.split(":", 1)[1].strip()
                                    break
                    if _matches(query, [title, content[:500]]):
                        results["wiki"].append({
                            "id": f"{subdir}/{f.stem}",
                            "name": title,
                            "type": subdir,
                            "route": "/wiki",
                        })
                        if len(results["wiki"]) >= limit:
                            break
                except Exception:
                    continue

    # ── Search sessions ──
    sessions_dir = HERMES_HOME / "sessions"
    if sessions_dir.exists():
        try:
            files = sorted(sessions_dir.glob("*.jsonl"), reverse=True)[:100]
            for sf in files:
                try:
                    content = sf.read_text(errors="ignore")
                    if query in content.lower():
                        preview = ""
                        for line in content.split("\n")[:10]:
                            try:
                                entry = json.loads(line)
                                if entry.get("type") == "human":
                                    preview = (entry.get("message", "") or "")[:120]
                                    break
                            except (json.JSONDecodeError, Exception):
                                pass
                        results["sessions"].append({
                            "id": sf.stem,
                            "name": sf.stem,
                            "preview": preview,
                            "route": "/sessions",
                        })
                        if len(results["sessions"]) >= limit:
                            break
                except Exception:
                    continue
        except Exception:
            pass

    # ── Search skills ──
    skills_dir = HERMES_HOME / "skills"
    if skills_dir.exists():
        try:
            for sf in sorted(skills_dir.glob("*.md")):
                try:
                    content = sf.read_text(errors="ignore")
                    name = sf.stem
                    if _matches(query, [name, content[:500]]):
                        results["skills"].append({
                            "id": name,
                            "name": name,
                            "route": "/skills",
                        })
                        if len(results["skills"]) >= limit:
                            break
                except Exception:
                    continue
        except Exception:
            pass

    # ── Search tags ──
    tags_file = HERMES_HOME / "tags.json"
    if tags_file.exists():
        try:
            with open(tags_file) as f:
                tdata = json.load(f)
            for t in tdata.get("items", []):
                if query in t.get("name", "").lower():
                    results["tags"].append({
                        "id": t.get("id"),
                        "name": t.get("name"),
                        "color": t.get("color"),
                        "route": "/projects",
                    })
        except Exception:
            pass

    # ── Search notifications ──
    notifs_file = HERMES_HOME / "notifications.json"
    if notifs_file.exists():
        try:
            with open(notifs_file) as f:
                ndata = json.load(f)
            for n in ndata.get("items", []):
                if _matches(query, [n.get("title", ""), n.get("description", "")]):
                    results["notifications"].append({
                        "id": n.get("id"),
                        "name": n.get("title", "")[:60],
                        "type": n.get("type"),
                        "status": n.get("status"),
                        "route": "/activity",
                    })
                    if len(results["notifications"]) >= 10:
                        break
        except Exception:
            pass

    # ── Search activity ──
    activity_file = HERMES_HOME / "activity.json"
    if activity_file.exists():
        try:
            with open(activity_file) as f:
                adata = json.load(f)
            for e in adata.get("entries", []):
                if _matches(query, [e.get("entity_name", ""), e.get("action", ""), json.dumps(e.get("details", {}))]):
                    results["activity"].append({
                        "id": e.get("id"),
                        "name": f"{e.get('action', '')} — {e.get('entity_name', '')}",
                        "type": e.get("entity_type"),
                        "route": "/activity",
                    })
                    if len(results["activity"]) >= 10:
                        break
        except Exception:
            pass

    total = sum(len(v) for v in results.values())
    return {"results": results, "total": total, "query": q}


def _matches(query: str, texts: list[str]) -> bool:
    """Check if query appears in any of the texts."""
    for text in texts:
        if query in text.lower():
            return True
    return False
