"""Cross-reference router — links between projects, wiki pages, backlog items, sessions."""

import json
import logging
from pathlib import Path
from datetime import datetime

from fastapi import APIRouter, HTTPException

from ..config import HERMES_HOME

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cross-references", tags=["cross-references"])

XREF_FILE = HERMES_HOME / "cross-references.json"


def _read_xrefs():
    if not XREF_FILE.exists():
        return {"references": []}
    try:
        with open(XREF_FILE) as f:
            data = json.load(f)
        return data
    except Exception:
        return {"references": []}


def _write_xrefs(data):
    XREF_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(XREF_FILE, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _ensure_xref(from_type, from_id, to_type, to_id, relation):
    """Add a cross-reference if it doesn't exist."""
    data = _read_xrefs()
    refs = data.get("references", [])
    for r in refs:
        if (r.get("from_type") == from_type and r.get("from_id") == from_id
                and r.get("to_type") == to_type and r.get("to_id") == to_id):
            return  # Already exists
    refs.append({
        "from_type": from_type, "from_id": from_id,
        "to_type": to_type, "to_id": to_id,
        "relation": relation,
        "created": datetime.now().isoformat(),
    })
    data["references"] = refs
    _write_xrefs(data)


def _get_related(entity_type, entity_id):
    """Get all entities related to the given entity."""
    data = _read_xrefs()
    refs = data.get("references", [])
    related = {"incoming": [], "outgoing": []}
    for r in refs:
        if r.get("to_type") == entity_type and r.get("to_id") == entity_id:
            related["incoming"].append(r)
        if r.get("from_type") == entity_type and r.get("from_id") == entity_id:
            related["outgoing"].append(r)
    return related


def _enrich_project_relations(project_id: str):
    """Auto-generate cross-references for a project based on existing data."""
    # Wiki pages
    wiki_dir = HERMES_HOME / "projects" / project_id / "wiki"
    if wiki_dir.exists():
        for f in wiki_dir.glob("*.md"):
            _ensure_xref("project", project_id, "wiki_page", f.stem, "has_wiki")

    # Links
    links_file = HERMES_HOME / "projects" / project_id / "links.json"
    if links_file.exists():
        try:
            with open(links_file) as lf:
                ldata = json.load(lf)
            for link in ldata.get("links", []):
                _ensure_xref("project", project_id, "link", link.get("id", ""), "has_link")
        except Exception:
            pass

    # Backlog
    backlog_file = HERMES_HOME / "backlog.json"
    if backlog_file.exists():
        try:
            with open(backlog_file) as bf:
                bdata = json.load(bf)
            for item in bdata.get("items", []):
                if item.get("project_id") == project_id:
                    _ensure_xref("project", project_id, "backlog", item.get("id", ""), "has_backlog_item")
        except Exception:
            pass


@router.get("/{entity_type}/{entity_id}")
async def get_cross_references(entity_type: str, entity_id: str):
    """Return all entities related to the given entity."""
    # Auto-enrich project relations before returning
    if entity_type == "project":
        _enrich_project_relations(entity_id)

    related = _get_related(entity_type, entity_id)

    # Build enriched results
    results = {
        "entity_type": entity_type,
        "entity_id": entity_id,
        "projects": [],
        "backlog": [],
        "wiki_pages": [],
        "links": [],
        "sessions": [],
    }

    all_refs = related["incoming"] + related["outgoing"]

    for ref in all_refs:
        target_type = ref.get("to_type") if ref.get("from_type") == entity_type else ref.get("from_type")
        target_id = ref.get("to_id") if ref.get("from_type") == entity_type else ref.get("from_id")

        if target_type == "project":
            pfile = HERMES_HOME / "projects.json"
            if pfile.exists():
                try:
                    with open(pfile) as f:
                        pdata = json.load(f)
                    for p in pdata.get("items", []):
                        if p.get("id") == target_id:
                            results["projects"].append({
                                "id": p.get("id"), "name": p.get("name"),
                                "status": p.get("status"), "type": p.get("type"),
                                "relation": ref.get("relation"),
                            })
                except Exception:
                    pass

        elif target_type == "backlog":
            bfile = HERMES_HOME / "backlog.json"
            if bfile.exists():
                try:
                    with open(bfile) as f:
                        bdata = json.load(f)
                    for item in bdata.get("items", []):
                        if item.get("id") == target_id:
                            results["backlog"].append({
                                "id": item.get("id"), "title": item.get("title"),
                                "status": item.get("status"), "priority": item.get("priority"),
                                "relation": ref.get("relation"),
                            })
                except Exception:
                    pass

        elif target_type == "wiki_page":
            wiki_dir = HERMES_HOME / "projects" / entity_id / "wiki"
            if not wiki_dir.exists():
                # Try generic wiki
                wiki_dir = Path.home() / "wiki"
            wiki_file = wiki_dir / f"{target_id}.md"
            if wiki_file.exists():
                content = wiki_file.read_text(errors="ignore")
                title = target_id.replace("-", " ").title()
                if content.startswith("---"):
                    fm_end = content.find("---", 3)
                    if fm_end > 0:
                        for line in content[3:fm_end].splitlines():
                            if line.startswith("title:"):
                                title = line.split(":", 1)[1].strip()
                                break
                results["wiki_pages"].append({
                    "id": target_id, "title": title,
                    "relation": ref.get("relation"),
                })

        elif target_type == "link":
            # Links are stored per-project — find which project
            projects_dir = HERMES_HOME / "projects"
            if projects_dir.exists():
                for pd in projects_dir.iterdir():
                    if not pd.is_dir():
                        continue
                    lf = pd / "links.json"
                    if lf.exists():
                        try:
                            with open(lf) as f:
                                ldata = json.load(f)
                            for link in ldata.get("links", []):
                                if link.get("id") == target_id:
                                    results["links"].append({
                                        "id": link.get("id"), "title": link.get("title"),
                                        "url": link.get("url"), "category": link.get("category"),
                                        "relation": ref.get("relation"),
                                    })
                        except Exception:
                            pass

    return results
