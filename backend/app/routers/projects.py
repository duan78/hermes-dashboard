import asyncio
import fcntl
import json
import logging
import os
import re
import subprocess
import uuid
from collections import Counter
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..config import HERMES_HOME

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["projects"])

PROJECTS_FILE = HERMES_HOME / "projects.json"

VALID_TYPES = ["webapp", "library", "infra", "seo", "research", "automation", "other"]
VALID_STATUSES = ["active", "paused", "archived"]


def _read_projects():
    if not PROJECTS_FILE.exists():
        return {"version": 1, "created": datetime.now().strftime("%Y-%m-%d"), "items": []}
    with open(PROJECTS_FILE) as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_SH)
        try:
            data = json.load(f)
        finally:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)
    if "items" not in data:
        data["items"] = []
    return data


def _write_projects(data):
    PROJECTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(PROJECTS_FILE, "w") as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX)
        try:
            json.dump(data, f, indent=2, ensure_ascii=False)
        finally:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)


def _slugify(name):
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"[\s]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    slug = slug.strip("-")
    return slug or "project"


def _update_project_stats(project):
    """Compute session_count and backlog_count for a project."""
    keywords = project.get("keywords", [])
    name = project.get("name", "")
    pid = project.get("id", "")

    # Count backlog items
    backlog_file = HERMES_HOME / "backlog.json"
    backlog_count = 0
    if backlog_file.exists():
        try:
            with open(backlog_file) as f:
                bdata = json.load(f)
            for item in bdata.get("items", []):
                if item.get("project_id") == pid:
                    backlog_count += 1
        except Exception:
            pass

    # Count sessions mentioning project name/keywords using JSON metadata (fast)
    session_count = 0
    sessions_dir = HERMES_HOME / "sessions"
    if sessions_dir.exists():
        search_terms = [name.lower()] + [k.lower() for k in keywords]
        try:
            # Use JSON files with preview field — much faster than reading JSONL
            files = sorted(
                (f for f in sessions_dir.glob("session_*.json")
                 if "session_cron_" not in f.name),
                reverse=True,
            )[:30]
            for sf in files:
                try:
                    data = json.loads(sf.read_text())
                    head = (data.get("preview", "") or "").lower()
                    if any(t in head for t in search_terms):
                        session_count += 1
                except Exception:
                    pass
        except Exception:
            pass

    project["session_count"] = session_count
    project["backlog_count"] = backlog_count


# ── Schemas ──

class ProjectCreate(BaseModel):
    name: str
    type: str = "other"
    description: str = ""
    github_repo: str = ""
    keywords: list[str] = []
    status: str = "active"
    tags: list[str] = []

class ProjectUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    description: str | None = None
    github_repo: str | None = None
    keywords: list[str] | None = None
    status: str | None = None
    tags: list[str] | None = None


# ── Endpoints ──

@router.get("")
async def list_projects(
    status: str | None = Query(None),
    type: str | None = Query(None),
    search: str | None = Query(None),
    tag: str | None = Query(None),
):
    data = _read_projects()
    items = data.get("items", [])

    if status:
        items = [p for p in items if p.get("status") == status]
    if type:
        items = [p for p in items if p.get("type") == type]
    if tag:
        items = [p for p in items if tag in p.get("tags", [])]
    if search:
        s = search.lower()
        items = [
            p for p in items
            if s in p.get("name", "").lower()
            or s in p.get("description", "").lower()
            or any(s in k.lower() for k in p.get("keywords", []))
        ]

    for p in items:
        _update_project_stats(p)

    return {"items": items, "total": len(items)}


@router.post("/auto-detect")
async def auto_detect_projects():
    """Scan sessions, backlog, memory, and GitHub to detect project candidates."""
    candidates = {}

    # 1. Scan backlog items for project patterns
    backlog_file = HERMES_HOME / "backlog.json"
    backlog_items = []
    if backlog_file.exists():
        try:
            with open(backlog_file) as f:
                bdata = json.load(f)
            backlog_items = bdata.get("items", [])
        except Exception:
            pass

    # Group backlog by category and extract project names from titles
    category_groups = {}
    for item in backlog_items:
        cat = item.get("category", "other")
        if cat not in category_groups:
            category_groups[cat] = []
        category_groups[cat].append(item.get("title", ""))

    for cat, titles in category_groups.items():
        if len(titles) >= 2:
            # Extract common significant words
            words = []
            for t in titles:
                words.extend(re.findall(r"[a-zA-Z]{3,}", t.lower()))
            common = Counter(words).most_common(5)
            significant = [w for w, c in common if c >= 2 and w not in {
                "the", "and", "for", "add", "fix", "update", "create",
                "remove", "from", "with", "this", "that", "are", "has",
            }]
            if significant:
                name = significant[0].capitalize()
                slug = _slugify(name)
                candidates[slug] = {
                    "id": slug,
                    "name": name,
                    "type": "other",
                    "description": f"Projet détecté depuis {len(titles)} tâches backlog dans la catégorie '{cat}'",
                    "keywords": significant[:5],
                    "confidence": min(0.9, 0.3 + len(titles) * 0.1),
                    "source": "backlog",
                    "backlog_count": len(titles),
                    "session_count": 0,
                }

    # 2. Scan recent sessions for project names
    sessions_dir = HERMES_HOME / "sessions"
    if sessions_dir.exists():
        try:
            files = sorted(sessions_dir.glob("*.jsonl"), reverse=True)[:50]
            # Look for patterns like project names, repo names
            project_mentions = Counter()
            for sf in files:
                try:
                    content = sf.read_text(errors="ignore")
                    # Look for common project patterns
                    # GitHub repo patterns
                    repos = re.findall(r"[a-zA-Z0-9_-]+/([a-zA-Z0-9_-]+)", content)
                    for r in repos:
                        project_mentions[r.lower()] += 1
                    # CamelCase / kebab-case project names in titles
                    titles = re.findall(r'"title":\s*"([^"]+)"', content)
                    for t in titles:
                        words = re.findall(r"[A-Z][a-zA-Z]+|[a-z]+-[a-z]+", t)
                        for w in words:
                            if len(w) >= 4:
                                project_mentions[w.lower()] += 1
                except Exception:
                    pass

            for name, count in project_mentions.most_common(10):
                if count >= 3:
                    slug = _slugify(name)
                    confidence = min(0.9, 0.2 + count * 0.1)
                    if slug in candidates:
                        candidates[slug]["session_count"] = count
                        candidates[slug]["confidence"] = min(0.95, candidates[slug]["confidence"] + 0.1)
                    else:
                        candidates[slug] = {
                            "id": slug,
                            "name": name.replace("-", " ").title(),
                            "type": "webapp",
                            "description": f"Projet détecté depuis {count} sessions",
                            "keywords": [name.lower()],
                            "confidence": confidence,
                            "source": "sessions",
                            "session_count": count,
                            "backlog_count": 0,
                        }
        except Exception:
            pass

    # 3. Scan memory files for project mentions
    memory_dir = HERMES_HOME / "memory"
    if memory_dir.exists():
        try:
            for mf in memory_dir.glob("*.md"):
                try:
                    content = mf.read_text(errors="ignore").lower()
                    for slug, cand in candidates.items():
                        if slug in content or cand.get("name", "").lower() in content:
                            cand["confidence"] = min(0.95, cand["confidence"] + 0.05)
                except Exception:
                    pass
        except Exception:
            pass

    # 4. GitHub repos via gh (detect current user dynamically)
    try:
        # Detect the current GitHub user
        gh_user_result = subprocess.run(
            ["gh", "api", "user", "--jq", ".login"],
            capture_output=True, text=True, timeout=10,
        )
        gh_username = gh_user_result.stdout.strip() if gh_user_result.returncode == 0 else ""
        if gh_username:
            result = subprocess.run(
                ["gh", "repo", "list", gh_username, "--limit", "30", "--json", "name,description"],
                capture_output=True, text=True, timeout=15,
            )
        else:
            result = subprocess.run(
                ["gh", "repo", "list", "--limit", "30", "--json", "name,description"],
                capture_output=True, text=True, timeout=15,
            )
        if result.returncode == 0:
            repos = json.loads(result.stdout)
            for repo in repos:
                slug = _slugify(repo.get("name", ""))
                repo_full = f"{gh_username}/{repo.get('name', '')}" if gh_username else repo.get('name', '')
                if slug in candidates:
                    candidates[slug]["github_repo"] = repo_full
                    candidates[slug]["confidence"] = min(0.95, candidates[slug]["confidence"] + 0.15)
                    if repo.get("description"):
                        candidates[slug]["description"] = repo["description"]
                else:
                    name = repo.get("name", slug)
                    desc = repo.get("description", "")
                    # Determine type from repo name/description
                    ptype = "other"
                    name_lower = name.lower()
                    if any(k in name_lower for k in ["dashboard", "web", "app", "ui", "frontend"]):
                        ptype = "webapp"
                    elif any(k in name_lower for k in ["lib", "sdk", "pkg", "module"]):
                        ptype = "library"
                    elif any(k in name_lower for k in ["infra", "deploy", "k8s", "docker", "terraform"]):
                        ptype = "infra"
                    elif any(k in name_lower for k in ["seo", "scraper", "crawl"]):
                        ptype = "seo"
                    candidates[slug] = {
                        "id": slug,
                        "name": name,
                        "type": ptype,
                        "description": desc or f"Repo GitHub: {repo_full}",
                        "github_repo": repo_full,
                        "keywords": [name.lower()],
                        "confidence": 0.5,
                        "source": "github",
                        "session_count": 0,
                        "backlog_count": 0,
                    }
    except Exception:
        pass

    # Filter out low confidence
    results = [c for c in candidates.values() if c["confidence"] >= 0.3]
    results.sort(key=lambda x: x["confidence"], reverse=True)

    return {"candidates": results, "total": len(results)}


@router.get("/{project_id}")
async def get_project(project_id: str):
    data = _read_projects()
    items = data.get("items", [])

    for p in items:
        if p.get("id") == project_id:
            _update_project_stats(p)
            return p

    raise HTTPException(404, "Project not found")


@router.post("")
async def create_project(body: ProjectCreate):
    if body.type not in VALID_TYPES:
        raise HTTPException(400, f"Invalid type. Valid: {VALID_TYPES}")
    if body.status not in VALID_STATUSES:
        raise HTTPException(400, f"Invalid status. Valid: {VALID_STATUSES}")

    data = _read_projects()
    items = data.get("items", [])

    item_id = _slugify(body.name)
    existing_ids = {p.get("id") for p in items}
    if item_id in existing_ids:
        counter = 2
        while f"{item_id}-{counter}" in existing_ids:
            counter += 1
        item_id = f"{item_id}-{counter}"

    now = datetime.now().isoformat()
    new_project = {
        "id": item_id,
        "name": body.name,
        "type": body.type,
        "description": body.description,
        "github_repo": body.github_repo,
        "status": body.status,
        "keywords": body.keywords,
        "tags": body.tags,
        "session_count": 0,
        "backlog_count": 0,
        "last_activity": now,
        "created": now,
        "updated": now,
    }

    items.append(new_project)
    data["items"] = items
    _write_projects(data)
    logger.info("Created project: %s", item_id)

    # Log activity
    try:
        from .activity import log_activity
        log_activity("project.created", "project", item_id, body.name)
    except Exception:
        pass

    return new_project


@router.put("/{project_id}")
async def update_project(project_id: str, body: ProjectUpdate):
    if body.type is not None and body.type not in VALID_TYPES:
        raise HTTPException(400, f"Invalid type. Valid: {VALID_TYPES}")
    if body.status is not None and body.status not in VALID_STATUSES:
        raise HTTPException(400, f"Invalid status. Valid: {VALID_STATUSES}")

    data = _read_projects()
    items = data.get("items", [])

    for i, p in enumerate(items):
        if p.get("id") == project_id:
            updates = body.model_dump(exclude_none=True)
            updates["updated"] = datetime.now().isoformat()
            items[i].update(updates)
            data["items"] = items
            _write_projects(data)
            logger.info("Updated project: %s", project_id)

            # Log activity
            try:
                from .activity import log_activity
                log_activity("project.updated", "project", project_id, items[i].get("name", ""))
            except Exception:
                pass

            return items[i]

    raise HTTPException(404, "Project not found")


@router.delete("/{project_id}")
async def delete_project(project_id: str):
    data = _read_projects()
    items = data.get("items", [])
    project_name = ""
    for p in items:
        if p.get("id") == project_id:
            project_name = p.get("name", "")
            break

    new_items = [p for p in items if p.get("id") != project_id]
    if len(new_items) == len(items):
        raise HTTPException(404, "Project not found")

    data["items"] = new_items
    _write_projects(data)
    logger.info("Deleted project: %s", project_id)

    # Log activity
    try:
        from .activity import log_activity
        log_activity("project.deleted", "project", project_id, project_name)
    except Exception:
        pass

    return {"status": "deleted", "id": project_id}


@router.get("/{project_id}/sessions")
async def get_project_sessions(project_id: str):
    """Return sessions mentioning this project's name or keywords."""
    data = _read_projects()
    items = data.get("items", [])
    project = None
    for p in items:
        if p.get("id") == project_id:
            project = p
            break

    if not project:
        raise HTTPException(404, "Project not found")

    name = project.get("name", "")
    keywords = project.get("keywords", [])
    search_terms = [name.lower()] + [k.lower() for k in keywords]

    # Score sessions: require meaningful matches, not just generic keywords
    # Generic short terms (< 4 chars) need a companion longer term to count
    short_terms = [t for t in search_terms if len(t) < 4]
    long_terms = [t for t in search_terms if len(t) >= 4]
    min_matches = 2 if len(search_terms) > 1 else 1

    sessions = []
    sessions_dir = HERMES_HOME / "sessions"
    if sessions_dir.exists():
        try:
            files = sorted(sessions_dir.glob("*.jsonl"), reverse=True)[:50]
            for sf in files:
                try:
                    # Only scan first 10 messages for relevance (avoid false positives
                    # from keywords mentioned mid-conversation in unrelated sessions)
                    all_lines = sf.read_text(errors="ignore").split("\n")
                    head_lines = all_lines[:10]
                    head_content = ""

                    # Build searchable content, skipping system/context/compaction messages
                    # that contain cross-project references from session summaries
                    for line in head_lines:
                        if not line.strip():
                            continue
                        try:
                            entry = json.loads(line)
                            role = entry.get("role", entry.get("type", ""))
                            if role in ("system", "context", "compaction", "session_meta"):
                                continue
                            # Skip context compaction summaries
                            content = entry.get("content", "") or entry.get("message", "") or ""
                            if "CONTEXT COMPACTION" in content or " Earlier turns were compacted" in content:
                                continue
                            head_content += "\n" + content.lower()
                        except (json.JSONDecodeError, Exception):
                            head_content += "\n" + line.lower()

                    matching_terms = [t for t in search_terms if t in head_content]
                    matching_long = [t for t in long_terms if t in head_content]
                    matching_short = [t for t in short_terms if t in head_content]

                    # Require at least min_matches total, AND at least one long term
                    if len(matching_terms) >= min_matches and len(matching_long) >= 1:
                        # Score: more matching long terms = more relevant
                        score = len(matching_long) * 10 + len(matching_short)

                        # Extract basic session info from first few lines
                        session_info = {
                            "id": sf.stem,
                            "filename": sf.name,
                            "name": sf.stem,
                            "size": sf.stat().st_size,
                        }
                        # Try to extract platform and date from first line
                        for line in head_lines:
                            try:
                                entry = json.loads(line)
                                session_info["platform"] = entry.get("platform", "")
                                session_info["date"] = entry.get("timestamp", sf.stem[:10])
                                break
                            except (json.JSONDecodeError, Exception):
                                pass

                        # Get a preview from human messages in the header
                        preview_text = ""
                        for line in head_lines:
                            try:
                                entry = json.loads(line)
                                if entry.get("type") == "human":
                                    preview_text = (entry.get("message", "") or "")[:120]
                                    break
                            except (json.JSONDecodeError, Exception):
                                pass

                        session_info["preview"] = preview_text
                        session_info["relevance_score"] = score
                        sessions.append(session_info)
                except Exception:
                    pass
        except Exception:
            pass

    # Sort by relevance score (highest first)
    sessions.sort(key=lambda s: s.get("relevance_score", 0), reverse=True)

    return {"sessions": sessions, "total": len(sessions), "project_id": project_id}


@router.get("/{project_id}/backlog")
async def get_project_backlog(project_id: str):
    """Return backlog items linked to this project."""
    data = _read_projects()
    items = data.get("items", [])
    project = None
    for p in items:
        if p.get("id") == project_id:
            project = p
            break

    if not project:
        raise HTTPException(404, "Project not found")

    backlog_file = HERMES_HOME / "backlog.json"
    linked_items = []
    if backlog_file.exists():
        try:
            with open(backlog_file) as f:
                bdata = json.load(f)
            for item in bdata.get("items", []):
                if item.get("project_id") == project_id:
                    linked_items.append(item)
        except Exception:
            pass

    return {"items": linked_items, "total": len(linked_items), "project_id": project_id}


# ── Project Links / Bookmarks ──

class LinkCreate(BaseModel):
    title: str
    url: str
    category: str = "other"  # github, docs, other


def _read_links(project_id: str) -> list:
    links_file = HERMES_HOME / "projects" / project_id / "links.json"
    if not links_file.exists():
        return []
    try:
        with open(links_file) as f:
            fcntl.flock(f.fileno(), fcntl.LOCK_SH)
            try:
                data = json.load(f)
            finally:
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        return data.get("links", [])
    except Exception:
        return []


def _write_links(project_id: str, links: list):
    links_file = HERMES_HOME / "projects" / project_id / "links.json"
    links_file.parent.mkdir(parents=True, exist_ok=True)
    with open(links_file, "w") as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX)
        try:
            json.dump({"links": links}, f, indent=2, ensure_ascii=False)
        finally:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)


@router.get("/{project_id}/links")
async def get_project_links(project_id: str):
    """List all links/bookmarks for a project."""
    links = _read_links(project_id)
    return {"links": links, "total": len(links), "project_id": project_id}


@router.post("/{project_id}/links")
async def add_project_link(project_id: str, body: LinkCreate):
    """Add a link/bookmark to a project."""
    links = _read_links(project_id)
    link_id = _slugify(body.title) or str(uuid.uuid4())[:8]
    existing_ids = {l.get("id") for l in links}
    if link_id in existing_ids:
        counter = 2
        while f"{link_id}-{counter}" in existing_ids:
            counter += 1
        link_id = f"{link_id}-{counter}"

    new_link = {
        "id": link_id,
        "title": body.title,
        "url": body.url,
        "category": body.category,
        "created": datetime.now().isoformat(),
    }
    links.append(new_link)
    _write_links(project_id, links)
    logger.info("Added link to project %s: %s", project_id, body.title)

    try:
        from .activity import log_activity
        log_activity("link.added", "project_link", link_id, body.title)
    except Exception:
        pass

    return new_link


@router.delete("/{project_id}/links/{link_id}")
async def delete_project_link(project_id: str, link_id: str):
    """Delete a link from a project."""
    links = _read_links(project_id)
    new_links = [l for l in links if l.get("id") != link_id]
    if len(new_links) == len(links):
        raise HTTPException(404, "Link not found")
    _write_links(project_id, new_links)
    logger.info("Deleted link %s from project %s", link_id, project_id)
    return {"status": "deleted", "id": link_id}
