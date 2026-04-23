"""Autofeed service — background worker that scans Hermes data sources and auto-populates modules.

Scans:
  1. Sessions → Projects (update session_count, detect new project candidates)
  2. Sessions → Backlog (detect task patterns, create validated items)
  3. Memory → Wiki (suggest wiki pages from memory files)
  4. Skills → Wiki (suggest wiki pages for new skills)
  5. GitHub → Projects (sync repos, update last_activity)
  6. Claude Code → Activity (detect completed tasks)
"""

import asyncio
import fcntl
import json
import logging
import os
import re
import subprocess
import uuid
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

from ..config import HERMES_HOME

logger = logging.getLogger(__name__)

# Throttle: max notifications per scan cycle
MAX_NOTIFS_PER_SCAN = 5

# Task patterns in French and English
TASK_PATTERNS = [
    r"il\s+faut\s+(.{10,80})",
    r"todo\s*[:\-]\s*(.{10,80})",
    r"\bà\s+faire\s*[:\-]?\s*(.{10,80})",
    r"on\s+doit\s+(.{10,80})",
    r"je\s+veux\s+(.{10,80})",
    r"task\s*[:\-]\s*(.{10,80})",
    r"fix\s+(.{10,80})",
    r"implement\s+(.{10,80})",
    r"ajouter\s+(.{10,80})",
    r"corriger\s+(.{10,80})",
    r"we\s+need\s+to\s+(.{10,80})",
    r"need\s+to\s+(.{10,80})",
]


class AutofeedService:
    """Background service that periodically scans data sources."""

    def __init__(self, interval: int = 300):
        self.interval = interval
        self._task: asyncio.Task | None = None
        self._running = False
        self.last_scan: str | None = None
        self.next_scan: str | None = None
        self.stats = {
            "sessions_scanned": 0,
            "projects_updated": 0,
            "backlog_items_created": 0,
            "notifications_sent": 0,
            "github_repos_scanned": 0,
            "memory_files_scanned": 0,
            "skills_scanned": 0,
            "activity_entries": 0,
        }
        self._scan_count = 0

    def start(self):
        if self._task is None or self._task.done():
            self._running = True
            self._task = asyncio.create_task(self._loop())
            logger.info("AutofeedService started (interval=%ds)", self.interval)

    def stop(self):
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            logger.info("AutofeedService stopped")

    async def _loop(self):
        while self._running:
            try:
                await self.run_scan()
            except Exception as e:
                logger.error("AutofeedService scan error: %s", e)
            # Compute next scan time
            self.next_scan = (datetime.now() + timedelta(seconds=self.interval)).isoformat()
            await asyncio.sleep(self.interval)

    async def run_scan(self):
        """Execute all scans once."""
        logger.info("AutofeedService: starting scan #%d", self._scan_count)
        notif_count = 0

        # Scan 1: Sessions → Projects
        try:
            updated = await self._scan_sessions_projects()
            self.stats["projects_updated"] += updated
        except Exception as e:
            logger.error("Scan 1 (sessions→projects) error: %s", e)

        # Scan 2: Sessions → Backlog
        try:
            created, n = await self._scan_sessions_backlog()
            self.stats["backlog_items_created"] += created
            notif_count += n
        except Exception as e:
            logger.error("Scan 2 (sessions→backlog) error: %s", e)

        # Scan 3: Memory → Wiki
        try:
            n = await self._scan_memory_wiki()
            notif_count += n
        except Exception as e:
            logger.error("Scan 3 (memory→wiki) error: %s", e)

        # Scan 4: Skills → Wiki
        try:
            n = await self._scan_skills_wiki()
            notif_count += n
        except Exception as e:
            logger.error("Scan 4 (skills→wiki) error: %s", e)

        # Scan 5: GitHub → Projects
        try:
            n = await self._scan_github_projects()
            notif_count += n
        except Exception as e:
            logger.error("Scan 5 (github→projects) error: %s", e)

        # Scan 6: Claude Code → Activity
        try:
            n = await self._scan_claude_code_activity()
            self.stats["activity_entries"] += n
        except Exception as e:
            logger.error("Scan 6 (claude-code→activity) error: %s", e)

        self.last_scan = datetime.now().isoformat()
        self._scan_count += 1
        logger.info("AutofeedService: scan #%d complete (notifs=%d)", self._scan_count, notif_count)

    # ── Helpers ──

    def _read_json(self, path: Path):
        if not path.exists():
            return None
        with open(path) as f:
            fcntl.flock(f.fileno(), fcntl.LOCK_SH)
            try:
                return json.load(f)
            finally:
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)

    def _write_json(self, path: Path, data):
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
            try:
                json.dump(data, f, indent=2, ensure_ascii=False)
            finally:
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)

    def _create_notification(self, ntype, category, title, description="", data=None, actions=None):
        """Create a notification if throttle allows."""
        notifs_file = HERMES_HOME / "notifications.json"
        notifs_data = self._read_json(notifs_file) or {"version": 1, "items": []}

        now = datetime.now().isoformat()
        notif = {
            "id": str(uuid.uuid4()),
            "type": ntype,
            "category": category,
            "title": title,
            "description": description[:200],
            "data": data or {},
            "actions": actions or [],
            "status": "unread",
            "created": now,
            "expires": None,
        }

        notifs_data["items"].append(notif)
        # Keep max 200 notifications
        if len(notifs_data["items"]) > 200:
            notifs_data["items"] = notifs_data["items"][-200:]
        self._write_json(notifs_file, notifs_data)

        # Broadcast via WebSocket
        try:
            from ..websocket_hub import hub
            asyncio.get_event_loop().create_task(
                hub.broadcast("notification:new", {"id": notif["id"], "type": ntype, "title": title})
            )
        except Exception:
            pass

        self.stats["notifications_sent"] += 1
        return notif

    def _log_activity(self, action, entity_type, entity_id="", entity_name="", details=None):
        """Log an activity entry."""
        act_file = HERMES_HOME / "activity.json"
        act_data = self._read_json(act_file) or {"version": 1, "entries": []}

        entry = {
            "id": str(uuid.uuid4())[:8],
            "timestamp": datetime.now().isoformat(),
            "action": action,
            "actor": "autofeed",
            "entity_type": entity_type,
            "entity_id": entity_id,
            "entity_name": entity_name,
            "details": details or {},
            "metadata": {"source": "autofeed"},
        }

        act_data["entries"].append(entry)
        if len(act_data["entries"]) > 500:
            act_data["entries"] = act_data["entries"][-500:]
        self._write_json(act_file, act_data)

        try:
            from ..websocket_hub import hub
            asyncio.get_event_loop().create_task(
                hub.broadcast("activity:new", {"action": action, "entity_type": entity_type, "entity_name": entity_name})
            )
        except Exception:
            pass

    # ── Scan 1: Sessions → Projects ──

    async def _scan_sessions_projects(self):
        """Update project session counts and detect new project candidates."""
        sessions_dir = HERMES_HOME / "sessions"
        if not sessions_dir.exists():
            return 0

        projects_file = HERMES_HOME / "projects.json"
        projects_data = self._read_json(projects_file) or {"version": 1, "items": []}
        projects = projects_data.get("items", [])
        if not projects:
            return 0

        # Read last 20 sessions
        files = sorted(sessions_dir.glob("*.jsonl"), reverse=True)[:20]
        self.stats["sessions_scanned"] += len(files)

        # Track mentions per project
        mentions = {p["id"]: 0 for p in projects}
        recent_topics = Counter()

        for sf in files:
            try:
                content = sf.read_text(errors="ignore").lower()
                for p in projects:
                    terms = [p.get("name", "").lower()] + [k.lower() for k in p.get("keywords", [])]
                    if any(t in content for t in terms if t):
                        mentions[p["id"]] += 1

                # Extract potential new topics (capitalized words 4+ chars)
                words = re.findall(r'\b[a-z]{4,}\b', content[:3000])
                for w in words:
                    if w not in {"avec", "dans", "pour", "cette", "comme", "mais", "oups", "their", "which", "would", "could", "should", "about"}:
                        recent_topics[w] += 1
            except Exception:
                continue

        # Update project stats
        updated = 0
        now = datetime.now().isoformat()
        for p in projects:
            pid = p.get("id")
            if mentions.get(pid, 0) > 0:
                p["session_count"] = mentions[pid]
                p["last_activity"] = now
                updated += 1

        if updated > 0:
            projects_data["items"] = projects
            self._write_json(projects_file, projects_data)

        # Detect recurring topics that don't match existing projects
        existing_names = {p.get("name", "").lower() for p in projects}
        for topic, count in recent_topics.most_common(5):
            if count >= 3 and topic not in existing_names:
                self._create_notification(
                    "action_required", "project",
                    f"Sujet récurrent détecté : {topic}",
                    f"Le sujet '{topic}' apparaît dans {count} sessions récentes mais n'a pas de projet associé.",
                    data={"topic": topic, "count": count},
                    actions=[{"id": "create-project", "label": "Créer le projet", "style": "primary"}],
                )
                break  # Max 1 per scan for project suggestions

        return updated

    # ── Scan 2: Sessions → Backlog ──

    async def _scan_sessions_backlog(self):
        """Detect task patterns in sessions and create backlog items."""
        sessions_dir = HERMES_HOME / "sessions"
        if not sessions_dir.exists():
            return 0, 0

        backlog_file = HERMES_HOME / "backlog.json"
        backlog_data = self._read_json(backlog_file) or {"version": 1, "items": []}
        existing_titles = {i.get("title", "").lower() for i in backlog_data.get("items", [])}

        files = sorted(sessions_dir.glob("*.jsonl"), reverse=True)[:10]
        candidates = []

        for sf in files:
            try:
                content = sf.read_text(errors="ignore")
                for pattern in TASK_PATTERNS:
                    for m in re.finditer(pattern, content, re.IGNORECASE):
                        task_text = m.group(1).strip()
                        # Clean up
                        task_text = re.sub(r'[\n\r]+', ' ', task_text)[:120]
                        if len(task_text) >= 15 and task_text.lower() not in existing_titles:
                            candidates.append(task_text)
            except Exception:
                continue

        # Deduplicate candidates
        seen = set()
        unique = []
        for c in candidates:
            cl = c.lower()[:50]
            if cl not in seen:
                seen.add(cl)
                unique.append(c)

        # Create up to 3 items per scan
        created = 0
        notif_count = 0
        now = datetime.now().isoformat()
        for text in unique[:3]:
            title = text[:80].rstrip()
            if not title or title.lower() in existing_titles:
                continue

            slug = re.sub(r"[^a-z0-9\s-]", "", title.lower())[:40]
            slug = re.sub(r"[\s]+", "-", slug).strip("-") or "task"
            item_id = slug
            existing_ids = {i.get("id") for i in backlog_data.get("items", [])}
            if item_id in existing_ids:
                counter = 2
                while f"{item_id}-{counter}" in existing_ids:
                    counter += 1
                item_id = f"{item_id}-{counter}"

            new_item = {
                "id": item_id,
                "title": title,
                "description": f"Détecté automatiquement depuis les sessions: {text[:200]}",
                "category": "other",
                "priority": "normale",
                "status": "pending",
                "tags": [],
                "source": "autofeed",
                "autofeed_source": "sessions",
                "created": now,
            }

            # Auto-match to a project
            projects_file = HERMES_HOME / "projects.json"
            pdata = self._read_json(projects_file)
            if pdata:
                for p in pdata.get("items", []):
                    terms = [p.get("name", "").lower()] + [k.lower() for k in p.get("keywords", [])]
                    if any(t in text.lower() for t in terms if t):
                        new_item["project_id"] = p["id"]
                        break

            backlog_data.setdefault("items", []).append(new_item)
            existing_titles.add(title.lower())
            created += 1

            if notif_count < MAX_NOTIFS_PER_SCAN:
                self._create_notification(
                    "info", "backlog",
                    f"Tâche détectée : {title[:60]}",
                    f"Nouvelle tâche auto-détectée dans les sessions.",
                    data={"item_id": item_id},
                )
                notif_count += 1

        if created > 0:
            self._write_json(backlog_file, backlog_data)
            self._log_activity("autofeed.backlog_created", "backlog", details={"count": created})

        return created, notif_count

    # ── Scan 3: Memory → Wiki ──

    async def _scan_memory_wiki(self):
        """Suggest wiki page creation from substantial memory files."""
        memory_dir = HERMES_HOME / "memory"
        if not memory_dir.exists():
            return 0

        cutoff = (datetime.now() - timedelta(hours=24)).isoformat()
        notif_count = 0

        for mf in memory_dir.glob("*.md"):
            try:
                stat = mf.stat()
                mtime = datetime.fromtimestamp(stat.st_mtime).isoformat()
                if mtime < cutoff:
                    continue

                content = mf.read_text(errors="ignore")
                if len(content) < 500:
                    continue
                if "##" not in content:
                    continue

                name = mf.stem
                wiki_path = Path.home() / "wiki"
                wiki_exists = False
                if wiki_path.exists():
                    for subdir in ["entities", "concepts", "comparisons", "queries"]:
                        wp = wiki_path / subdir / f"{name}.md"
                        if wp.exists():
                            wiki_exists = True
                            break

                if not wiki_exists and notif_count < MAX_NOTIFS_PER_SCAN:
                    self._create_notification(
                        "info", "wiki",
                        f"Page wiki suggérée : {name}",
                        f"Le fichier memory '{name}.md' est substantiel ({len(content)} chars) et pourrait devenir une page wiki.",
                        data={"source": f"memory/{name}.md", "size": len(content)},
                        actions=[{"id": "create-wiki", "label": "Créer la page wiki", "style": "primary"}],
                    )
                    notif_count += 1

                self.stats["memory_files_scanned"] += 1
            except Exception:
                continue

        return notif_count

    # ── Scan 4: Skills → Wiki ──

    async def _scan_skills_wiki(self):
        """Suggest wiki pages for new skills."""
        skills_dir = HERMES_HOME / "skills"
        if not skills_dir.exists():
            return 0

        cutoff_7d = (datetime.now() - timedelta(days=7)).timestamp()
        wiki_path = Path.home() / "wiki"
        notif_count = 0

        for sf in skills_dir.glob("*.md"):
            try:
                stat = sf.stat()
                if stat.st_mtime < cutoff_7d:
                    # Not new enough
                    continue

                name = sf.stem
                wiki_exists = False
                if wiki_path.exists():
                    for subdir in ["entities", "concepts", "comparisons", "queries"]:
                        wp = wiki_path / subdir / f"{name}.md"
                        if wp.exists():
                            wiki_exists = True
                            break

                if not wiki_exists and notif_count < MAX_NOTIFS_PER_SCAN:
                    self._create_notification(
                        "info", "wiki",
                        f"Skill sans wiki : {name}",
                        f"Le skill '{name}' est récent mais n'a pas de page wiki associée.",
                        data={"skill": name},
                    )
                    notif_count += 1

                self.stats["skills_scanned"] += 1
            except Exception:
                continue

        return notif_count

    # ── Scan 5: GitHub → Projects ──

    async def _scan_github_projects(self):
        """Sync GitHub repos with projects."""
        try:
            result = subprocess.run(
                ["gh", "repo", "list", "duan78", "--limit", "30",
                 "--json", "name,description,pushedAt"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode != 0:
                return 0

            repos = json.loads(result.stdout)
            self.stats["github_repos_scanned"] += len(repos)
        except (subprocess.TimeoutExpired, Exception):
            return 0

        projects_file = HERMES_HOME / "projects.json"
        projects_data = self._read_json(projects_file) or {"version": 1, "items": []}
        projects = projects_data.get("items", [])

        # Build a map of github_repo -> project
        repo_to_project = {}
        for p in projects:
            gr = p.get("github_repo", "")
            if gr:
                repo_to_project[gr.lower()] = p

        now = datetime.now()
        cutoff_24h = (now - timedelta(hours=24)).isoformat()
        notif_count = 0

        for repo in repos:
            name = repo.get("name", "")
            full_name = f"duan78/{name}"
            pushed_at = repo.get("pushedAt", "")

            # Update last_activity if recently pushed
            if full_name.lower() in repo_to_project and pushed_at > cutoff_24h:
                project = repo_to_project[full_name.lower()]
                project["last_activity"] = now.isoformat()

            # Suggest new project for unmapped repos with recent activity
            if full_name.lower() not in repo_to_project and pushed_at > cutoff_24h:
                if notif_count < MAX_NOTIFS_PER_SCAN:
                    desc = repo.get("description", "") or ""
                    self._create_notification(
                        "action_required", "project",
                        f"Nouveau repo GitHub : {name}",
                        f"Le repo '{full_name}' a eu des commits récents mais n'a pas de projet associé. {desc[:100]}",
                        data={"repo": full_name, "pushedAt": pushed_at},
                        actions=[{"id": "create-project", "label": "Créer le projet", "style": "primary"}],
                    )
                    notif_count += 1

        # Save updated projects
        projects_data["items"] = projects
        self._write_json(projects_file, projects_data)

        return notif_count

    # ── Scan 6: Claude Code → Activity ──

    async def _scan_claude_code_activity(self):
        """Detect Claude Code completed tasks and log activity."""
        entries_added = 0

        # Check for Claude Code tmux sessions
        try:
            result = subprocess.run(
                ["tmux", "list-sessions", "-F", "#{session_name}"],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode != 0:
                return 0

            sessions = result.stdout.strip().split("\n")
            task_sessions = [s for s in sessions if s.startswith("task-")]

            backlog_file = HERMES_HOME / "backlog.json"
            backlog_data = self._read_json(backlog_file) or {"version": 1, "items": []}
            items = backlog_data.get("items", [])

            for session_name in task_sessions:
                item_id = session_name.replace("task-", "")
                # Find matching backlog item
                for item in items:
                    if item.get("id") == item_id and item.get("status") == "in-progress":
                        # Check if Claude is still running
                        try:
                            check = subprocess.run(
                                ["pgrep", "-P", subprocess.run(
                                    ["tmux", "list-panes", "-t", session_name, "-F", "#{pane_pid}"],
                                    capture_output=True, text=True, timeout=3,
                                ).stdout.strip()],
                                capture_output=True, text=True, timeout=3,
                            )
                            if check.returncode != 0:
                                # No child process — Claude likely done
                                self._log_activity(
                                    "claude-code.task_completed", "backlog",
                                    item_id, item.get("title", ""),
                                    {"session": session_name, "status": "auto-detected-done"},
                                )
                                entries_added += 1
                        except Exception:
                            continue

        except (subprocess.TimeoutExpired, Exception):
            pass

        # Check recent git commits in known project dirs
        try:
            projects_file = HERMES_HOME / "projects.json"
            pdata = self._read_json(projects_file)
            if pdata:
                for p in pdata.get("items", [])[:5]:
                    repo = p.get("github_repo", "")
                    if not repo:
                        continue
                    # Check if repo exists locally
                    repo_name = repo.split("/")[-1] if "/" in repo else repo
                    possible_paths = [
                        Path.home() / repo_name,
                        Path.home() / "projects" / repo_name,
                        Path("/root") / repo_name,
                    ]
                    for rpath in possible_paths:
                        if rpath.exists() and (rpath / ".git").exists():
                            try:
                                result = subprocess.run(
                                    ["git", "log", "--oneline", "-1", "--since=30 minutes ago",
                                     "--format=%H %s"],
                                    capture_output=True, text=True, timeout=5,
                                    cwd=str(rpath),
                                )
                                if result.returncode == 0 and result.stdout.strip():
                                    commit_line = result.stdout.strip()
                                    self._log_activity(
                                        "git.commit_detected", "project",
                                        p.get("id", ""), p.get("name", ""),
                                        {"commit": commit_line[:100], "repo": str(rpath)},
                                    )
                                    entries_added += 1
                            except Exception:
                                continue
                        break  # Only check first matching path
        except Exception:
            pass

        return entries_added

    def get_status(self):
        return {
            "running": self._running,
            "last_scan": self.last_scan,
            "next_scan": self.next_scan,
            "interval": self.interval,
            "scan_count": self._scan_count,
            "stats": dict(self.stats),
        }


# Singleton
autofeed_service = AutofeedService(interval=300)
