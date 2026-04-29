import logging
import os
import re
from pathlib import Path

from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/wiki", tags=["wiki"])

WIKI_PATH = Path(os.path.expanduser("~/wiki"))
SCHEMA_PATH = WIKI_PATH / "SCHEMA.md"
INDEX_PATH = WIKI_PATH / "index.md"
LOG_PATH = WIKI_PATH / "log.md"

DIRECTORIES = {
    "entities": WIKI_PATH / "entities",
    "concepts": WIKI_PATH / "concepts",
    "comparisons": WIKI_PATH / "comparisons",
    "queries": WIKI_PATH / "queries",
    "raw_articles": WIKI_PATH / "raw" / "articles",
    "raw_papers": WIKI_PATH / "raw" / "papers",
    "raw_transcripts": WIKI_PATH / "raw" / "transcripts",
}

@router.get("/stats")
async def wiki_stats():
    """Get wiki overview statistics."""
    if not WIKI_PATH.exists():
        return {"exists": False}

    stats = {
        "exists": True,
        "total_pages": 0,
        "by_type": {},
        "total_sources": 0,
        "sources_by_type": {},
        "schema_tags": [],
        "log_entries": 0,
        "index_entries": 0,
    }

    # Count wiki pages
    for name, dir_path in DIRECTORIES.items():
        if name.startswith("raw_"):
            count = len(list(dir_path.glob("*.*"))) if dir_path.exists() else 0
            stats["sources_by_type"][name.replace("raw_", "")] = count
            stats["total_sources"] += count
        else:
            pages = list(dir_path.glob("*.md")) if dir_path.exists() else []
            stats["by_type"][name] = len(pages)
            stats["total_pages"] += len(pages)

    # Extract tags from SCHEMA.md
    if SCHEMA_PATH.exists():
        content = SCHEMA_PATH.read_text()
        tags = re.findall(r"-\s+\*\*(\w[\w\s/&-]*\w)\*\*", content)
        stats["schema_tags"] = tags[:30]

    # Count log entries
    if LOG_PATH.exists():
        stats["log_entries"] = len([l for l in LOG_PATH.read_text().splitlines() if l.startswith("## [")])

    # Count index entries
    if INDEX_PATH.exists():
        stats["index_entries"] = len([l for l in INDEX_PATH.read_text().splitlines() if l.strip().startswith("-") or l.strip().startswith("*")])

    return stats


@router.get("/schema")
async def wiki_schema():
    """Return the wiki SCHEMA.md content."""
    if not SCHEMA_PATH.exists():
        return {"content": "", "exists": False}
    return {"content": SCHEMA_PATH.read_text(), "exists": True}

@router.get("/index")
async def wiki_index():
    """Get the wiki index.md content."""
    if not INDEX_PATH.exists():
        return {"content": "# Wiki Index\n\nNo index yet.", "pages": []}

    content = INDEX_PATH.read_text()
    pages = []
    for line in content.splitlines():
        line = line.strip()
        if line.startswith("- ") or line.startswith("* "):
            pages.append(line)

    return {"content": content, "pages": pages}

@router.get("/log")
async def wiki_log(limit: int = Query(default=20, le=100)):
    """Get recent wiki log entries."""
    if not LOG_PATH.exists():
        return {"entries": []}

    content = LOG_PATH.read_text()
    lines = content.splitlines()

    entries = []
    current_entry = None
    for line in reversed(lines):
        if line.startswith("## ["):
            if current_entry:
                entries.append(current_entry)
            current_entry = {"header": line, "details": []}
        elif current_entry and line.strip():
            current_entry["details"].append(line)
    if current_entry:
        entries.append(current_entry)

    entries = list(reversed(entries[:limit]))

    return {"entries": entries, "total": len([l for l in lines if l.startswith("## [")])}

@router.get("/pages")
async def wiki_pages(type: str = Query(default=None, description="Filter by type")):
    """List all wiki pages with metadata."""
    if not WIKI_PATH.exists():
        return {"pages": []}

    pages = []
    dirs_to_scan = []
    if type and type in DIRECTORIES:
        dirs_to_scan.append((type, DIRECTORIES[type]))
    else:
        for name, dir_path in DIRECTORIES.items():
            if not name.startswith("raw_"):
                dirs_to_scan.append((name, dir_path))

    for page_type, dir_path in dirs_to_scan:
        if not dir_path.exists():
            continue
        for f in sorted(dir_path.glob("*.md")):
            content = f.read_text()
            title = f.stem.replace("-", " ").title()
            tags = []
            updated = None
            created = None

            if content.startswith("---"):
                fm_end = content.find("---", 3)
                if fm_end > 0:
                    fm = content[3:fm_end]
                    for line in fm.splitlines():
                        if line.startswith("title:"):
                            title = line.split(":", 1)[1].strip()
                        elif line.startswith("tags:"):
                            tags_str = line.split(":", 1)[1].strip().strip("[]")
                            tags = [t.strip() for t in tags_str.split(",") if t.strip()]
                        elif line.startswith("updated:"):
                            updated = line.split(":", 1)[1].strip()
                        elif line.startswith("created:"):
                            created = line.split(":", 1)[1].strip()

            pages.append({
                "name": f.stem,
                "title": title,
                "type": page_type,
                "tags": tags,
                "created": created,
                "updated": updated,
                "size": len(content),
            })

    return {"pages": pages}

@router.get("/page/{page_path:path}")
async def get_wiki_page(page_path: str):
    """Get a specific wiki page content."""
    full_path = (WIKI_PATH / page_path).resolve()
    # Validate path stays within WIKI_PATH
    if not str(full_path).startswith(str(WIKI_PATH.resolve())):
        raise HTTPException(403, "Access denied")
    if not full_path.exists() or not full_path.suffix == ".md":
        full_path = (WIKI_PATH / (page_path + ".md")).resolve()
        if not str(full_path).startswith(str(WIKI_PATH.resolve())):
            raise HTTPException(403, "Access denied")
    if not full_path.exists():
        raise HTTPException(404, f"Page not found: {page_path}")

    return {"content": full_path.read_text(), "path": str(full_path)}

@router.get("/sources")
async def wiki_sources():
    """List raw sources."""
    sources = {"articles": [], "papers": [], "transcripts": []}
    for key, dir_path in DIRECTORIES.items():
        if not key.startswith("raw_"):
            continue
        type_name = key.replace("raw_", "")
        if dir_path.exists():
            for f in sorted(dir_path.glob("*.*")):
                sources[type_name].append({
                    "name": f.name,
                    "size": f.stat().st_size,
                    "modified": f.stat().st_mtime,
                })
    return sources


class WikiPageSave(BaseModel):
    content: str


class WikiPageCreate(BaseModel):
    title: str
    type: str  # entity, concept, comparison, query
    tags: list[str] = []


@router.put("/page/{page_path:path}")
async def save_wiki_page(page_path: str, body: WikiPageSave):
    """Save (create or update) a wiki page."""
    full_path = (WIKI_PATH / page_path).resolve()
    # Validate path stays within WIKI_PATH
    if not str(full_path).startswith(str(WIKI_PATH.resolve())):
        raise HTTPException(403, "Access denied")
    # Ensure .md extension
    if not full_path.suffix == ".md":
        full_path = full_path.with_suffix(".md")
    if not str(full_path).startswith(str(WIKI_PATH.resolve())):
        raise HTTPException(403, "Access denied")

    # Create parent directories if needed
    full_path.parent.mkdir(parents=True, exist_ok=True)

    full_path.write_text(body.content, encoding="utf-8")
    logger.info(f"Wiki page saved: {page_path} ({len(body.content)} bytes)")

    # Log activity
    try:
        from .activity import log_activity
        log_activity("wiki.updated", "wiki", page_path, page_path)
    except Exception:
        pass

    return {"success": True, "path": str(full_path.relative_to(WIKI_PATH)), "size": len(body.content)}


@router.post("/page")
async def create_wiki_page(body: WikiPageCreate):
    """Create a new wiki page with auto-generated frontmatter."""
    page_type = body.type.lower().rstrip("s") + "s"
    if page_type not in DIRECTORIES:
        # Fallback: accept singular form
        singular = body.type.lower().rstrip("s")
        page_type = singular + "s"
    if page_type not in DIRECTORIES:
        raise HTTPException(400, f"Invalid page type. Must be one of: entities, concepts, comparisons, queries")

    dir_path = DIRECTORIES[page_type]
    dir_path.mkdir(parents=True, exist_ok=True)

    # Generate slug from title
    slug = re.sub(r"[^a-z0-9]+", "-", body.title.lower()).strip("-")
    if not slug:
        slug = "untitled"
    file_path = dir_path / f"{slug}.md"

    # Avoid overwriting — add suffix if needed
    counter = 1
    original_slug = slug
    while file_path.exists():
        slug = f"{original_slug}-{counter}"
        file_path = dir_path / f"{slug}.md"
        counter += 1

    now = datetime.now().strftime("%Y-%m-%d")
    tags_str = ", ".join(body.tags) if body.tags else ""

    frontmatter = f"""---
title: {body.title}
type: {page_type.rstrip("s")}
tags: [{tags_str}]
created: {now}
updated: {now}
confidence: 0.5
sources: []
---

# {body.title}

"""

    file_path.write_text(frontmatter, encoding="utf-8")
    logger.info(f"Wiki page created: {page_type}/{slug}.md")

    # Log activity
    try:
        from .activity import log_activity
        log_activity("wiki.created", "wiki", f"{page_type}/{slug}", body.title)
    except Exception:
        pass

    return {
        "success": True,
        "path": f"{page_type}/{slug}.md",
        "name": slug,
        "title": body.title,
        "type": page_type,
        "size": len(frontmatter),
    }


# ── Project Wiki ──

PROJECT_WIKI_BASE = Path(os.path.expanduser("~/.hermes/projects"))

DEFAULT_PAGES = {
    "overview": "# Vue d'ensemble\n\nDescription du projet.\n",
    "architecture": "# Architecture\n\nArchitecture technique du projet.\n",
    "decisions": "# Décisions\n\nJournal des décisions techniques.\n",
    "notes": "# Notes\n\nNotes diverses.\n",
}


def _project_wiki_dir(project_id: str) -> Path:
    d = PROJECT_WIKI_BASE / project_id / "wiki"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _parse_frontmatter(content: str) -> dict:
    meta = {"title": "", "tags": [], "created": None, "updated": None}
    if content.startswith("---"):
        fm_end = content.find("---", 3)
        if fm_end > 0:
            for line in content[3:fm_end].splitlines():
                if line.startswith("title:"):
                    meta["title"] = line.split(":", 1)[1].strip()
                elif line.startswith("tags:"):
                    tags_str = line.split(":", 1)[1].strip().strip("[]")
                    meta["tags"] = [t.strip() for t in tags_str.split(",") if t.strip()]
                elif line.startswith("created:"):
                    meta["created"] = line.split(":", 1)[1].strip()
                elif line.startswith("updated:"):
                    meta["updated"] = line.split(":", 1)[1].strip()
    return meta


def _make_frontmatter(title: str, tags: list[str] | None = None) -> str:
    now = datetime.now().strftime("%Y-%m-%d")
    tags_str = ", ".join(tags or [])
    return f"---\ntitle: {title}\ntags: [{tags_str}]\ncreated: {now}\nupdated: {now}\nproject_id: true\n---\n\n"


@router.get("/project/{project_id}/pages")
async def list_project_wiki_pages(project_id: str):
    """List all wiki pages for a project."""
    wiki_dir = _project_wiki_dir(project_id)
    pages = []
    for f in sorted(wiki_dir.glob("*.md")):
        content = f.read_text(errors="ignore")
        meta = _parse_frontmatter(content)
        title = meta["title"] or f.stem.replace("-", " ").title()
        pages.append({
            "name": f.stem,
            "title": title,
            "tags": meta["tags"],
            "created": meta["created"],
            "updated": meta["updated"],
            "size": len(content),
        })
    return {"pages": pages, "project_id": project_id}


@router.get("/project/{project_id}/page/{page_name:path}")
async def get_project_wiki_page(project_id: str, page_name: str):
    """Get a specific project wiki page."""
    wiki_dir = _project_wiki_dir(project_id)
    full_path = (wiki_dir / page_name).resolve()
    if not str(full_path).startswith(str(wiki_dir.resolve())):
        raise HTTPException(403, "Access denied")
    if not full_path.suffix == ".md":
        full_path = full_path.with_suffix(".md")
    if not full_path.exists():
        raise HTTPException(404, f"Page non trouvée: {page_name}")

    content = full_path.read_text(errors="ignore")
    meta = _parse_frontmatter(content)
    return {"content": content, "name": full_path.stem, "title": meta["title"] or full_path.stem, "project_id": project_id}


@router.put("/project/{project_id}/page/{page_name:path}")
async def save_project_wiki_page(project_id: str, page_name: str, body: WikiPageSave):
    """Create or update a project wiki page."""
    wiki_dir = _project_wiki_dir(project_id)
    full_path = (wiki_dir / page_name).resolve()
    if not str(full_path).startswith(str(wiki_dir.resolve())):
        raise HTTPException(403, "Access denied")
    if not full_path.suffix == ".md":
        full_path = full_path.with_suffix(".md")
    full_path.parent.mkdir(parents=True, exist_ok=True)

    # Update frontmatter updated date if present
    content = body.content
    now = datetime.now().strftime("%Y-%m-%d")
    if content.startswith("---"):
        fm_end = content.find("---", 3)
        if fm_end > 0:
            fm = content[3:fm_end]
            lines = fm.splitlines()
            updated_line_idx = None
            for i, line in enumerate(lines):
                if line.startswith("updated:"):
                    updated_line_idx = i
                    break
            if updated_line_idx is not None:
                lines[updated_line_idx] = f"updated: {now}"
            else:
                lines.append(f"updated: {now}")
            content = "---\n" + "\n".join(lines) + "\n---" + content[fm_end + 3:]

    full_path.write_text(content, encoding="utf-8")
    logger.info(f"Project wiki page saved: {project_id}/{page_name}")

    # Log activity
    try:
        from .activity import log_activity
        log_activity("wiki.updated", "project_wiki", f"{project_id}/{page_name}", page_name)
    except Exception:
        pass

    return {"success": True, "name": full_path.stem, "project_id": project_id}


@router.delete("/project/{project_id}/page/{page_name:path}")
async def delete_project_wiki_page(project_id: str, page_name: str):
    """Delete a project wiki page."""
    wiki_dir = _project_wiki_dir(project_id)
    full_path = (wiki_dir / page_name).resolve()
    if not str(full_path).startswith(str(wiki_dir.resolve())):
        raise HTTPException(403, "Access denied")
    if not full_path.suffix == ".md":
        full_path = full_path.with_suffix(".md")
    if not full_path.exists():
        raise HTTPException(404, f"Page non trouvée: {page_name}")

    full_path.unlink()
    logger.info(f"Project wiki page deleted: {project_id}/{page_name}")
    return {"success": True, "deleted": page_name}


@router.post("/project/{project_id}/init")
async def init_project_wiki(project_id: str):
    """Initialize default wiki pages for a project."""
    wiki_dir = _project_wiki_dir(project_id)
    created = []
    now = datetime.now().strftime("%Y-%m-%d")

    for name, body in DEFAULT_PAGES.items():
        file_path = wiki_dir / f"{name}.md"
        if file_path.exists():
            continue
        title = name.replace("-", " ").title()
        content = _make_frontmatter(title) + body
        file_path.write_text(content, encoding="utf-8")
        created.append(name)

    return {"success": True, "created": created, "project_id": project_id}
