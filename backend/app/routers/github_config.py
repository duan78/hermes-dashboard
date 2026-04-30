"""GitHub Config router — unified backup/sync to a private GitHub repository.

Generic: repo owner detected via `gh api user`, repo name configurable.
Config stored in ~/.hermes/github-config.json.
"""

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

router = APIRouter(prefix="/api/github-config", tags=["github-config"])

WIKI_DIR = Path.home() / "wiki"
DAILY_MEMORY_DIR = Path("/root/memory")
GCLOUD_CONFIG_DIR = Path.home() / ".config" / "gcloud"
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB

SENSITIVE_RE = re.compile(
    r"(key|token|secret|password|api|auth|credential)", re.IGNORECASE
)

CONFIG_PATH = HERMES_HOME / "github-config.json"

ALL_CATEGORIES = [
    "core", "shell", "scripts", "skills", "wiki", "system",
    "secrets", "claude_code", "daily_memories", "manifests", "docs",
]

# ── Category definitions ──

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

CLAUDE_CODE_FILES = [
    (".claude/CLAUDE.md", Path.home() / ".claude" / "CLAUDE.md"),
    (".claude/RTK.md", Path.home() / ".claude" / "RTK.md"),
]

# ── Config helpers ──


def _load_config() -> dict:
    """Load github-config.json, return empty dict if not found."""
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text())
        except Exception:
            pass
    return {}


def _save_config(cfg: dict):
    """Save github-config.json."""
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2))


def _get_repo() -> str:
    """Return 'owner/repo' from config file, or empty string if not configured."""
    cfg = _load_config()
    owner = cfg.get("repo_owner", "")
    name = cfg.get("repo_name", "hermes-config")
    return f"{owner}/{name}" if owner else ""


def _detect_username() -> str | None:
    """Detect GitHub username via gh CLI."""
    try:
        result = subprocess.run(
            ["gh", "api", "user", "--jq", ".login"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return None


def _check_gh_auth() -> bool:
    """Check if gh CLI is installed and authenticated."""
    try:
        result = subprocess.run(
            ["gh", "auth", "status"],
            capture_output=True, text=True, timeout=10,
        )
        return result.returncode == 0
    except FileNotFoundError:
        return False
    except Exception:
        return False


# ── Run gh helper ──


def _run_gh(args: list[str], timeout: int = 30) -> dict | list:
    """Run a gh CLI command and return parsed JSON output."""
    try:
        result = subprocess.run(
            ["gh"] + args,
            capture_output=True, text=True, timeout=timeout,
        )
        if result.returncode != 0:
            err = result.stderr.strip()
            if "not found" in err.lower() or "command not found" in err.lower():
                raise FileNotFoundError("gh CLI is not installed")
            if "authentication" in err.lower() or "not logged in" in err.lower():
                raise PermissionError("gh CLI is not authenticated. Run: gh auth login")
            if "404" in err:
                raise ValueError(f"Repository not found or inaccessible")
            raise RuntimeError(err)
        return json.loads(result.stdout)
    except FileNotFoundError:
        raise FileNotFoundError("gh CLI is not installed")
    except json.JSONDecodeError:
        raise RuntimeError("Failed to parse gh CLI output")


# ── File collection helpers ──


def _collect_dir(directory: Path, prefix: str) -> list[tuple[str, Path]]:
    """Recursively collect files from a directory."""
    files = []
    if not directory.exists():
        return files
    for f in directory.rglob("*"):
        if not f.is_file():
            continue
        if f.name == ".env":
            continue
        if f.stat().st_size >= MAX_FILE_SIZE:
            continue
        rel = f.relative_to(directory)
        files.append((f"{prefix}/{rel}", f))
    return files


def _gpg_encrypt_file(input_path: Path, output_path: Path, passphrase: str) -> bool:
    """Encrypt a single file with GPG symmetric encryption."""
    try:
        result = subprocess.run(
            [
                "gpg", "--batch", "--yes",
                "--passphrase", passphrase,
                "--symmetric", "--cipher-algo", "AES256",
                "-o", str(output_path), str(input_path),
            ],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode == 0:
            return True
        logger.warning("GPG encrypt failed for %s: %s", input_path.name, result.stderr.strip())
        return False
    except Exception as e:
        logger.warning("GPG encrypt error for %s: %s", input_path.name, e)
        return False


def _gpg_encrypt_bytes(data: bytes, passphrase: str) -> bytes | None:
    """Encrypt bytes with GPG symmetric AES256, return encrypted bytes."""
    try:
        result = subprocess.run(
            [
                "gpg", "--batch", "--yes",
                "--passphrase", passphrase,
                "--symmetric", "--cipher-algo", "AES256",
                "-o", "-", "/dev/stdin",
            ],
            input=data, capture_output=True, timeout=60,
        )
        if result.returncode == 0:
            return result.stdout
        return None
    except Exception:
        return None


def _copy_system_configs(dest_dir: Path) -> list[str]:
    """Copy system configuration files."""
    files_pushed = []
    for arc_name, source in SYSTEM_CONFIGS:
        dest = dest_dir / arc_name
        dest.parent.mkdir(parents=True, exist_ok=True)
        if source == "crontab":
            try:
                result = subprocess.run(
                    ["crontab", "-l"], capture_output=True, text=True, timeout=10,
                )
                if result.returncode == 0:
                    dest.write_text(result.stdout)
                    files_pushed.append(arc_name)
            except Exception:
                pass
        elif isinstance(source, Path) and source.exists():
            shutil.copy2(source, dest)
            files_pushed.append(arc_name)
    return files_pushed


def _copy_secrets(dest_dir: Path) -> list[str]:
    """Encrypt and copy secret files."""
    files_pushed = []
    try:
        result = subprocess.run(["which", "gpg"], capture_output=True, text=True, timeout=5)
        if result.returncode != 0:
            return files_pushed
    except Exception:
        return files_pushed

    passphrase = os.environ.get("HERMES_BACKUP_PASSPHRASE", "hermes-backup-2026")
    if "HERMES_BACKUP_PASSPHRASE" not in os.environ:
        logger.warning("HERMES_BACKUP_PASSPHRASE not set, using default passphrase")

    secrets_dir = dest_dir / "secrets"
    secrets_dir.mkdir(parents=True, exist_ok=True)

    for arc_name, src_path in SECRET_FILES:
        if not src_path.exists():
            continue
        dest = dest_dir / arc_name
        if _gpg_encrypt_file(src_path, dest, passphrase):
            files_pushed.append(arc_name)

    # gcloud config
    if GCLOUD_CONFIG_DIR.exists():
        gcloud_dest = dest_dir / "secrets" / "gcloud-config.tar.gz.gpg"
        with tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False) as tmp:
            tmp_path = Path(tmp.name)
        try:
            with tarfile.open(tmp_path, "w:gz") as tar:
                for item in GCLOUD_CONFIG_DIR.rglob("*"):
                    if item.is_file() and item.stat().st_size < MAX_FILE_SIZE:
                        tar.add(item, arcname=str(item.relative_to(GCLOUD_CONFIG_DIR)))
            if _gpg_encrypt_file(tmp_path, gcloud_dest, passphrase):
                files_pushed.append("secrets/gcloud-config.tar.gz.gpg")
        except Exception as e:
            logger.warning("gcloud config backup failed: %s", e)
        finally:
            try:
                tmp_path.unlink(missing_ok=True)
            except Exception:
                pass

    return files_pushed


def _copy_daily_memories(dest_dir: Path, max_days: int = 30) -> list[str]:
    """Copy the last N daily memory files."""
    files_pushed = []
    if not DAILY_MEMORY_DIR.exists():
        return files_pushed

    date_re = re.compile(r"^\d{4}-\d{2}-\d{2}\.md$")
    daily_files = sorted(
        [f for f in DAILY_MEMORY_DIR.iterdir() if f.is_file() and date_re.match(f.name)],
        reverse=True,
    )[:max_days]

    daily_dest = dest_dir / "memories" / "daily"
    daily_dest.mkdir(parents=True, exist_ok=True)

    for fname in daily_files:
        shutil.copy2(DAILY_MEMORY_DIR / fname, daily_dest / fname)
        files_pushed.append(f"memories/daily/{fname}")
    return files_pushed


def _generate_manifests(dest_dir: Path) -> list[str]:
    """Generate manifest files into dest_dir."""
    files = []

    try:
        result = subprocess.run(["npm", "list", "-g", "--depth=0"], capture_output=True, text=True, timeout=15)
        (dest_dir / "npm-globals.txt").write_text(result.stdout)
        files.append("npm-globals.txt")
    except Exception:
        pass

    env_vars = sorted(f"{k}={'***' if SENSITIVE_RE.search(k) else v}" for k, v in os.environ.items())
    (dest_dir / "env-vars.txt").write_text("\n".join(env_vars))
    files.append("env-vars.txt")

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
    (dest_dir / "project-repos.txt").write_text("\n".join(sorted(repos)))
    files.append("project-repos.txt")

    try:
        result = subprocess.run(["dpkg", "--get-selections"], capture_output=True, text=True, timeout=15)
        lines = [l for l in result.stdout.splitlines() if "deinstall" not in l][:500]
        (dest_dir / "system-packages.txt").write_text("\n".join(lines))
        files.append("system-packages.txt")
    except Exception:
        pass

    return files


def _generate_docs(dest_dir: Path) -> list[str]:
    """Write documentation files into dest_dir."""
    files = []

    restore_md = """# Hermes — Guide de Restauration

## Prérequis
- Ubuntu 24.04, accès root

## Restauration
1. Cloner ce repo : `gh repo clone OWNER/REPO`
2. Copier SOUL.md, config.yaml dans ~/.hermes/
3. Copier scripts/, skills/, wiki/ dans ~/.hermes/
4. Copier .bashrc, .gitconfig, .profile dans ~/
5. Restaurer systemd : `cp system/systemd/*.service /etc/systemd/system/ && systemctl daemon-reload`
6. Restaurer nginx : `cp system/nginx/* /etc/nginx/sites-available/ && nginx -t && systemctl reload nginx`
7. Importer crontab : `crontab system/crontab.txt`

## Secrets (GPG)
```bash
gpg --decrypt secrets/hermes.env.gpg > ~/.hermes/.env
gpg --decrypt secrets/auth.json.gpg > ~/.hermes/auth.json
gpg --decrypt secrets/ssh-known_hosts.gpg > ~/.ssh/known_hosts
gpg --decrypt secrets/gcloud-config.tar.gz.gpg | tar xzf - -C ~/.config/gcloud/
```
"""
    (dest_dir / "RESTORE.md").write_text(restore_md)
    files.append("RESTORE.md")

    (dest_dir / "SYSTEM_REQUIREMENTS.md").write_text(
        "# Hermes — System Requirements\n\n- Ubuntu 24.04 LTS\n- Node.js 24.x, Python 3.12+\n- gh CLI, gcloud CLI, tmux, GPG 2.4+\n- nginx, Certbot, Tailscale\n"
    )
    files.append("SYSTEM_REQUIREMENTS.md")
    return files


def _format_size(size_bytes: float) -> str:
    """Format bytes to human-readable size."""
    for unit in ["B", "KB", "MB", "GB"]:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} TB"


# ── Core sync logic (used by sync + download-archive) ──

def _collect_and_sync(
    repo_dir: Path,
    categories: list[str] | None = None,
    description: str = "",
) -> tuple[list[str], dict]:
    """Collect files by category and copy to repo_dir. Returns (files_pushed, stats)."""
    if not categories:
        categories = list(ALL_CATEGORIES)

    files_pushed = []
    stats = {cat: 0 for cat in ALL_CATEGORIES}

    # 1. Core
    if "core" in categories:
        for arc_name, src_path in CORE_FILES:
            if not src_path.exists():
                continue
            dest = repo_dir / arc_name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src_path, dest)
            files_pushed.append(arc_name)
            stats["core"] += 1

    # 2. Shell
    if "shell" in categories:
        for arc_name, src_path in SHELL_FILES:
            if not src_path.exists():
                continue
            dest = repo_dir / arc_name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src_path, dest)
            files_pushed.append(arc_name)
            stats["shell"] += 1

    # 3. Scripts
    if "scripts" in categories:
        scripts_dir = HERMES_HOME / "scripts"
        if scripts_dir.exists():
            for arc_name, src_path in _collect_dir(scripts_dir, "scripts"):
                dest = repo_dir / arc_name
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src_path, dest)
                files_pushed.append(arc_name)
                stats["scripts"] += 1

    # 4. Skills
    if "skills" in categories:
        skills_dir = HERMES_HOME / "skills"
        if skills_dir.exists():
            for arc_name, src_path in _collect_dir(skills_dir, "skills"):
                dest = repo_dir / arc_name
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src_path, dest)
                files_pushed.append(arc_name)
                stats["skills"] += 1

    # 5. Wiki
    if "wiki" in categories:
        if WIKI_DIR.exists():
            for arc_name, src_path in _collect_dir(WIKI_DIR, "wiki"):
                dest = repo_dir / arc_name
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src_path, dest)
                files_pushed.append(arc_name)
                stats["wiki"] += 1

    # 6. System
    if "system" in categories:
        system_files = _copy_system_configs(repo_dir)
        files_pushed.extend(system_files)
        stats["system"] = len(system_files)

    # 7. Secrets
    if "secrets" in categories:
        secret_files = _copy_secrets(repo_dir)
        files_pushed.extend(secret_files)
        stats["secrets"] = len(secret_files)

    # 8. Claude Code
    if "claude_code" in categories:
        for arc_name, src_path in CLAUDE_CODE_FILES:
            if not src_path.exists():
                continue
            dest = repo_dir / arc_name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src_path, dest)
            files_pushed.append(arc_name)
            stats["claude_code"] += 1

    # 9. Daily memories
    if "daily_memories" in categories:
        memory_files = _copy_daily_memories(repo_dir)
        files_pushed.extend(memory_files)
        stats["daily_memories"] = len(memory_files)

    # 10. Manifests
    if "manifests" in categories:
        manifest_files = _generate_manifests(repo_dir)
        files_pushed.extend(manifest_files)
        stats["manifests"] = len(manifest_files)

    # 11. Docs
    if "docs" in categories:
        doc_files = _generate_docs(repo_dir)
        files_pushed.extend(doc_files)
        stats["docs"] = len(doc_files)

    return files_pushed, stats


# ── Models ──


class SetupRequest(BaseModel):
    action: str  # "create" or "link"
    repo_name: str = "hermes-config"
    repo_full_name: str = ""  # for "link" action: "owner/repo"


class SyncRequest(BaseModel):
    categories: list[str] | None = None
    description: str = ""


# ── Endpoints ──


@router.get("/setup-status")
async def setup_status():
    """Check if GitHub config is set up."""
    cfg = _load_config()
    gh_auth = _check_gh_auth()
    username = _detect_username() if gh_auth else None
    configured = bool(cfg.get("repo_owner"))

    return {
        "configured": configured,
        "gh_auth": gh_auth,
        "username": username,
        "repo_owner": cfg.get("repo_owner", ""),
        "repo_name": cfg.get("repo_name", "hermes-config"),
        "configured_at": cfg.get("configured_at", ""),
    }


@router.post("/setup")
async def setup(req: SetupRequest):
    """Set up GitHub config: create repo or link existing one."""
    gh_auth = _check_gh_auth()
    if not gh_auth:
        return {"success": False, "error": "gh CLI is not authenticated. Run: gh auth login"}

    username = _detect_username()
    if not username:
        return {"success": False, "error": "Could not detect GitHub username"}

    if req.action == "create":
        repo_name = req.repo_name or "hermes-config"
        full_name = f"{username}/{repo_name}"
        try:
            # Check if repo already exists
            try:
                _run_gh(["repo", "view", full_name, "--json", "name"])
                # Repo exists — just link it
            except (ValueError, RuntimeError):
                # Create new private repo
                result = subprocess.run(
                    ["gh", "repo", "create", full_name, "--private", "--description", "Hermes configuration backup"],
                    capture_output=True, text=True, timeout=30,
                )
                if result.returncode != 0:
                    return {"success": False, "error": f"Failed to create repo: {result.stderr.strip()}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

        _save_config({
            "repo_owner": username,
            "repo_name": repo_name,
            "configured_at": datetime.utcnow().isoformat() + "Z",
        })
        return {"success": True, "repo": full_name, "message": f"Created and linked {full_name}"}

    elif req.action == "link":
        full_name = req.repo_full_name.strip()
        if not full_name or "/" not in full_name:
            return {"success": False, "error": "Invalid repo full name (expected: owner/repo)"}

        # Validate access
        try:
            _run_gh(["repo", "view", full_name, "--json", "name,isPrivate"])
        except Exception as e:
            return {"success": False, "error": f"Cannot access repo: {e}"}

        owner, name = full_name.split("/", 1)
        _save_config({
            "repo_owner": owner,
            "repo_name": name,
            "configured_at": datetime.utcnow().isoformat() + "Z",
        })
        return {"success": True, "repo": full_name, "message": f"Linked to {full_name}"}

    return {"success": False, "error": "Invalid action. Use 'create' or 'link'."}


@router.get("/status")
async def get_status():
    """Check the status of the configured GitHub repository."""
    repo = _get_repo()
    if not repo:
        return {"connected": False, "configured": False, "error": "No repository configured. Run setup first."}

    try:
        data = _run_gh([
            "repo", "view", repo,
            "--json", "isPrivate,updatedAt,pushedAt,defaultBranchRef",
        ])

        branch = data.get("defaultBranchRef", {}).get("name", "main") if isinstance(data.get("defaultBranchRef"), dict) else "main"

        # Last commit
        commits = _run_gh(["api", f"repos/{repo}/commits?per_page=1"])
        last_commit = None
        last_commit_date = None
        if commits and isinstance(commits, list) and len(commits) > 0:
            last_commit = commits[0].get("sha", "")[:7]
            last_commit_date = commits[0].get("commit", {}).get("author", {}).get("date")

        # File count
        contents = _run_gh(["api", f"repos/{repo}/contents/"])
        file_count = len(contents) if isinstance(contents, list) else 0

        # Categories
        files_by_category = {
            "core": 0, "scripts": 0, "system": 0, "secrets": 0,
            "memories": 0, "skills": 0, "wiki": 0, "docs": 0,
            "shell": 0, "claude_code": 0, "daily_memories": 0,
            "manifests": 0,
        }

        if isinstance(contents, list):
            dir_names = {item.get("name", "") for item in contents if item.get("type") == "dir"}
            file_names = {item.get("name", "") for item in contents if item.get("type") == "file"}

            for f in ["SOUL.md", "config.yaml", "backlog.json"]:
                if f in file_names:
                    files_by_category["core"] += 1
            for f in ["dashboard_users.json", "projects.json"]:
                if f in file_names:
                    files_by_category["core"] += 1
            for f in [".bashrc", ".gitconfig", ".profile"]:
                if f in file_names:
                    files_by_category["shell"] += 1
            for f in ["RESTORE.md", "SYSTEM_REQUIREMENTS.md"]:
                if f in file_names:
                    files_by_category["docs"] += 1

            category_dirs = {
                "scripts": "scripts", "system": "system", "secrets": "secrets",
                "skills": "skills", "wiki": "wiki", "memories": "memories",
            }
            for cat, dirname in category_dirs.items():
                if dirname in dir_names:
                    try:
                        sub = _run_gh(["api", f"repos/{repo}/contents/{dirname}"])
                        if isinstance(sub, list):
                            files_by_category[cat] = len(sub)
                    except Exception:
                        pass

        cfg = _load_config()
        total = sum(files_by_category.values())

        return {
            "connected": True,
            "configured": True,
            "repo": repo,
            "isPrivate": data.get("isPrivate", False),
            "updatedAt": data.get("updatedAt"),
            "pushedAt": data.get("pushedAt"),
            "branch": branch,
            "lastCommit": last_commit,
            "lastCommitDate": last_commit_date,
            "fileCount": file_count,
            "filesByCategory": files_by_category,
            "totalFiles": total,
            "username": cfg.get("repo_owner", ""),
        }
    except FileNotFoundError as e:
        return {"connected": False, "configured": True, "error": str(e)}
    except PermissionError as e:
        return {"connected": False, "configured": True, "error": str(e)}
    except ValueError as e:
        return {"connected": False, "configured": True, "error": str(e)}
    except Exception as e:
        logger.warning("GitHub config status check failed: %s", str(e))
        return {"connected": False, "configured": True, "error": str(e)}


@router.post("/sync")
async def sync_to_github(req: SyncRequest = SyncRequest()):
    """Sync current Hermes configuration to GitHub."""
    repo = _get_repo()
    if not repo:
        return {"success": False, "error": "GitHub config not set up. Run setup first."}

    tmp_dir = None
    try:
        tmp_dir = tempfile.mkdtemp(prefix="hermes-config-sync-")
        repo_dir = Path(tmp_dir) / "hermes-config"
        repo_dir.mkdir(exist_ok=True)

        # Clone shallow
        clone_result = subprocess.run(
            ["gh", "repo", "clone", repo, str(repo_dir), "--", "--depth", "1"],
            capture_output=True, text=True, timeout=60,
        )
        if clone_result.returncode != 0:
            raise RuntimeError(f"Failed to clone repo: {clone_result.stderr.strip()}")

        # Remove existing files (keep .git)
        for item in repo_dir.iterdir():
            if item.name == ".git":
                continue
            if item.is_dir():
                shutil.rmtree(item)
            else:
                item.unlink()

        categories = req.categories if req.categories else None
        files_pushed, stats = _collect_and_sync(repo_dir, categories=categories, description=req.description)

        total_size = sum(f.stat().st_size for f in repo_dir.rglob("*") if f.is_file())

        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        desc = f" ({req.description})" if req.description else ""
        commit_msg = f"sync: hermes backup {timestamp}{desc} ({len(files_pushed)} files)"

        subprocess.run(
            ["git", "-C", str(repo_dir), "add", "-A"],
            capture_output=True, text=True, timeout=30,
        )

        status_result = subprocess.run(
            ["git", "-C", str(repo_dir), "status", "--porcelain"],
            capture_output=True, text=True, timeout=10,
        )

        short_hash = "no-changes"
        if status_result.stdout.strip():
            commit_result = subprocess.run(
                ["git", "-C", str(repo_dir), "commit", "-m", commit_msg],
                capture_output=True, text=True, timeout=30,
            )
            if commit_result.returncode != 0:
                raise RuntimeError(f"Git commit failed: {commit_result.stderr.strip()}")

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

            logger.info("GitHub sync completed: %d files, commit %s", len(files_pushed), short_hash)
        else:
            logger.info("GitHub sync: no changes detected")

        return {
            "success": True,
            "commit": short_hash,
            "files_pushed": len(files_pushed),
            "totalSize": _format_size(total_size),
            "stats": {k: v for k, v in stats.items() if v > 0},
            "message": f"Synced {len(files_pushed)} files to {repo}" + (f" (commit {short_hash})" if short_hash != "no-changes" else " — no changes"),
        }

    except Exception as e:
        logger.error("GitHub config sync failed: %s", str(e))
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


@router.get("/commits")
async def list_commits():
    """List recent commits from the configured repo."""
    repo = _get_repo()
    if not repo:
        return {"commits": [], "error": "Not configured"}

    try:
        data = _run_gh(["api", f"repos/{repo}/commits?per_page=20"])
        if not isinstance(data, list):
            return {"commits": []}

        commits = []
        for c in data:
            commits.append({
                "sha": c.get("sha", ""),
                "short_sha": c.get("sha", "")[:7],
                "message": c.get("commit", {}).get("message", ""),
                "date": c.get("commit", {}).get("author", {}).get("date", ""),
                "author": c.get("commit", {}).get("author", {}).get("name", ""),
            })
        return {"commits": commits}
    except Exception as e:
        return {"commits": [], "error": str(e)}


@router.post("/restore-commit")
async def restore_commit(request: Request):
    """Restore files from a specific commit."""
    body = await request.json()
    commit_sha = body.get("commit_sha", "").strip()
    if not commit_sha:
        return {"success": False, "error": "commit_sha is required"}

    repo = _get_repo()
    if not repo:
        return {"success": False, "error": "Not configured"}

    tmp_dir = None
    try:
        tmp_dir = tempfile.mkdtemp(prefix="hermes-restore-")
        repo_dir = Path(tmp_dir) / "hermes-config"
        repo_dir.mkdir(exist_ok=True)

        # Clone and checkout specific commit
        subprocess.run(
            ["gh", "repo", "clone", repo, str(repo_dir), "--", "--depth", "50"],
            capture_output=True, text=True, timeout=60,
        )

        checkout_result = subprocess.run(
            ["git", "-C", str(repo_dir), "checkout", commit_sha],
            capture_output=True, text=True, timeout=15,
        )
        if checkout_result.returncode != 0:
            return {"success": False, "error": f"Commit {commit_sha[:7]} not found"}

        # Restore files (skip .git, .gpg secrets)
        restored = []
        for item in repo_dir.rglob("*"):
            if not item.is_file():
                continue
            if ".git" in item.parts:
                continue
            if item.name.endswith(".gpg"):
                continue

            rel = item.relative_to(repo_dir)
            target = HERMES_HOME / str(rel)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, target)
            restored.append(str(rel))

        logger.info("Restored %d files from commit %s", len(restored), commit_sha[:7])
        return {"success": True, "restored": len(restored), "files": restored}

    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        if tmp_dir:
            try:
                shutil.rmtree(tmp_dir, ignore_errors=True)
            except Exception:
                pass


@router.get("/files")
async def list_files():
    """List files currently in the configured GitHub repository (recursive)."""
    repo = _get_repo()
    if not repo:
        return {"files": [], "error": "Not configured"}

    def _list_recursive(path: str = "") -> list[dict]:
        try:
            url = f"repos/{repo}/contents/{path}" if path else f"repos/{repo}/contents/"
            contents = _run_gh(["api", url])
            if not isinstance(contents, list):
                return []
        except Exception:
            return []

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
                sub_files = _list_recursive(item.get("path", ""))
                files.extend(sub_files)
        return files

    try:
        files = _list_recursive()
        return {"files": files}
    except Exception as e:
        return {"files": [], "error": str(e)}


@router.post("/download-archive")
async def download_archive():
    """Create a tar.gz archive on-the-fly from current config and return it for download."""
    tmp_dir = None
    try:
        tmp_dir = tempfile.mkdtemp(prefix="hermes-archive-")
        collect_dir = Path(tmp_dir) / "archive"
        collect_dir.mkdir()

        files_pushed, stats = _collect_and_sync(collect_dir)

        # Create tar.gz in memory
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tar:
            for item in collect_dir.rglob("*"):
                if item.is_file():
                    arcname = item.relative_to(collect_dir)
                    tar.add(item, arcname=str(arcname))

        buf.seek(0)

        # Write to temp file for FileResponse
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"hermes_export_{timestamp}.tar.gz"
        archive_path = Path(tmp_dir) / filename
        archive_path.write_bytes(buf.read())

        return FileResponse(
            str(archive_path),
            media_type="application/gzip",
            filename=filename,
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to create archive: {e}")
    finally:
        # Note: FileResponse needs the file to exist during transfer
        # We'll rely on the system temp cleanup or manual cleanup
        pass
