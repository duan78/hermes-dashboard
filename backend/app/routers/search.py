"""Global search router — searches across projects, backlog, wiki, sessions, skills."""

import json
import logging
import re
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
    """Search across all modules: projects, backlog, wiki, sessions, skills."""
    results = {
        "projects": [],
        "backlog": [],
        "wiki": [],
        "sessions": [],
        "skills": [],
    }
    query = q.lower().strip()

    # ── Search projects ──
    projects_file = HERMES_HOME / "projects.json"
    if projects_file.exists():
        try:
            with open(projects_file) as f:
                pdata = json.load(f)
            for p in pdata.get("items", []):
                if _matches(query, [p.get("name", ""), p.get("description", "")] + p.get("keywords", [])):
                    results["projects"].append({
                        "id": p.get("id"),
                        "name": p.get("name"),
                        "description": (p.get("description") or "")[:100],
                        "status": p.get("status"),
                        "type": p.get("type"),
                        "route": f"/projects",
                    })
                    if len(results["projects"]) >= limit:
                        break
        except Exception:
            pass

    # ── Search backlog ──
    backlog_file = HERMES_HOME / "backlog.json"
    if backlog_file.exists():
        try:
            with open(backlog_file) as f:
                bdata = json.load(f)
            for item in bdata.get("items", []):
                if _matches(query, [item.get("title", ""), item.get("description", "")]):
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
                    # Check frontmatter for title
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
                        # Extract first human message as preview
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

    total = sum(len(v) for v in results.values())
    return {"results": results, "total": total, "query": q}


def _matches(query: str, texts: list[str]) -> bool:
    """Check if query appears in any of the texts."""
    for text in texts:
        if query in text.lower():
            return True
    return False
