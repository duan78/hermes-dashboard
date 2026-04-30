"""Backup router — local archive access (download, restore, list, delete).

Local archives are legacy exports. The primary backup system is the
GitHub Config sync (see github_config.py).
"""

import logging
import tarfile
from datetime import datetime

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse

from ..config import HERMES_HOME

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/backup", tags=["backup"])

BACKUP_DIR = HERMES_HOME / "backups"


@router.get("/list")
async def list_backups():
    """List available local backup archives."""
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
    """Restore from a local backup archive."""
    body = await request.json()
    filename = body.get("filename", "").strip()
    if not filename:
        return {"success": False, "error": "Filename is required"}

    if "/" in filename or ".." in filename:
        return {"success": False, "error": "Invalid filename"}

    archive_path = BACKUP_DIR / filename
    if not archive_path.exists():
        return {"success": False, "error": "Backup file not found"}

    try:
        restored = []
        with tarfile.open(str(archive_path), "r:gz") as tar:
            for member in tar.getmembers():
                if member.name.startswith("/") or ".." in member.name:
                    continue
                if member.name == "manifest.json":
                    continue
                if member.name.endswith(".gpg"):
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
    """Delete a local backup archive."""
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
    """Download a local backup archive."""
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
