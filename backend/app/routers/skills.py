import json
import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Body
from ..utils import run_hermes, hermes_path

router = APIRouter(prefix="/api/skills", tags=["skills"])


def _parse_frontmatter(text: str) -> dict:
    """Extract YAML frontmatter from SKILL.md content."""
    if not text.startswith("---"):
        return {}
    end = text.find("---", 3)
    if end == -1:
        return {}
    yaml_str = text[3:end].strip()
    meta = {}
    for line in yaml_str.split("\n"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r'^(\w[\w\s]*):\s*(.+)$', line)
        if m:
            key = m.group(1).strip().lower()
            val = m.group(2).strip().strip('"').strip("'")
            # Handle simple YAML list on same line [a, b, c]
            if val.startswith("[") and val.endswith("]"):
                val = [v.strip().strip('"').strip("'") for v in val[1:-1].split(",") if v.strip()]
            meta[key] = val
    return meta


def _count_related_files(skill_dir: Path) -> dict:
    """Count files in subdirectories like references/, templates/, scripts/."""
    counts = {}
    for item in skill_dir.iterdir():
        if item.is_dir() and not item.name.startswith("."):
            n = sum(1 for _ in item.rglob("*") if _.is_file())
            if n > 0:
                counts[item.name] = n
    # Also count root-level files (excluding SKILL.md and skill.json)
    root_files = [
        f.name for f in skill_dir.iterdir()
        if f.is_file() and f.name not in ("SKILL.md", "skill.json")
    ]
    if root_files:
        counts["root"] = len(root_files)
    return counts


def _get_skill_detail(skill_dir: Path) -> dict | None:
    """Build a full skill detail object from a directory."""
    if not skill_dir.is_dir():
        return None

    name = skill_dir.name
    skill = {
        "name": name,
        "description": "",
        "category": "",
        "tags": [],
        "source": "builtin",
        "trust": "builtin",
        "files_count": 0,
        "related_dirs": {},
        "has_skill_md": False,
    }

    # Read skill.json metadata
    meta_file = skill_dir / "skill.json"
    if meta_file.exists():
        try:
            meta = json.loads(meta_file.read_text())
            skill["category"] = meta.get("category", "")
            skill["description"] = meta.get("description", "")
            skill["source"] = meta.get("source", "builtin")
            skill["trust"] = meta.get("trust", "builtin")
            if "tags" in meta:
                skill["tags"] = meta["tags"]
        except json.JSONDecodeError:
            pass

    # Read SKILL.md with frontmatter
    skill_md = skill_dir / "SKILL.md"
    if skill_md.exists():
        content = skill_md.read_text(errors="replace")
        skill["has_skill_md"] = True
        fm = _parse_frontmatter(content)
        # Frontmatter overrides/extends skill.json
        if fm.get("description") and not skill["description"]:
            skill["description"] = fm["description"]
        if fm.get("category") and not skill["category"]:
            skill["category"] = fm["category"]
        if fm.get("tags") and not skill["tags"]:
            skill["tags"] = fm["tags"]
        if fm.get("name"):
            skill["display_name"] = fm["name"]
        if fm.get("version"):
            skill["version"] = fm["version"]
        # Fallback description from first heading
        if not skill["description"]:
            for line in content.split("\n"):
                line = line.strip()
                if line and not line.startswith("#") and not line.startswith("---"):
                    skill["description"] = line[:150]
                    break

    # Count all files
    all_files = [f for f in skill_dir.rglob("*") if f.is_file() and not f.name.startswith(".")]
    skill["files_count"] = len(all_files)

    # Related directories
    skill["related_dirs"] = _count_related_files(skill_dir)

    # Last modified
    try:
        newest = max(f.stat().st_mtime for f in all_files) if all_files else 0
        skill["updated_at"] = datetime.fromtimestamp(newest, tz=timezone.utc).isoformat() if newest else None
    except OSError:
        skill["updated_at"] = None

    return skill


@router.get("/list")
async def list_skills_detailed():
    """List all skills with enriched metadata for the Skills Hub."""
    skills_dir = hermes_path("skills")
    if not skills_dir.exists():
        return {"skills": [], "categories": {}, "total": 0}

    skills = []
    categories = {}
    for d in sorted(skills_dir.iterdir()):
        if not d.is_dir() or d.name.startswith("."):
            continue
        detail = _get_skill_detail(d)
        if detail:
            skills.append(detail)
            cat = detail.get("category") or "uncategorized"
            categories[cat] = categories.get(cat, 0) + 1

    return {
        "skills": skills,
        "categories": categories,
        "total": len(skills),
    }


@router.get("/detail/{skill_name}")
async def skill_detail(skill_name: str):
    """Get full skill detail including SKILL.md content and file listing."""
    skill_dir = hermes_path("skills", skill_name)
    if not skill_dir.exists() or not skill_dir.is_dir():
        raise HTTPException(404, f"Skill '{skill_name}' not found")

    detail = _get_skill_detail(skill_dir)
    if not detail:
        raise HTTPException(404, f"Skill '{skill_name}' not found")

    # Add full SKILL.md content
    skill_md = skill_dir / "SKILL.md"
    if skill_md.exists():
        detail["skill_md"] = skill_md.read_text(errors="replace")

    # Full file listing organized by directory
    file_tree = {}
    for f in sorted(skill_dir.rglob("*")):
        if not f.is_file() or f.name.startswith("."):
            continue
        rel = str(f.relative_to(skill_dir))
        parent = str(rel.rsplit("/", 1)[0]) if "/" in rel else "root"
        file_tree.setdefault(parent, []).append({
            "name": f.name,
            "path": rel,
            "size": f.stat().st_size,
        })
    detail["file_tree"] = file_tree

    return detail


@router.get("")
async def list_skills():
    """List installed skills."""
    skills_dir = hermes_path("skills")
    if not skills_dir.exists():
        return []

    skills = []
    for d in sorted(skills_dir.iterdir()):
        if not d.is_dir():
            continue
        skill_md = d / "SKILL.md"
        meta_file = d / "skill.json"
        skill = {
            "name": d.name,
            "source": "builtin",
            "category": "",
            "description": "",
        }
        if meta_file.exists():
            try:
                meta = json.loads(meta_file.read_text())
                skill.update({
                    "category": meta.get("category", ""),
                    "description": meta.get("description", ""),
                    "source": meta.get("source", "builtin"),
                    "trust": meta.get("trust", "builtin"),
                })
            except json.JSONDecodeError:
                pass
        if skill_md.exists():
            # First line as description fallback
            first_lines = skill_md.read_text(errors="replace")[:200]
            if not skill["description"]:
                skill["description"] = first_lines.split("\n")[0].strip("# ")
        skills.append(skill)
    return skills


@router.get("/browse")
async def browse_skills(query: str = ""):
    """Browse available skills (using hermes skills browse/search)."""
    try:
        if query:
            output = await run_hermes("skills", "search", query, timeout=30)
        else:
            output = await run_hermes("skills", "browse", timeout=30)
        return {"output": output}
    except RuntimeError as e:
        return {"output": "", "error": str(e)}


@router.get("/{skill_name}")
async def inspect_skill(skill_name: str):
    """Get skill details including SKILL.md content."""
    skill_dir = hermes_path("skills", skill_name)
    if not skill_dir.exists() or not skill_dir.is_dir():
        raise HTTPException(404, f"Skill '{skill_name}' not found")

    result = {"name": skill_name, "files": []}
    skill_md = skill_dir / "SKILL.md"
    if skill_md.exists():
        result["skill_md"] = skill_md.read_text(errors="replace")

    # List all files
    for f in sorted(skill_dir.rglob("*")):
        if f.is_file():
            rel = f.relative_to(skill_dir)
            result["files"].append(str(rel))
    return result


@router.post("/install")
async def install_skill(body: dict = Body(...)):
    """Install a skill."""
    name = body.get("name")
    if not name:
        raise HTTPException(400, "Missing 'name'")
    try:
        output = await run_hermes("skills", "install", name, timeout=60)
        return {"status": "installed", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))


@router.post("/uninstall")
async def uninstall_skill(body: dict = Body(...)):
    """Uninstall a skill."""
    name = body.get("name")
    if not name:
        raise HTTPException(400, "Missing 'name'")
    try:
        output = await run_hermes("skills", "uninstall", name, timeout=30)
        return {"status": "uninstalled", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))
