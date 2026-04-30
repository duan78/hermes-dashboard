"""Backup & Restore router — full 11-category local backup with optional GPG secrets."""

import io
import json
import logging
import os
import re
import shutil
import subprocess
import tarfile
import tempfile
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..config import HERMES_HOME

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/backup", tags=["backup"])

BACKUP_DIR = HERMES_HOME / "backups"
WIKI_DIR = Path.home() / "wiki"
DAILY_MEMORY_DIR = Path("/root/memory")
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB

SENSITIVE_RE = re.compile(
    r"(key|token|secret|password|api|auth|credential)", re.IGNORECASE
)

# ── Category definitions (same as github_config.py) ──

CORE_FILES = [
    ("SOUL.md", HERMES_HOME / "SOUL.md"),
    ("memories/MEMORY.md", HERMES_HOME / "memories" / "MEMORY.md"),
    ("memories/USER.md", HERMES_HOME / "memories" / "USER.md"),
    ("config.yaml", HERMES_HOME / "config.yaml"),
    ("backlog.json", HERMES_HOME / "backlog.json"),
    ("cron/jobs.json", HERMES_HOME / "cron" / "jobs.json"),
    ("dashboard_users.json", HERMES_HOME / "dashboard_users.json"),
    ("projects.json", HERMES_HOME / "projects.json"),
]

SHELL_FILES = [
    (".bashrc", Path.home() / ".bashrc"),
    (".gitconfig", Path.home() / ".gitconfig"),
    (".profile", Path.home() / ".profile"),
]

SYSTEM_CONFIGS = [
    ("system/crontab.txt", "crontab"),
    ("system/systemd/hermes-dashboard.service", Path("/etc/systemd/system/hermes-dashboard.service")),
    ("system/systemd/tmux-watchdog.service", Path("/etc/systemd/system/tmux-watchdog.service")),
    ("system/systemd/fine-tune-hermes.service", Path("/etc/systemd/system/fine-tune-hermes.service")),
    ("system/nginx/hermes-dashboard", Path("/etc/nginx/sites-available/hermes-dashboard")),
    ("system/nginx/monpotager-clean", Path("/etc/nginx/sites-available/monpotager-clean")),
    ("system/hosts.txt", Path("/etc/hosts")),
]

SECRET_FILES = [
    ("secrets/hermes.env.gpg", HERMES_HOME / ".env"),
    ("secrets/auth.json.gpg", HERMES_HOME / "auth.json"),
    ("secrets/ssh-known_hosts.gpg", Path.home() / ".ssh" / "known_hosts"),
]

GCLOUD_CONFIG_DIR = Path.home() / ".config" / "gcloud"

CLAUDE_CODE_FILES = [
    (".claude/CLAUDE.md", Path.home() / ".claude" / "CLAUDE.md"),
    (".claude/RTK.md", Path.home() / ".claude" / "RTK.md"),
]

ALL_CATEGORIES = [
    "core", "shell", "scripts", "skills", "wiki", "system",
    "secrets", "claude_code", "daily_memories", "manifests", "docs",
]


# ── Helpers ──


def _gpg_encrypt_bytes(data: bytes, passphrase: str) -> bytes | None:
    """Encrypt bytes with GPG symmetric AES256, return encrypted bytes."""
    try:
        result = subprocess.run(
            [
                "gpg", "--batch", "--yes",
                "--passphrase", passphrase,
                "--symmetric",
                "--cipher-algo", "AES256",
                "-o", "-",
                "/dev/stdin",
            ],
            input=data,
            capture_output=True,
            timeout=60,
        )
        if result.returncode == 0:
            return result.stdout
        logger.warning("GPG encrypt failed: %s", result.stderr.decode(errors="replace").strip())
        return None
    except Exception as e:
        logger.warning("GPG encrypt error: %s", e)
        return None


def _collect_dir(directory: Path, prefix: str, exclude_env: bool = True) -> list[tuple[str, Path]]:
    """Recursively collect files from a directory."""
    files = []
    if not directory.exists():
        return files
    for f in directory.rglob("*"):
        if not f.is_file():
            continue
        if exclude_env and f.name == ".env":
            continue
        if f.stat().st_size >= MAX_FILE_SIZE:
            continue
        rel = f.relative_to(directory)
        files.append((f"{prefix}/{rel}", f))
    return files


def _generate_manifests() -> list[tuple[str, bytes]]:
    """Generate manifest files dynamically."""
    manifests = []

    # npm-globals.txt
    try:
        result = subprocess.run(["npm", "list", "-g", "--depth=0"], capture_output=True, text=True, timeout=15)
        manifests.append(("npm-globals.txt", result.stdout.encode()))
    except Exception:
        manifests.append(("npm-globals.txt", b"# npm not available"))

    # env-vars.txt
    env_vars = sorted(f"{k}={'***' if SENSITIVE_RE.search(k) else v}" for k, v in os.environ.items())
    manifests.append(("env-vars.txt", "\n".join(env_vars).encode()))

    # project-repos.txt
    repos = []
    for d in Path.home().iterdir():
        if (d / ".git").is_dir():
            try:
                url = subprocess.run(
                    ["git", "-C", str(d), "remote", "get-url", "origin"],
                    capture_output=True, text=True, timeout=5,
                )
                repos.append(f"{d.name}: {url.stdout.strip()}")
            except Exception:
                repos.append(f"{d.name}: (no remote)")
    manifests.append(("project-repos.txt", "\n".join(sorted(repos)).encode()))

    # system-packages.txt
    try:
        result = subprocess.run(["dpkg", "--get-selections"], capture_output=True, text=True, timeout=15)
        lines = [l for l in result.stdout.splitlines() if "deinstall" not in l][:500]
        manifests.append(("system-packages.txt", "\n".join(lines).encode()))
    except Exception:
        manifests.append(("system-packages.txt", b"# dpkg not available"))

    return manifests


def _generate_docs() -> list[tuple[str, str]]:
    """Generate documentation files."""
    restore_md = """# Hermes — Guide de Restauration

## Prérequis
- Ubuntu 24.04, accès root

## Restauration
1. Extraire l'archive : `tar xzf hermes_backup_YYYYMMDD_HHMMSS.tar.gz -C ~/.hermes-restore/`
2. Copier les fichiers core : `cp SOUL.md config.yaml ~/.hermes/`
3. Copier scripts/ skills/ wiki/ dans ~/.hermes/
4. Copier .bashrc .gitconfig .profile dans ~/
5. Restaurer systemd : `cp system/systemd/*.service /etc/systemd/system/ && systemctl daemon-reload`
6. Restaurer nginx : `cp system/nginx/* /etc/nginx/sites-available/ && nginx -t && systemctl reload nginx`
7. Importer crontab : `crontab system/crontab.txt`
8. Copier hosts : `cp system/hosts.txt /etc/hosts`

## Secrets (GPG)
```bash
gpg --decrypt secrets/hermes.env.gpg > ~/.hermes/.env
gpg --decrypt secrets/auth.json.gpg > ~/.hermes/auth.json
gpg --decrypt secrets/ssh-known_hosts.gpg > ~/.ssh/known_hosts
gpg --decrypt secrets/gcloud-config.tar.gz.gpg | tar xzf - -C ~/.config/gcloud/
```

## Vérification
`systemctl restart hermes-dashboard tmux-watchdog && hermes status`
"""
    install_sh = """#!/bin/bash
# Hermes auto-install script
set -e
echo "Restoring Hermes from backup..."
# Add your install logic here
"""
    restore_sh = """#!/bin/bash
# Hermes restore script
set -e
BACKUP_DIR="$1"
if [ -z "$BACKUP_DIR" ]; then echo "Usage: $0 <backup_dir>"; exit 1; fi
cp -v "$BACKUP_DIR/SOUL.md" ~/.hermes/SOUL.md 2>/dev/null || true
cp -v "$BACKUP_DIR/config.yaml" ~/.hermes/config.yaml 2>/dev/null || true
cp -rv "$BACKUP_DIR/scripts" ~/.hermes/scripts/ 2>/dev/null || true
cp -rv "$BACKUP_DIR/skills" ~/.hermes/skills/ 2>/dev/null || true
echo "Basic restore complete. See RESTORE.md for full instructions."
"""
    return [
        ("RESTORE.md", restore_md),
        ("install.sh", install_sh),
        ("restore.sh", restore_sh),
    ]


# ── Archive creation ──


def _create_archive(
    categories: list[str] | None = None,
    include_secrets: bool = True,
    description: str = "",
) -> dict:
    """Create a tar.gz backup archive with selected categories."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    if not categories:
        categories = list(ALL_CATEGORIES)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"hermes_backup_{timestamp}.tar.gz"
    archive_path = BACKUP_DIR / filename

    # Collect all files as (archive_name, data_bytes, category)
    entries: list[tuple[str, bytes, str]] = []
    stats = {cat: 0 for cat in ALL_CATEGORIES}
    manifest: list[dict] = []

    def _add_file(arc_name: str, src_path: Path, category: str):
        if not src_path.exists():
            return
        try:
            data = src_path.read_bytes()
        except Exception:
            return
        entries.append((arc_name, data, category))
        stats[category] = stats.get(category, 0) + 1
        manifest.append({"path": arc_name, "category": category, "size": len(data)})

    def _add_bytes(arc_name: str, data: bytes, category: str):
        entries.append((arc_name, data, category))
        stats[category] = stats.get(category, 0) + 1
        manifest.append({"path": arc_name, "category": category, "size": len(data)})

    # ── 1. Core ──
    if "core" in categories:
        for arc_name, src_path in CORE_FILES:
            _add_file(arc_name, src_path, "core")

    # ── 2. Shell ──
    if "shell" in categories:
        for arc_name, src_path in SHELL_FILES:
            _add_file(arc_name, src_path, "shell")

    # ── 3. Scripts ──
    if "scripts" in categories:
        for arc_name, src_path in _collect_dir(HERMES_HOME / "scripts", "scripts"):
            _add_file(arc_name, src_path, "scripts")

    # ── 4. Skills ──
    if "skills" in categories:
        for arc_name, src_path in _collect_dir(HERMES_HOME / "skills", "skills"):
            _add_file(arc_name, src_path, "skills")

    # ── 5. Wiki ──
    if "wiki" in categories:
        for arc_name, src_path in _collect_dir(WIKI_DIR, "wiki"):
            _add_file(arc_name, src_path, "wiki")

    # ── 6. System ──
    if "system" in categories:
        for arc_name, source in SYSTEM_CONFIGS:
            if source == "crontab":
                try:
                    result = subprocess.run(
                        ["crontab", "-l"], capture_output=True, text=True, timeout=10,
                    )
                    if result.returncode == 0:
                        _add_bytes(arc_name, result.stdout.encode(), "system")
                except Exception:
                    pass
            elif isinstance(source, Path) and source.exists():
                _add_file(arc_name, source, "system")

    # ── 7. Secrets (GPG encrypted) ──
    if "secrets" in categories and include_secrets:
        passphrase = os.environ.get("HERMES_BACKUP_PASSPHRASE", "hermes-backup-2026")
        for arc_name, src_path in SECRET_FILES:
            if not src_path.exists():
                continue
            try:
                plain = src_path.read_bytes()
            except Exception:
                continue
            encrypted = _gpg_encrypt_bytes(plain, passphrase)
            if encrypted:
                _add_bytes(arc_name, encrypted, "secrets")

        # gcloud config as tar.gz.gpg
        if GCLOUD_CONFIG_DIR.exists():
            try:
                buf = io.BytesIO()
                with tarfile.open(fileobj=buf, mode="w:gz") as tar:
                    for item in GCLOUD_CONFIG_DIR.rglob("*"):
                        if item.is_file() and item.stat().st_size < MAX_FILE_SIZE:
                            tar.add(item, arcname=str(item.relative_to(GCLOUD_CONFIG_DIR)))
                encrypted = _gpg_encrypt_bytes(buf.getvalue(), passphrase)
                if encrypted:
                    _add_bytes("secrets/gcloud-config.tar.gz.gpg", encrypted, "secrets")
            except Exception as e:
                logger.warning("gcloud backup failed: %s", e)

    # ── 8. Claude Code ──
    if "claude_code" in categories:
        for arc_name, src_path in CLAUDE_CODE_FILES:
            _add_file(arc_name, src_path, "claude_code")

    # ── 9. Daily Memories ──
    if "daily_memories" in categories:
        if DAILY_MEMORY_DIR.exists():
            date_re = re.compile(r"^\d{4}-\d{2}-\d{2}\.md$")
            daily_files = sorted(
                [f for f in DAILY_MEMORY_DIR.iterdir() if f.is_file() and date_re.match(f.name)],
                reverse=True,
            )[:30]
            for f in daily_files:
                _add_file(f"memories/daily/{f.name}", f, "daily_memories")

    # ── 10. Manifests ──
    if "manifests" in categories:
        for arc_name, data in _generate_manifests():
            _add_bytes(arc_name, data, "manifests")

    # ── 11. Docs ──
    if "docs" in categories:
        for arc_name, content in _generate_docs():
            _add_bytes(arc_name, content.encode(), "docs")

    # ── Write manifest.json inside archive ──
    total_files = len(entries)
    manifest_json = json.dumps({
        "timestamp": timestamp,
        "description": description,
        "categories": categories,
        "stats": {k: v for k, v in stats.items() if v > 0},
        "total_files": total_files,
        "files": manifest,
    }, indent=2).encode()
    # Don't count manifest.json in stats

    # ── Build tar.gz ──
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for arc_name, data, _category in entries:
            info = tarfile.TarInfo(name=arc_name)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))

        # Add manifest.json
        info = tarfile.TarInfo(name="manifest.json")
        info.size = len(manifest_json)
        tar.addfile(info, io.BytesIO(manifest_json))

    buf.seek(0)
    archive_path.write_bytes(buf.read())

    logger.info("Backup created: %s (%d files, %d bytes)", filename, total_files, archive_path.stat().st_size)

    return {
        "success": True,
        "filename": filename,
        "size_bytes": archive_path.stat().st_size,
        "path": str(archive_path),
        "description": description,
        "categories": categories,
        "stats": {k: v for k, v in stats.items() if v > 0},
        "total_files": total_files,
        "manifest": manifest,
    }


# ── Models ──


class BackupCreateRequest(BaseModel):
    categories: list[str] | None = None
    include_secrets: bool = True
    description: str = ""


# ── Endpoints ──


@router.post("/create")
async def create_backup(req: BackupCreateRequest = BackupCreateRequest()):
    """Create a new backup archive with selected categories."""
    categories = req.categories if req.categories else None
    try:
        result = _create_archive(
            categories=categories,
            include_secrets=req.include_secrets,
            description=req.description,
        )
        return result
    except Exception as e:
        logger.error("Backup creation failed: %s", e)
        return {"success": False, "error": str(e)}


@router.get("/list")
async def list_backups():
    """List available backup archives with metadata."""
    if not BACKUP_DIR.exists():
        return {"backups": []}

    backups = []
    for f in sorted(BACKUP_DIR.glob("*.tar.gz"), reverse=True):
        stat = f.stat()
        entry = {
            "filename": f.name,
            "size_mb": round(stat.st_size / (1024 * 1024), 2),
            "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        }

        # Try to read manifest.json from archive for metadata
        try:
            with tarfile.open(str(f), "r:gz") as tar:
                for member in tar.getmembers():
                    if member.name == "manifest.json":
                        mf = tar.extractfile(member)
                        if mf:
                            meta = json.loads(mf.read())
                            entry["description"] = meta.get("description", "")
                            entry["stats"] = meta.get("stats", {})
                            entry["total_files"] = meta.get("total_files", 0)
                            entry["categories"] = meta.get("categories", [])
                        break
        except Exception:
            pass

        backups.append(entry)
    return {"backups": backups}


@router.get("/inspect/{filename}")
async def inspect_backup(filename: str):
    """Inspect a backup archive: list files and stats."""
    if "/" in filename or ".." in filename:
        raise HTTPException(400, "Invalid filename")
    path = BACKUP_DIR / filename
    if not path.exists():
        raise HTTPException(404, "Backup not found")

    try:
        with tarfile.open(str(path), "r:gz") as tar:
            members = tar.getmembers()
            manifest_data = None

            # Extract manifest.json
            for member in members:
                if member.name == "manifest.json":
                    mf = tar.extractfile(member)
                    if mf:
                        manifest_data = json.loads(mf.read())
                    break

            # Build file list
            files = []
            for member in members:
                if member.name == "manifest.json":
                    continue
                if not member.isfile():
                    continue
                category = "unknown"
                if manifest_data:
                    for f_info in manifest_data.get("files", []):
                        if f_info["path"] == member.name:
                            category = f_info["category"]
                            break
                files.append({
                    "path": member.name,
                    "size": member.size,
                    "category": category,
                })

            result = {
                "filename": filename,
                "size_bytes": path.stat().st_size,
                "total_files": len(files),
                "files": files,
            }

            if manifest_data:
                result["description"] = manifest_data.get("description", "")
                result["stats"] = manifest_data.get("stats", {})
                result["categories"] = manifest_data.get("categories", [])

            return result
    except Exception as e:
        raise HTTPException(500, f"Failed to inspect backup: {e}")


@router.post("/restore")
async def restore_backup(request: Request):
    """Restore from a backup archive."""
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
                # Skip manifest.json and encrypted secrets during simple restore
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
