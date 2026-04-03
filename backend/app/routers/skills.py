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


@router.get("/registry")
async def browse_registry(page: int = 1, size: int = 20, source: str = "all", query: str = ""):
    """Browse the online skills registry."""
    try:
        if query:
            output = await run_hermes(
                "skills", "search", query, "--source", source, "--limit", str(size), timeout=30
            )
            result = _parse_browse_table(output, is_search=True)
        else:
            output = await run_hermes(
                "skills", "browse", "--page", str(page), "--size", str(size), "--source", source, timeout=30
            )
            result = _parse_browse_table(output, is_search=False)

        result["source"] = source
        return result
    except RuntimeError as e:
        return {
            "skills": [],
            "total": 0,
            "page": page,
            "total_pages": 1,
            "source": source,
            "source_stats": {},
            "error": str(e),
        }


@router.get("/registry/inspect/{skill_name}")
async def inspect_registry_skill(skill_name: str):
    """Preview a skill from the registry before installing."""
    try:
        output = await run_hermes("skills", "inspect", skill_name, timeout=30)
        return {"output": output}
    except RuntimeError as e:
        return {"output": "", "error": str(e)}


@router.get("/inspect/{skill_name}")
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


def _parse_browse_table(output: str, is_search: bool = False) -> dict:
    """Parse the Unicode box table output from hermes skills browse/search into structured JSON."""
    lines = output.strip().split("\n")
    skills = []
    total = 0
    page = 1
    total_pages = 1
    source = "all"
    source_stats = {}

    # Extract header info: "(232 skills, page 1/47)" or "3 result(s)"
    header_match = re.search(r'\((\d+)\s+skill[s]?,\s+page\s+(\d+)/(\d+)\)', output)
    if header_match:
        total = int(header_match.group(1))
        page = int(header_match.group(2))
        total_pages = int(header_match.group(3))

    search_match = re.search(r'(\d+)\s+result[s]?\)', output)
    if search_match and not header_match:
        total = int(search_match.group(1))
        total_pages = 1
        page = 1

    # Extract source stats from footer: "Sources: claude-marketplace: 3, ..."
    footer_match = re.search(r'Sources:\s*(.+)', output)
    if footer_match:
        stats_str = footer_match.group(1)
        for pair in stats_str.split(','):
            pair = pair.strip()
            if ':' in pair:
                parts = pair.rsplit(':', 1)
                src_name = parts[0].strip()
                src_count = int(parts[1].strip()) if parts[1].strip().isdigit() else 0
                source_stats[src_name] = src_count

    # Determine columns based on format:
    # Browse: # | Name | Description | Source | Trust
    # Search: Name | Description | Source | Trust | Identifier
    data_lines = []
    in_table = False
    for line in lines:
        stripped = line.strip()
        # Detect table boundaries
        if any(c in line for c in ('┏', '┡', '┃', '┗', '└', '│')):
            # Skip pure separator/header rows
            if any(c in line for c in ('┏', '┡', '┗', '└')):
                if '┡' in line or '┏' in line:
                    in_table = True
                continue
            if '┃' in line and ('#' in line or 'Name' in line or 'Trust' in line or 'Identifier' in line or 'Description' in line):
                continue
            if '│' in line:
                data_lines.append(line)

    # Parse data rows
    i = 0
    while i < len(data_lines):
        line = data_lines[i]
        fields = [f.strip() for f in line.split('│')]
        # Remove empty strings from split at edges
        fields = [f for f in fields if f != '' or True]  # keep all fields for index alignment
        # Re-split more carefully: split on │ and take middle parts
        parts = line.split('│')
        # parts[0] is before first │, parts[-1] is after last │
        cols = [p.strip() for p in parts[1:-1]]  # exclude leading/trailing empty

        if is_search:
            # Name | Description | Source | Trust | Identifier
            if len(cols) >= 4:
                name = cols[0]
                desc = cols[1]
                src = cols[2] if len(cols) > 2 else ''
                trust = cols[3] if len(cols) > 3 else ''
                identifier = cols[4] if len(cols) > 4 else ''
            else:
                i += 1
                continue
        else:
            # # | Name | Description | Source | Trust
            if len(cols) >= 4:
                num = cols[0]
                name = cols[1]
                desc = cols[2]
                src = cols[3] if len(cols) > 3 else ''
                trust = cols[4] if len(cols) > 4 else ''
                identifier = ''
            else:
                i += 1
                continue

        # Check if next lines are continuation rows (empty # and Name columns)
        while i + 1 < len(data_lines):
            next_line = data_lines[i + 1]
            next_parts = next_line.split('│')
            next_cols = [p.strip() for p in next_parts[1:-1]]

            if is_search:
                # Continuation: empty Name, non-empty Description
                if len(next_cols) >= 1 and not next_cols[0] and next_cols[1]:
                    desc += ' ' + next_cols[1]
                    i += 1
                else:
                    break
            else:
                # Continuation: empty # and Name
                if len(next_cols) >= 2 and not next_cols[0] and not next_cols[1]:
                    if next_cols[2]:
                        desc += ' ' + next_cols[2]
                    i += 1
                else:
                    break

        # Clean up trust: remove ★ prefix
        trust_clean = trust.replace('★', '').strip() or trust.strip()

        skill_entry = {
            "name": name,
            "description": desc.strip(),
            "source": src,
            "trust": trust_clean,
        }
        if identifier:
            skill_entry["identifier"] = identifier

        if name:  # Only add if we got a name
            skills.append(skill_entry)

        i += 1

    return {
        "skills": skills,
        "total": total,
        "page": page,
        "total_pages": total_pages,
        "source_stats": source_stats,
    }


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
