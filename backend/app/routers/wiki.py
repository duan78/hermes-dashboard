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
