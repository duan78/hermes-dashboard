import json
import logging
import re
import shutil
import subprocess
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

        # Get file count
        contents = _run_gh([
            "api", f"repos/{GITHUB_REPO}/contents/",
        ])
        file_count = len(contents) if isinstance(contents, list) else 0

        return {
            "connected": True,
            "isPrivate": data.get("isPrivate", False),
            "updatedAt": data.get("updatedAt"),
            "pushedAt": data.get("pushedAt"),
            "branch": branch,
            "lastCommit": last_commit,
            "lastCommitDate": last_commit_date,
            "fileCount": file_count,
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
    """Export current Hermes configuration to the GitHub repository."""
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

        # Define files to copy (same logic as backup.py but NO .env)
        files_to_copy = [
            ("SOUL.md", HERMES_HOME / "SOUL.md"),
            ("memories/MEMORY.md", HERMES_HOME / "memories" / "MEMORY.md"),
            ("memories/USER.md", HERMES_HOME / "memories" / "USER.md"),
            ("config.yaml", HERMES_HOME / "config.yaml"),
            ("backlog.json", HERMES_HOME / "backlog.json"),
        ]

        for arc_name, src_path in files_to_copy:
            if not src_path.exists():
                continue
            dest = repo_dir / arc_name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src_path, dest)
            files_pushed.append(arc_name)

        # Copy skills (files < 5MB, NO .env files)
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

        # Copy wiki
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

        # Git add, commit, push
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        commit_msg = f"sync: hermes dashboard config export {timestamp}"

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

            logger.info("GitHub config sync completed: %s files, commit %s", len(files_pushed), short_hash)
        else:
            short_hash = "no-changes"
            logger.info("GitHub config sync: no changes detected")

        return {
            "success": True,
            "commit": short_hash,
            "files_pushed": len(files_pushed),
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
