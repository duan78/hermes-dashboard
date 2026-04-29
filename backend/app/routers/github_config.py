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

from fastapi import APIRouter

from ..config import HERMES_HOME

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/github-config", tags=["github-config"])

GITHUB_REPO = "duan78/hermes-config"
WIKI_DIR = Path.home() / "wiki"

SENSITIVE_RE = re.compile(
    r"(key|token|secret|password|api|auth|credential)", re.IGNORECASE
)

# --- Configuration lists ---

# Core Hermes files
CORE_FILES = [
    ("SOUL.md", HERMES_HOME / "SOUL.md"),
    ("memories/MEMORY.md", HERMES_HOME / "memories" / "MEMORY.md"),
    ("memories/USER.md", HERMES_HOME / "memories" / "USER.md"),
    ("config.yaml", HERMES_HOME / "config.yaml"),
    ("backlog.json", HERMES_HOME / "backlog.json"),
]

# Extended files
EXTENDED_FILES = [
    ("cron/jobs.json", HERMES_HOME / "cron" / "jobs.json"),
    ("dashboard_users.json", HERMES_HOME / "dashboard_users.json"),
    ("projects.json", HERMES_HOME / "projects.json"),
    (".bashrc", Path.home() / ".bashrc"),
    (".gitconfig", Path.home() / ".gitconfig"),
    (".profile", Path.home() / ".profile"),
]

# System configs (path_in_repo -> system source)
SYSTEM_CONFIGS = [
    ("system/crontab.txt", "crontab"),           # special: dump via crontab -l
    ("system/systemd/hermes-dashboard.service", Path("/etc/systemd/system/hermes-dashboard.service")),
    ("system/systemd/tmux-watchdog.service", Path("/etc/systemd/system/tmux-watchdog.service")),
    ("system/systemd/fine-tune-hermes.service", Path("/etc/systemd/system/fine-tune-hermes.service")),
    ("system/nginx/hermes-dashboard", Path("/etc/nginx/sites-available/hermes-dashboard")),
    ("system/nginx/monpotager-clean", Path("/etc/nginx/sites-available/monpotager-clean")),
]

# Secret files to encrypt with GPG
SECRET_FILES = [
    ("secrets/hermes.env.gpg", HERMES_HOME / ".env"),
    ("secrets/auth.json.gpg", HERMES_HOME / "auth.json"),
    ("secrets/ssh-known_hosts.gpg", Path.home() / ".ssh" / "known_hosts"),
]

# gcloud config directory (will be tarred + encrypted)
GCLOUD_CONFIG_DIR = Path.home() / ".config" / "gcloud"


def _run_gh(args: list[str], timeout: int = 30) -> dict | list:
    """Run a gh CLI command and return parsed JSON output."""
    try:
        result = subprocess.run(
            ["gh"] + args,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        if result.returncode != 0:
            err = result.stderr.strip()
            if "not found" in err.lower() or "command not found" in err.lower():
                raise FileNotFoundError("gh CLI is not installed")
            if "authentication" in err.lower() or "not logged in" in err.lower():
                raise PermissionError("gh CLI is not authenticated. Run: gh auth login")
            if "not found" in err.lower() or "404" in err:
                raise ValueError(f"Repository {GITHUB_REPO} not found or inaccessible")
            raise RuntimeError(err)
        return json.loads(result.stdout)
    except FileNotFoundError:
        raise FileNotFoundError("gh CLI is not installed")
    except json.JSONDecodeError:
        raise RuntimeError("Failed to parse gh CLI output")


def _count_files_in_dir(directory: Path) -> int:
    """Count files recursively in a directory."""
    if not directory.exists():
        return 0
    return sum(1 for f in directory.rglob("*") if f.is_file())


def _dir_size(directory: Path) -> int:
    """Total size of files in a directory in bytes."""
    if not directory.exists():
        return 0
    return sum(f.stat().st_size for f in directory.rglob("*") if f.is_file())


def _copy_system_configs(repo_dir: Path) -> list[str]:
    """Copy system configuration files into the repo."""
    files_pushed = []

    for arc_name, source in SYSTEM_CONFIGS:
        dest = repo_dir / arc_name
        dest.parent.mkdir(parents=True, exist_ok=True)

        if source == "crontab":
            # Special case: dump crontab
            try:
                result = subprocess.run(
                    ["crontab", "-l"],
                    capture_output=True,
                    text=True,
                    timeout=10,
                )
                if result.returncode == 0:
                    dest.write_text(result.stdout)
                    files_pushed.append(arc_name)
                    logger.info("System config: backed up crontab (%d lines)", len(result.stdout.splitlines()))
                else:
                    logger.warning("System config: could not dump crontab: %s", result.stderr.strip())
            except Exception as e:
                logger.warning("System config: crontab dump failed: %s", e)
        else:
            # File-based system config
            if isinstance(source, Path) and source.exists():
                shutil.copy2(source, dest)
                files_pushed.append(arc_name)
                logger.info("System config: copied %s", arc_name)
            else:
                logger.info("System config: skipped %s (not found)", arc_name)

    return files_pushed


def _gpg_encrypt_file(input_path: Path, output_path: Path, passphrase: str) -> bool:
    """Encrypt a single file with GPG symmetric encryption."""
    try:
        result = subprocess.run(
            [
                "gpg", "--batch", "--yes",
                "--passphrase", passphrase,
                "--symmetric",
                "--cipher-algo", "AES256",
                "-o", str(output_path),
                str(input_path),
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode == 0:
            return True
        logger.warning("GPG encrypt failed for %s: %s", input_path.name, result.stderr.strip())
        return False
    except Exception as e:
        logger.warning("GPG encrypt error for %s: %s", input_path.name, e)
        return False


def _copy_secrets(repo_dir: Path) -> list[str]:
    """Encrypt and copy secret files into the repo."""
    files_pushed = []

    # Check GPG availability
    try:
        result = subprocess.run(
            ["which", "gpg"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode != 0:
            logger.warning("Secrets: GPG not installed, skipping encrypted secrets backup")
            return files_pushed
    except Exception:
        logger.warning("Secrets: could not check GPG availability, skipping")
        return files_pushed

    # Get passphrase
    passphrase = os.environ.get("HERMES_BACKUP_PASSPHRASE", "hermes-backup-2026")
    if "HERMES_BACKUP_PASSPHRASE" not in os.environ:
        logger.warning(
            "Secrets: HERMES_BACKUP_PASSPHRASE not set, using default passphrase. "
            "Set this env var for production security!"
        )

    secrets_dir = repo_dir / "secrets"
    secrets_dir.mkdir(parents=True, exist_ok=True)

    # Encrypt individual secret files
    for arc_name, src_path in SECRET_FILES:
        if not src_path.exists():
            logger.info("Secrets: skipped %s (not found)", arc_name)
            continue

        dest = repo_dir / arc_name
        if _gpg_encrypt_file(src_path, dest, passphrase):
            files_pushed.append(arc_name)
            logger.info("Secrets: encrypted %s (%d bytes -> .gpg)", arc_name, src_path.stat().st_size)
        else:
            logger.warning("Secrets: failed to encrypt %s", arc_name)

    # Encrypt gcloud config directory as tar.gz
    if GCLOUD_CONFIG_DIR.exists():
        gcloud_dest = repo_dir / "secrets" / "gcloud-config.tar.gz.gpg"
        with tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False) as tmp:
            tmp_path = Path(tmp.name)

        try:
            with tarfile.open(tmp_path, "w:gz") as tar:
                for item in GCLOUD_CONFIG_DIR.rglob("*"):
                    if item.is_file():
                        arcname = item.relative_to(GCLOUD_CONFIG_DIR)
                        tar.add(item, arcname=arcname)

            if _gpg_encrypt_file(tmp_path, gcloud_dest, passphrase):
                files_pushed.append("secrets/gcloud-config.tar.gz.gpg")
                logger.info("Secrets: encrypted gcloud config (%d bytes)", tmp_path.stat().st_size)
            else:
                logger.warning("Secrets: failed to encrypt gcloud config")
        except Exception as e:
            logger.warning("Secrets: gcloud config backup failed: %s", e)
        finally:
            try:
                tmp_path.unlink(missing_ok=True)
            except Exception:
                pass

    return files_pushed


DAILY_MEMORY_DIR = Path("/root/memory")


def _copy_daily_memories(repo_dir: Path, max_days: int = 30) -> list[str]:
    """Copy the last N daily memory files into the repo."""
    files_pushed = []
    memories_dir = DAILY_MEMORY_DIR
    if not memories_dir.exists():
        return files_pushed

    import re as _re
    date_pattern = _re.compile(r"^\d{4}-\d{2}-\d{2}\.md$")

    daily_files = []
    for f in memories_dir.iterdir():
        if f.is_file() and date_pattern.match(f.name):
            daily_files.append(f.name)

    # Sort by date descending (filename IS the date)
    daily_files.sort(reverse=True)

    # Take the most recent max_days
    daily_files = daily_files[:max_days]

    if not daily_files:
        logger.info("Daily memories: no daily memory files found")
        return files_pushed

    daily_dest = repo_dir / "memories" / "daily"
    daily_dest.mkdir(parents=True, exist_ok=True)

    for fname in daily_files:
        src = memories_dir / fname
        dest = daily_dest / fname
        shutil.copy2(src, dest)
        files_pushed.append(f"memories/daily/{fname}")

    logger.info("Daily memories: copied %d files", len(files_pushed))
    return files_pushed


RESTORE_MD = """# Sam — Guide de Restauration

## Prérequis
- Ubuntu 24.04
- Accès root

## Installation de base
1. Installer les dépendances : voir SYSTEM_REQUIREMENTS.md
2. Installer Node.js 24, Python 3.12, gcloud CLI, gh CLI
3. Cloner ce repo : `gh repo clone duan78/hermes-config`

## Restauration des fichiers
1. Copier `SOUL.md`, `config.yaml` dans `~/.hermes/`
2. Copier `scripts/` dans `~/.hermes/scripts/`
3. Copier `skills/` dans `~/.hermes/skills/`
4. Copier `.bashrc`, `.gitconfig` dans `~/`
5. Copier `memories/` dans `~/.hermes/memories/`
6. Restaurer les services systemd depuis `system/` :
   ```
   cp system/systemd/*.service /etc/systemd/system/
   systemctl daemon-reload
   ```
7. Restaurer nginx configs depuis `system/nginx/` :
   ```
   cp system/nginx/* /etc/nginx/sites-available/
   ln -sf /etc/nginx/sites-available/hermes-dashboard /etc/nginx/sites-enabled/
   nginx -t && systemctl reload nginx
   ```
8. Importer le crontab : `crontab system/crontab.txt`

## Secrets
Les secrets sont chiffrés avec GPG (AES256, chiffrement symétrique).
1. Déchiffrer avec le mot de passe de backup :
   ```bash
   gpg --decrypt secrets/hermes.env.gpg > ~/.hermes/.env
   gpg --decrypt secrets/auth.json.gpg > ~/.hermes/auth.json
   gpg --decrypt secrets/ssh-known_hosts.gpg > ~/.ssh/known_hosts
   gpg --decrypt secrets/gcloud-config.tar.gz.gpg | tar xzf - -C ~/.config/gcloud/
   ```
2. Définir le mot de passe via : `export HERMES_BACKUP_PASSPHRASE=...`

## Vérification
1. Relancer les services : `systemctl restart hermes-dashboard tmux-watchdog`
2. Vérifier : `hermes status`
3. Vérifier le dashboard : `curl http://localhost:8000/api/github-config/status`
"""

SYSTEM_REQUIREMENTS_MD = """# Sam — Configuration Système Requise

## Système d'exploitation
- Ubuntu 24.04 LTS (recommandé)

## Outils essentiels

### Node.js
- Version : 24.x (LTS)
- Installation : `curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt-get install -y nodejs`

### Python
- Version : 3.11+ (3.12 recommandé)
- Gestion des packages : pip, uv

### CLI Tools
- **gh** (GitHub CLI) : `gh auth login`
- **gcloud** (Google Cloud CLI) : `gcloud auth login`
- **tmux** : sessions persistantes

### GPG
- Version : 2.4+ (gnupg)
- Utilisé pour le chiffrement des secrets lors du backup

### nginx
- Reverse proxy pour le dashboard
- Config dans `/etc/nginx/sites-available/hermes-dashboard`

### Certbot
- Certificats SSL/TLS Let's Encrypt
- `certbot --nginx -d votre-domaine.com`

### Tailscale
- VPN mesh pour accès sécurisé
- `tailscale up`

### Outils optionnels
- **Ollama** : LLM local
- **Docker** : conteneurs (si utilisé)

## Services systemd
- `hermes-dashboard.service` : Dashboard FastAPI
- `tmux-watchdog.service` : Surveillant de sessions tmux
- `fine-tune-hermes.service` : Fine-tuning de modèles (si utilisé)

## Repos GitHub clés
- `duan78/hermes-config` : Configuration et backup
- `duan78/hermes-dashboard` : Dashboard web
- `duan78/hermes-backend` : Backend principal
- `duan78/monpotager-clean` : Site monpotager (nginx config)

## Répertoires importants
- `~/.hermes/` : Configuration principale de Sam
- `~/wiki/` : Base de connaissances
- `~/.config/gcloud/` : Configuration Google Cloud
- `~/.ssh/` : Clés et known_hosts
"""


def _generate_docs(repo_dir: Path) -> list[str]:
    """Write RESTORE.md and SYSTEM_REQUIREMENTS.md into the repo."""
    files_pushed = []

    restore_path = repo_dir / "RESTORE.md"
    restore_path.write_text(RESTORE_MD)
    files_pushed.append("RESTORE.md")

    req_path = repo_dir / "SYSTEM_REQUIREMENTS.md"
    req_path.write_text(SYSTEM_REQUIREMENTS_MD)
    files_pushed.append("SYSTEM_REQUIREMENTS.md")

    logger.info("Docs: generated RESTORE.md and SYSTEM_REQUIREMENTS.md")
    return files_pushed


@router.get("/status")
async def get_status():
    """Check the status of the GitHub config repository."""
    try:
        data = _run_gh([
            "repo", "view", GITHUB_REPO,
            "--json", "isPrivate,updatedAt,pushedAt,defaultBranchRef",
        ])

        branch = data.get("defaultBranchRef", {}).get("name", "main") if isinstance(data.get("defaultBranchRef"), dict) else "main"

        # Get last commit
        commits = _run_gh([
            "api", f"repos/{GITHUB_REPO}/commits?per_page=1",
        ])
        last_commit = None
        last_commit_date = None
        if commits and isinstance(commits, list) and len(commits) > 0:
            last_commit = commits[0].get("sha", "")[:7]
            last_commit_date = commits[0].get("commit", {}).get("author", {}).get("date")

        # Get file count and categorization
        contents = _run_gh([
            "api", f"repos/{GITHUB_REPO}/contents/",
        ])
        file_count = len(contents) if isinstance(contents, list) else 0

        # Build filesByCategory from directory listing
        files_by_category = {
            "core": 0,
            "scripts": 0,
            "system": 0,
            "secrets": 0,
            "memories": 0,
            "skills": 0,
            "wiki": 0,
            "docs": 0,
        }

        if isinstance(contents, list):
            dir_names = {item.get("name", "") for item in contents if item.get("type") == "dir"}
            file_names = {item.get("name", "") for item in contents if item.get("type") == "file"}

            # Core files
            for f in ["SOUL.md", "config.yaml", "backlog.json"]:
                if f in file_names:
                    files_by_category["core"] += 1
            # Dashboard configs
            for f in ["dashboard_users.json", "projects.json", ".bashrc", ".gitconfig", ".profile"]:
                if f in file_names:
                    files_by_category["core"] += 1
            # Docs
            for f in ["RESTORE.md", "SYSTEM_REQUIREMENTS.md"]:
                if f in file_names:
                    files_by_category["docs"] += 1

            # Count files in each directory via API
            category_dirs = {
                "scripts": "scripts",
                "system": "system",
                "secrets": "secrets",
                "skills": "skills",
                "wiki": "wiki",
                "memories": "memories",
            }
            for cat, dirname in category_dirs.items():
                if dirname in dir_names:
                    try:
                        sub = _run_gh([
                            "api", f"repos/{GITHUB_REPO}/contents/{dirname}",
                        ])
                        if isinstance(sub, list):
                            files_by_category[cat] = len(sub)
                    except Exception:
                        pass

        total = sum(files_by_category.values())

        return {
            "connected": True,
            "isPrivate": data.get("isPrivate", False),
            "updatedAt": data.get("updatedAt"),
            "pushedAt": data.get("pushedAt"),
            "branch": branch,
            "lastCommit": last_commit,
            "lastBackupDate": last_commit_date,
            "lastCommitDate": last_commit_date,
            "fileCount": file_count,
            "filesByCategory": files_by_category,
            "totalFiles": total,
        }
    except FileNotFoundError as e:
        return {"connected": False, "error": str(e)}
    except PermissionError as e:
        return {"connected": False, "error": str(e)}
    except ValueError as e:
        return {"connected": False, "error": str(e)}
    except Exception as e:
        logger.warning("GitHub config status check failed: %s", str(e))
        return {"connected": False, "error": str(e)}


@router.post("/sync")
async def sync_to_github():
    """Export current Hermes configuration to the GitHub repository.

    Backs up: core files, skills, wiki, scripts, system configs,
    daily memories, encrypted secrets, and documentation.
    """
    tmp_dir = None
    try:
        tmp_dir = tempfile.mkdtemp(prefix="hermes-config-sync-")
        repo_dir = Path(tmp_dir) / "hermes-config"
        repo_dir.mkdir(exist_ok=True)

        # Clone the repo (shallow clone)
        clone_result = subprocess.run(
            ["gh", "repo", "clone", GITHUB_REPO, str(repo_dir), "--", "--depth", "1"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if clone_result.returncode != 0:
            raise RuntimeError(f"Failed to clone repo: {clone_result.stderr.strip()}")

        # Remove all existing files in the repo (except .git)
        for item in repo_dir.iterdir():
            if item.name == ".git":
                continue
            if item.is_dir():
                shutil.rmtree(item)
            else:
                item.unlink()

        files_pushed = []
        stats = {"core": 0, "scripts": 0, "system": 0, "secrets": 0,
                 "memories": 0, "daily_memories": 0, "skills": 0, "wiki": 0, "docs": 0}

        # ── 1. Core Hermes files ──
        for arc_name, src_path in CORE_FILES:
            if not src_path.exists():
                continue
            dest = repo_dir / arc_name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src_path, dest)
            files_pushed.append(arc_name)
            stats["core"] += 1
        logger.info("Core: copied %d files", stats["core"])

        # ── 2. Extended files (cron, dashboard, shell config) ──
        for arc_name, src_path in EXTENDED_FILES:
            if not src_path.exists():
                continue
            dest = repo_dir / arc_name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src_path, dest)
            files_pushed.append(arc_name)
            stats["core"] += 1
        logger.info("Extended: copied additional files (total core: %d)", stats["core"])

        # ── 3. Scripts directory ──
        scripts_dir = HERMES_HOME / "scripts"
        if scripts_dir.exists():
            scripts_dest = repo_dir / "scripts"
            scripts_dest.mkdir(exist_ok=True)
            for f in scripts_dir.iterdir():
                if not f.is_file():
                    continue
                if f.name == ".env":
                    continue
                if f.stat().st_size >= 5 * 1024 * 1024:
                    continue
                shutil.copy2(f, scripts_dest / f.name)
                files_pushed.append(f"scripts/{f.name}")
                stats["scripts"] += 1
            logger.info("Scripts: copied %d files", stats["scripts"])

        # ── 4. Skills (files < 5MB, NO .env files) ──
        skills_dir = HERMES_HOME / "skills"
        if skills_dir.exists():
            for f in skills_dir.rglob("*"):
                if not f.is_file():
                    continue
                if f.name == ".env":
                    continue
                if f.stat().st_size >= 5 * 1024 * 1024:
                    continue
                rel = f.relative_to(HERMES_HOME)
                dest = repo_dir / str(rel)
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(f, dest)
                files_pushed.append(str(rel))
                stats["skills"] += 1
            logger.info("Skills: copied %d files", stats["skills"])

        # ── 5. Wiki ──
        if WIKI_DIR.exists():
            wiki_dest = repo_dir / "wiki"
            wiki_dest.mkdir(exist_ok=True)
            for f in WIKI_DIR.rglob("*"):
                if not f.is_file():
                    continue
                if f.name == ".env":
                    continue
                if f.stat().st_size >= 5 * 1024 * 1024:
                    continue
                rel = f.relative_to(WIKI_DIR)
                dest = wiki_dest / str(rel)
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(f, dest)
                files_pushed.append(f"wiki/{rel}")
                stats["wiki"] += 1
            logger.info("Wiki: copied %d files", stats["wiki"])

        # ── 6. System configs (crontab, systemd, nginx) ──
        system_files = _copy_system_configs(repo_dir)
        files_pushed.extend(system_files)
        stats["system"] = len(system_files)

        # ── 7. Daily memories (last 30 days) ──
        memory_files = _copy_daily_memories(repo_dir)
        files_pushed.extend(memory_files)
        stats["daily_memories"] = len(memory_files)

        # ── 8. Encrypted secrets (GPG) ──
        secret_files = _copy_secrets(repo_dir)
        files_pushed.extend(secret_files)
        stats["secrets"] = len(secret_files)

        # ── 9. Documentation (RESTORE.md, SYSTEM_REQUIREMENTS.md) ──
        doc_files = _generate_docs(repo_dir)
        files_pushed.extend(doc_files)
        stats["docs"] = len(doc_files)

        # Calculate total size
        total_size = sum(
            f.stat().st_size for f in repo_dir.rglob("*") if f.is_file()
        )

        # Git add, commit, push
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        commit_msg = f"sync: hermes full backup {timestamp} ({len(files_pushed)} files)"

        subprocess.run(
            ["git", "-C", str(repo_dir), "add", "-A"],
            capture_output=True, text=True, timeout=30,
        )

        # Check if there are changes to commit
        status_result = subprocess.run(
            ["git", "-C", str(repo_dir), "status", "--porcelain"],
            capture_output=True, text=True, timeout=10,
        )

        if status_result.stdout.strip():
            commit_result = subprocess.run(
                ["git", "-C", str(repo_dir), "commit", "-m", commit_msg],
                capture_output=True, text=True, timeout=30,
            )
            if commit_result.returncode != 0:
                raise RuntimeError(f"Git commit failed: {commit_result.stderr.strip()}")

            # Get short commit hash
            hash_result = subprocess.run(
                ["git", "-C", str(repo_dir), "rev-parse", "--short", "HEAD"],
                capture_output=True, text=True, timeout=10,
            )
            short_hash = hash_result.stdout.strip()[:7]

            push_result = subprocess.run(
                ["git", "-C", str(repo_dir), "push", "origin", "HEAD"],
                capture_output=True, text=True, timeout=60,
            )
            if push_result.returncode != 0:
                raise RuntimeError(f"Git push failed: {push_result.stderr.strip()}")

            logger.info(
                "GitHub config sync completed: %d files (%s), commit %s, size %s",
                len(files_pushed), _format_size(total_size), short_hash, _format_size(total_size),
            )
        else:
            short_hash = "no-changes"
            logger.info("GitHub config sync: no changes detected")

        return {
            "success": True,
            "commit": short_hash,
            "files_pushed": len(files_pushed),
            "totalSize": _format_size(total_size),
            "stats": stats,
            "message": f"Synced {len(files_pushed)} files to {GITHUB_REPO}",
        }

    except Exception as e:
        logger.error("GitHub config sync failed: %s", str(e))
        # Mask sensitive info in error messages
        error_msg = str(e)
        if SENSITIVE_RE.search(error_msg):
            error_msg = "An error occurred (details redacted for security)"
        return {"success": False, "error": error_msg}
    finally:
        if tmp_dir:
            try:
                shutil.rmtree(tmp_dir, ignore_errors=True)
            except Exception:
                pass


def _format_size(size_bytes: int) -> str:
    """Format bytes to human-readable size."""
    for unit in ["B", "KB", "MB", "GB"]:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} TB"


@router.get("/files")
async def list_files():
    """List files currently in the GitHub repository."""
    try:
        contents = _run_gh([
            "api", f"repos/{GITHUB_REPO}/contents/",
        ])
        if not isinstance(contents, list):
            return {"files": []}

        files = []
        for item in contents:
            if item.get("type") == "file":
                files.append({
                    "name": item.get("name", ""),
                    "size": item.get("size", 0),
                    "sha": item.get("sha", "")[:7],
                    "path": item.get("path", ""),
                })
            elif item.get("type") == "dir":
                # Recursively list directory contents
                try:
                    sub_contents = _run_gh([
                        "api", f"repos/{GITHUB_REPO}/contents/{item.get('path', '')}",
                    ])
                    if isinstance(sub_contents, list):
                        for sub in sub_contents:
                            if sub.get("type") == "file":
                                files.append({
                                    "name": sub.get("name", ""),
                                    "size": sub.get("size", 0),
                                    "sha": sub.get("sha", "")[:7],
                                    "path": sub.get("path", ""),
                                })
                except Exception:
                    files.append({
                        "name": item.get("name", "/"),
                        "size": 0,
                        "sha": "",
                        "path": item.get("path", ""),
                    })

        return {"files": files}
    except Exception as e:
        logger.warning("GitHub config file list failed: %s", str(e))
        return {"files": [], "error": str(e)}
