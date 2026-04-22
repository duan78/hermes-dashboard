import json
import os
import shutil
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import HERMES_HOME

router = APIRouter(prefix="/api/skills", tags=["skills-security"])

HUB_DIR = HERMES_HOME / ".hub"
QUARANTINE_DIR = HUB_DIR / "quarantine"
AUDIT_LOG = HUB_DIR / "audit.log"
TAPS_FILE = HUB_DIR / "taps.json"


def _ensure_hub_dirs():
    """Ensure the .hub directory structure exists."""
    HUB_DIR.mkdir(parents=True, exist_ok=True)
    QUARANTINE_DIR.mkdir(parents=True, exist_ok=True)


@router.get("/guard-scan")
async def guard_scan():
    """Scan skills directory for quarantine markers and trust levels."""
    _ensure_hub_dirs()
    skills_dir = HERMES_HOME / "skills"
    results = []

    # Check for quarantine files that indicate security warnings
    quarantine_indicators = set()
    if QUARANTINE_DIR.exists():
        for f in QUARANTINE_DIR.iterdir():
            if f.is_file():
                quarantine_indicators.add(f.stem)

    # Scan each installed skill
    if skills_dir.exists():
        seen = set()
        for skill_md in sorted(skills_dir.rglob("SKILL.md")):
            skill_dir = skill_md.parent
            rel_parts = skill_dir.relative_to(skills_dir).parts
            if any(p.startswith(".") for p in rel_parts):
                continue
            name = skill_dir.name
            if name in seen:
                continue
            seen.add(name)

            # Read skill metadata
            trust = "safe"
            warnings = []
            source = "builtin"

            meta_file = skill_dir / "skill.json"
            if meta_file.exists():
                try:
                    meta = json.loads(meta_file.read_text())
                    source = meta.get("source", "builtin")
                    meta_trust = meta.get("trust", "")
                    if meta_trust in ("unverified", "danger", "warning"):
                        trust = "warning"
                        warnings.append(f"Low trust level: {meta_trust}")
                except json.JSONDecodeError:
                    pass

            # Check if skill has executable scripts
            for f in skill_dir.rglob("*"):
                if f.is_file() and not f.name.startswith("."):
                    if f.suffix in (".sh", ".py", ".js") and os.access(f, os.X_OK):
                        if source != "builtin":
                            trust = "warning"
                            warnings.append(f"Executable script: {f.name}")

            # Check if in quarantine
            if name in quarantine_indicators:
                trust = "danger"
                warnings.append("Skill is quarantined")

            results.append({
                "name": name,
                "trust": trust,
                "source": source,
                "warnings": warnings,
            })

    # Also list quarantined skills not in main skills dir
    for qf in sorted(QUARANTINE_DIR.iterdir()):
        if qf.is_file() and qf.stem not in seen:
            results.append({
                "name": qf.stem,
                "trust": "danger",
                "source": "quarantine",
                "warnings": ["Skill is quarantined"],
            })

    return {"results": results, "total": len(results)}


@router.get("/audit-log")
async def audit_log():
    """Read the skills audit log."""
    _ensure_hub_dirs()
    entries = []

    if AUDIT_LOG.exists():
        try:
            lines = AUDIT_LOG.read_text(errors="replace").strip().split("\n")
            for line in reversed(lines):  # Most recent first
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    entries.append({
                        "date": entry.get("timestamp", ""),
                        "action": entry.get("action", ""),
                        "skill": entry.get("skill", ""),
                        "source": entry.get("source", ""),
                    })
                except json.JSONDecodeError:
                    # Plain text line
                    entries.append({
                        "date": "",
                        "action": line,
                        "skill": "",
                        "source": "",
                    })
        except OSError:
            pass

    return {"entries": entries, "total": len(entries)}


@router.get("/quarantine")
async def list_quarantine():
    """List files in the quarantine directory."""
    _ensure_hub_dirs()
    items = []

    for f in sorted(QUARANTINE_DIR.iterdir()):
        if f.is_file():
            # Try to read metadata if it's JSON
            meta = {}
            if f.suffix == ".json":
                try:
                    meta = json.loads(f.read_text(errors="replace"))
                except json.JSONDecodeError:
                    pass

            stat = f.stat()
            items.append({
                "name": f.stem if f.suffix == ".json" else f.name,
                "filename": f.name,
                "size": stat.st_size,
                "quarantined_at": datetime.fromtimestamp(stat.st_mtime, tz=UTC).isoformat(),
                "reason": meta.get("reason", ""),
                "original_path": meta.get("original_path", ""),
            })

    return {"items": items, "total": len(items)}


class QuarantineReleaseRequest(BaseModel):
    name: str


@router.post("/quarantine/release")
async def release_quarantine(body: QuarantineReleaseRequest):
    """Release a quarantined skill back to the skills directory."""
    _ensure_hub_dirs()
    name = body.name

    # Find the quarantine file
    q_file = QUARANTINE_DIR / f"{name}.json"
    if not q_file.exists():
        q_file = QUARANTINE_DIR / name
    if not q_file.exists():
        raise HTTPException(404, f"Quarantined skill '{name}' not found")

    # Read metadata for original path
    original_path = None
    if q_file.suffix == ".json":
        try:
            meta = json.loads(q_file.read_text(errors="replace"))
            original_path = meta.get("original_path")
        except json.JSONDecodeError:
            pass

    # Remove from quarantine
    q_file.unlink()

    # Write audit log entry
    _write_audit_entry("release", name, "quarantine")

    return {"success": True, "message": f"Skill '{name}' released from quarantine"}


@router.delete("/quarantine/{name}")
async def delete_quarantine(name: str):
    """Permanently delete a quarantined skill."""
    _ensure_hub_dirs()

    q_file = QUARANTINE_DIR / f"{name}.json"
    if not q_file.exists():
        q_file = QUARANTINE_DIR / name
    if not q_file.exists():
        raise HTTPException(404, f"Quarantined skill '{name}' not found")

    q_file.unlink()
    _write_audit_entry("delete_quarantine", name, "quarantine")

    return {"success": True, "message": f"Quarantined skill '{name}' deleted permanently"}


@router.get("/taps")
async def list_taps():
    """List configured skill taps (sources)."""
    _ensure_hub_dirs()
    taps = []

    if TAPS_FILE.exists():
        try:
            data = json.loads(TAPS_FILE.read_text(errors="replace"))
            if isinstance(data, list):
                taps = data
            elif isinstance(data, dict):
                taps = data.get("taps", data.get("sources", []))
        except json.JSONDecodeError:
            pass

    return {"taps": taps, "total": len(taps)}


class TapsAddRequest(BaseModel):
    url: str


class TapsRemoveRequest(BaseModel):
    url: str


@router.post("/taps")
async def add_tap(body: TapsAddRequest):
    """Add a new skill tap source."""
    _ensure_hub_dirs()
    url = body.url.strip()
    if not url:
        raise HTTPException(400, "URL is required")

    taps = _read_taps()
    if url in taps:
        return {"success": False, "message": f"Tap '{url}' already exists"}

    taps.append(url)
    _write_taps(taps)
    _write_audit_entry("add_tap", url, "taps")

    return {"success": True, "message": f"Tap '{url}' added"}


@router.delete("/taps")
async def remove_tap(body: TapsRemoveRequest):
    """Remove a skill tap source."""
    _ensure_hub_dirs()
    url = body.url.strip()
    if not url:
        raise HTTPException(400, "URL is required")

    taps = _read_taps()
    if url not in taps:
        return {"success": False, "message": f"Tap '{url}' not found"}

    taps.remove(url)
    _write_taps(taps)
    _write_audit_entry("remove_tap", url, "taps")

    return {"success": True, "message": f"Tap '{url}' removed"}


def _read_taps() -> list:
    """Read taps from file."""
    if not TAPS_FILE.exists():
        return []
    try:
        data = json.loads(TAPS_FILE.read_text(errors="replace"))
        if isinstance(data, list):
            return data
        elif isinstance(data, dict):
            return data.get("taps", data.get("sources", []))
    except json.JSONDecodeError:
        pass
    return []


def _write_taps(taps: list):
    """Write taps to file."""
    TAPS_FILE.write_text(json.dumps(taps, indent=2))


def _write_audit_entry(action: str, skill: str, source: str):
    """Append an entry to the audit log."""
    _ensure_hub_dirs()
    entry = {
        "timestamp": datetime.now(UTC).isoformat(),
        "action": action,
        "skill": skill,
        "source": source,
    }
    try:
        with open(AUDIT_LOG, "a") as f:
            f.write(json.dumps(entry) + "\n")
    except OSError:
        pass
