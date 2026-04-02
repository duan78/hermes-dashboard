import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, Body
from ..utils import run_hermes, hermes_path

router = APIRouter(prefix="/api/skills", tags=["skills"])


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
