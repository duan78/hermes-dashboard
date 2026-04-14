import io
import logging
import tarfile
from datetime import datetime

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse

from ..config import HERMES_HOME

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/backup", tags=["backup"])

BACKUP_DIR = HERMES_HOME / "backups"

SENSITIVE_RE = __import__("re").compile(
    r"(key|token|secret|password|api|auth|credential)", __import__("re").IGNORECASE
)


def _create_archive(include_env: bool = True, include_skills: bool = True) -> dict:
    """Create a tar.gz backup archive."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"hermes_backup_{timestamp}.tar.gz"
    archive_path = BACKUP_DIR / filename

    files_to_backup = [
        ("SOUL.md", HERMES_HOME / "SOUL.md"),
        ("memories/MEMORY.md", HERMES_HOME / "memories" / "MEMORY.md"),
        ("memories/USER.md", HERMES_HOME / "memories" / "USER.md"),
        ("config.yaml", HERMES_HOME / "config.yaml"),
        ("backlog.json", HERMES_HOME / "backlog.json"),
    ]

    if include_env:
        files_to_backup.append((".env", HERMES_HOME / ".env"))

    if include_skills:
        skills_dir = HERMES_HOME / "skills"
        if skills_dir.exists():
            for f in skills_dir.rglob("*"):
                if f.is_file() and f.stat().st_size < 5 * 1024 * 1024:  # Max 5MB per file
                    rel = f.relative_to(HERMES_HOME)
                    files_to_backup.append((str(rel), f))

    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for arc_name, src_path in files_to_backup:
            if not src_path.exists():
                continue
            data = src_path.read_bytes()
            info = tarfile.TarInfo(name=arc_name)
            info.size = len(data)
            info.mtime = src_path.stat().st_mtime
            tar.addfile(info, io.BytesIO(data))

    buf.seek(0)
    archive_path.write_bytes(buf.read())

    return {
        "success": True,
        "filename": filename,
        "size_bytes": archive_path.stat().st_size,
        "path": str(archive_path),
    }


@router.post("/create")
async def create_backup(request: Request):
    """Create a new backup archive."""
    body = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
    include_env = body.get("include_env", True)
    include_skills = body.get("include_skills", True)
    try:
        result = _create_archive(include_env=include_env, include_skills=include_skills)
        logger.info("Backup created: %s", result.get("filename", "unknown"))
        return result
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/list")
async def list_backups():
    """List available backup archives."""
    if not BACKUP_DIR.exists():
        return {"backups": []}

    backups = []
    for f in sorted(BACKUP_DIR.glob("*.tar.gz"), reverse=True):
        stat = f.stat()
        backups.append({
            "filename": f.name,
            "size_mb": round(stat.st_size / (1024 * 1024), 2),
            "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        })
    return {"backups": backups}


@router.post("/restore")
async def restore_backup(request: Request):
    """Restore from a backup archive."""
    body = await request.json()
    filename = body.get("filename", "").strip()
    if not filename:
        return {"success": False, "error": "Filename is required"}

    # Security: prevent path traversal
    if "/" in filename or ".." in filename:
        return {"success": False, "error": "Invalid filename"}

    archive_path = BACKUP_DIR / filename
    if not archive_path.exists():
        return {"success": False, "error": "Backup file not found"}

    try:
        restored = []
        with tarfile.open(str(archive_path), "r:gz") as tar:
            for member in tar.getmembers():
                # Security check
                if member.name.startswith("/") or ".." in member.name:
                    continue
                target = HERMES_HOME / member.name
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                elif member.isfile():
                    target.parent.mkdir(parents=True, exist_ok=True)
                    f = tar.extractfile(member)
                    if f:
                        target.write_bytes(f.read())
                        restored.append(member.name)
        logger.info("Backup restored: %s (%d files)", filename, len(restored))
        return {"success": True, "restored_files": restored, "output": f"Restored {len(restored)} files"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.delete("/delete")
async def delete_backup(request: Request):
    """Delete a backup archive."""
    body = await request.json()
    filename = body.get("filename", "").strip()
    if not filename:
        return {"success": False}
    if "/" in filename or ".." in filename:
        return {"success": False}
    archive_path = BACKUP_DIR / filename
    if archive_path.exists():
        archive_path.unlink()
    return {"success": True}


@router.get("/download/{filename}")
async def download_backup(filename: str):
    """Download a backup archive."""
    if "/" in filename or ".." in filename:
        return {"error": "Invalid filename"}
    archive_path = BACKUP_DIR / filename
    if not archive_path.exists():
        return {"error": "File not found"}
    return FileResponse(
        str(archive_path),
        media_type="application/gzip",
        filename=filename,
    )
