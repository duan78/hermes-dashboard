import fcntl
import json
import logging
import os
import re
import shlex
import subprocess
import time
from datetime import datetime, timedelta
from difflib import SequenceMatcher
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/backlog", tags=["backlog"])

BACKLOG_FILE = Path("/root/.hermes/backlog.json")


def _read_backlog():
    """Read the backlog file with file locking."""
    if not BACKLOG_FILE.exists():
        return {"version": 1, "created": datetime.now().strftime("%Y-%m-%d"), "items": []}
    with open(BACKLOG_FILE) as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_SH)
        try:
            data = json.load(f)
        finally:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)
    if "items" not in data:
        data["items"] = []
    return data


def _write_backlog(data):
    """Write the backlog file with file locking."""
    BACKLOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(BACKLOG_FILE, "w") as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX)
        try:
            json.dump(data, f, indent=2, ensure_ascii=False)
        finally:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)


def _slugify(title):
    """Create a slug from title: lowercase, spaces to hyphens, remove special chars."""
    slug = title.lower().strip()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"[\s]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    slug = slug.strip("-")
    return slug or "item"


# ── Schemas ──

class BacklogItemCreate(BaseModel):
    title: str
    description: str = ""
    category: str = "other"
    priority: str = "normale"
    status: str = "pending"
    blocked_reason: str = ""
    project_id: str | None = None
    tags: list[str] = []

class BacklogItemUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    category: str | None = None
    priority: str | None = None
    status: str | None = None
    blocked_reason: str | None = None
    done_date: str | None = None
    result: str | None = None
    project_id: str | None = None
    tags: list[str] | None = None

class StatusPatch(BaseModel):
    status: str


class AutofeedCandidate(BaseModel):
    title: str
    description: str = ""
    category: str = ""
    priority: str = ""
    source: str = ""

class AutofeedRequest(BaseModel):
    candidates: list[AutofeedCandidate]
    context: str = ""  # Optional session context for better LLM validation


# ── LLM helpers for auto-feed ──

VALID_CATEGORIES = ["voice-cloning", "fine-tune", "infrastructure", "dashboard", "seo", "devops", "other"]
VALID_PRIORITIES = ["haute", "normale", "bassee"]
MIN_TITLE_LENGTH = 10
MIN_DESCRIPTION_LENGTH = 20
SIMILARITY_THRESHOLD = 0.65  # Reject if >65% similar to existing title
RECENTLY_DONE_DAYS = 7       # Also dedup against items done in the last N days

# Noise patterns to reject at the API level (source/reason-based filtering)
NOISE_SOURCE_PATTERNS = re.compile(
    r'(?:timeout|timed?\s*out|rate[\s-]?limit|429|too many requests|'
    r'cerebras.*(?:error|unavail)|mistral.*failed|'
    r'autofeed.*(?:start|end|noise|log)|direct[\s-]?write|'
    r'api.*(?:unreach|error|down)|connection refused)',
    re.IGNORECASE
)


def _load_llm_config():
    """Load LLM config from config.yaml for direct API calls."""
    import yaml
    config_path = Path(os.path.expanduser("~/.hermes/config.yaml"))
    if not config_path.exists():
        return None
    try:
        cfg = yaml.safe_load(config_path.read_text())
        model_cfg = cfg.get("model", {})
        return {
            "api_key": model_cfg.get("api_key", ""),
            "base_url": model_cfg.get("base_url", "https://api.openai.com/v1"),
            "model": model_cfg.get("default", "gpt-4o"),
        }
    except Exception as e:
        logger.warning("Error loading LLM config: %s", e)
        return None


async def _llm_validate_candidates(candidates: list[dict], existing_items: list[dict], context: str = "") -> list[dict]:
    """Use LLM to validate, categorize, and enrich candidates in one batch call.

    Returns a list of validated/enriched candidates. Items rejected by the LLM
    get is_valid=false.
    """
    llm_cfg = _load_llm_config()
    if not llm_cfg or not llm_cfg.get("api_key"):
        logger.warning("No LLM config available for auto-feed validation — skipping LLM check")
        # If no LLM, just pass through with basic defaults
        for c in candidates:
            c["is_valid"] = True
            c["llm_category"] = c.get("category") or "other"
            c["llm_priority"] = c.get("priority") or "normale"
            c["llm_title"] = c.get("title", "")
            c["llm_description"] = c.get("description", "")
            c["llm_task_prompt"] = ""
        return candidates

    # Build existing titles summary for dedup context
    existing_titles = [item.get("title", "") for item in existing_items if item.get("status") != "done"]
    existing_summary = "\n".join(f"- {t}" for t in existing_titles[:50]) if existing_titles else "(empty backlog)"

    # Build candidate summary
    candidate_lines = []
    for i, c in enumerate(candidates):
        candidate_lines.append(f'{i+1}. title: "{c.get("title", "")}"\n   description: "{c.get("description", "")}"')
    candidates_text = "\n".join(candidate_lines)

    prompt = f"""You are a task quality validator for a software project backlog. Analyze each candidate task and decide if it's a REAL, ACTIONABLE task worth adding to the backlog.

EXISTING BACKLOG (do not duplicate):
{existing_summary}

CANDIDATES TO VALIDATE:
{candidates_text}

RULES - BE STRICT. Reject candidates that are:
- Too vague or generic (e.g. "check something", "improve X", "verify Y")
- Already done or trivially completable (< 15 min work)
- Duplicates or near-duplicates of existing backlog items
- Just observations/opinions, not actionable tasks
- Missing substance (no clear deliverable or scope)
- Trivial config changes or one-liner fixes
- Investigation/exploration tasks with no concrete deliverable
- Tasks based on transient noise (timeouts, rate limits, temporary API errors)
- Tasks about documentation unless there's a clear functional gap
- Tasks about auditing/reviewing code without a specific bug or incident
- Tasks proposing to add monitoring/logging without a specific incident triggering it

RULES - accept ONLY candidates that are:
- Clear, specific, actionable tasks with defined scope and deliverable
- Real work that takes > 30 minutes
- Bug fixes with concrete reproduction details and evidence of user impact
- Features with clear requirements from actual user requests
- Critical infrastructure issues (service down, data loss risk, security vulnerability)
- Tasks where NOT doing them causes real problems (not just "nice to have")

When in doubt, REJECT. A noisy backlog is worse than a small one.

For EACH candidate, respond in JSON array format:
```json
[
  {{
    "index": 1,
    "is_valid": true/false,
    "reject_reason": "why rejected" or null,
    "title": "clean concise title (French, imperative form)",
    "description": "detailed description with context (French)",
    "category": "one of: {', '.join(VALID_CATEGORIES)}",
    "priority": "one of: {', '.join(VALID_PRIORITIES)}",
    "task_prompt": "complete instruction for an AI agent to execute this task (French, detailed)"
  }}
]
```

Respond ONLY with the JSON array, no other text."""

    try:
        base_url = llm_cfg["base_url"].rstrip("/")
        url = f"{base_url}/chat/completions" if not base_url.endswith("/chat/completions") else base_url
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {llm_cfg['api_key']}",
        }
        payload = {
            "model": llm_cfg["model"],
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.1,
            "max_tokens": 4096,
        }

        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code != 200:
                logger.error("LLM validation failed: %d %s", resp.status_code, resp.text[:200])
                # Fallback: pass through without LLM
                for c in candidates:
                    c["is_valid"] = True
                    c["llm_category"] = c.get("category") or "other"
                    c["llm_priority"] = c.get("priority") or "normale"
                    c["llm_title"] = c.get("title", "")
                    c["llm_description"] = c.get("description", "")
                    c["llm_task_prompt"] = ""
                return candidates

            content = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "")

        # Extract JSON from response (handle markdown code blocks)
        json_match = re.search(r'\[[\s\S]*\]', content)
        if not json_match:
            logger.error("LLM response not valid JSON array: %s", content[:300])
            for c in candidates:
                c["is_valid"] = True
                c["llm_category"] = c.get("category") or "other"
                c["llm_priority"] = c.get("priority") or "normale"
                c["llm_title"] = c.get("title", "")
                c["llm_description"] = c.get("description", "")
                c["llm_task_prompt"] = ""
            return candidates

        results = json.loads(json_match.group())
        results_by_index = {r.get("index", i+1): r for i, r in enumerate(results)}

        for i, c in enumerate(candidates):
            idx = i + 1
            r = results_by_index.get(idx, {})
            c["is_valid"] = r.get("is_valid", False)
            c["reject_reason"] = r.get("reject_reason")
            c["llm_title"] = r.get("title", c.get("title", ""))
            c["llm_description"] = r.get("description", c.get("description", ""))
            c["llm_category"] = r.get("category", "other") if r.get("category") in VALID_CATEGORIES else "other"
            c["llm_priority"] = r.get("priority", "normale") if r.get("priority") in VALID_PRIORITIES else "normale"
            c["llm_task_prompt"] = r.get("task_prompt", "")

        return candidates

    except Exception as e:
        logger.error("LLM validation error [%s]: %s", type(e).__name__, e)
        for c in candidates:
            c["is_valid"] = True
            c["llm_category"] = c.get("category") or "other"
            c["llm_priority"] = c.get("priority") or "normale"
            c["llm_title"] = c.get("title", "")
            c["llm_description"] = c.get("description", "")
            c["llm_task_prompt"] = ""
        return candidates


def _is_duplicate(title: str, existing_items: list[dict], threshold: float = SIMILARITY_THRESHOLD) -> str | None:
    """Check if title is too similar to an existing item. Returns the matching title or None.

    Checks both active items AND recently-done items (within RECENTLY_DONE_DAYS)
    to prevent re-creating tasks that were just completed.
    """
    title_lower = title.lower().strip()
    title_words = set(title_lower.split())
    cutoff_date = (datetime.now() - timedelta(days=RECENTLY_DONE_DAYS)).isoformat()

    for item in existing_items:
        status = item.get("status", "")
        existing_title = item.get("title", "").lower().strip()
        if not existing_title:
            continue

        # Skip done items that are older than the cutoff
        if status == "done":
            done_date = item.get("done_date", "")
            if not done_date or done_date < cutoff_date:
                continue

        # Quick slug check
        if _slugify(title) == _slugify(existing_title):
            return existing_title
        # Word overlap check (fast)
        existing_words = set(existing_title.split())
        if len(title_words) >= 3 and len(existing_words) >= 3:
            overlap = len(title_words & existing_words)
            if overlap / max(len(title_words), len(existing_words)) > 0.8:
                return existing_title
        # SequenceMatcher for closer check
        ratio = SequenceMatcher(None, title_lower, existing_title).ratio()
        if ratio > threshold:
            return existing_title
    return None


# ── Tmux helpers ──

def _tmux_session_exists(session_name: str) -> bool:
    """Check if a tmux session exists."""
    result = subprocess.run(
        ["tmux", "has-session", "-t", session_name],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    return result.returncode == 0


def _get_tmux_output(session_name: str, lines: int = 500) -> str:
    """Capture the current visible output of a tmux session."""
    # Use capture-pane to get the visible buffer
    result = subprocess.run(
        ["tmux", "capture-pane", "-t", session_name, "-p", "-S", f"-{lines}"],
        capture_output=True, text=True
    )
    if result.returncode == 0:
        return result.stdout.strip()
    return ""


def _get_tmux_scrollback(session_name: str, lines: int = 2000) -> str:
    """Capture the scrollback history of a tmux session."""
    result = subprocess.run(
        ["tmux", "capture-pane", "-t", session_name, "-p", "-S", f"-{lines}"],
        capture_output=True, text=True
    )
    if result.returncode == 0:
        return result.stdout.strip()
    return ""


def _is_claude_running(session_name: str) -> bool:
    """Check if Claude Code process is still running inside a tmux session.

    This is the MOST RELIABLE way to detect if Claude is done:
    - Get the shell PID from tmux
    - Walk the process tree to find any 'claude' or 'node' child
    - If none found, Claude has exited = task is done
    """
    try:
        # Get the PID of the first pane's shell
        result = subprocess.run(
            ["tmux", "list-panes", "-t", session_name, "-F", "#{pane_pid}"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode != 0 or not result.stdout.strip():
            return False

        pane_pid = result.stdout.strip().split("\n")[0].strip()
        if not pane_pid.isdigit():
            return False

        # Check if 'claude' or 'node' process exists as child of this shell
        # Use pgrep with parent PID to find child processes
        check = subprocess.run(
            ["pgrep", "-P", pane_pid],
            capture_output=True, text=True, timeout=5
        )
        if check.returncode != 0 or not check.stdout.strip():
            # No child processes = Claude is not running = done
            return False

        child_pids = check.stdout.strip().split("\n")
        for cpid in child_pids:
            cpid = cpid.strip()
            if not cpid.isdigit():
                continue
            # Check the command name of this child
            try:
                with open(f"/proc/{cpid}/comm") as f:
                    comm = f.read().strip()
                if comm in ("claude", "node", "python3", "python"):
                    return True
                # bash may be running claude via launcher script — check cmdline
                if comm == "bash":
                    try:
                        cmdline = open(f"/proc/{cpid}/cmdline").read().replace("\0", " ")
                        if "claude" in cmdline:
                            return True
                    except (FileNotFoundError, PermissionError):
                        pass
                # Also check children of children (claude spawns node)
                sub_check = subprocess.run(
                    ["pgrep", "-P", cpid],
                    capture_output=True, text=True, timeout=5
                )
                if sub_check.returncode == 0:
                    for sub_pid in sub_check.stdout.strip().split("\n"):
                        sub_pid = sub_pid.strip()
                        if not sub_pid.isdigit():
                            continue
                        try:
                            with open(f"/proc/{sub_pid}/comm") as f:
                                sub_comm = f.read().strip()
                            if sub_comm in ("claude", "node", "python3", "python"):
                                return True
                            # Check bash children for claude too
                            if sub_comm == "bash":
                                try:
                                    cmdline = open(f"/proc/{sub_pid}/cmdline").read().replace("\0", " ")
                                    if "claude" in cmdline:
                                        return True
                                except (FileNotFoundError, PermissionError):
                                    pass
                        except (FileNotFoundError, PermissionError):
                            pass
            except (FileNotFoundError, PermissionError):
                pass

        return False
    except Exception as e:
        logger.warning("Error checking Claude process in %s: %s", session_name, e)
        return False  # Assume not running on error = conservative


def _detect_claude_done(session_name: str, output: str = "") -> bool:
    """Detect if Claude Code has finished its task.

    Uses a multi-signal approach for reliability:
    1. Process check: if 'claude'/'node' is NOT running in the pane = done
    2. Output markers: look for completion signals in scrollback

    This avoids false positives from prompt echo and false negatives
    when the ✻ marker scrolled out of the visible buffer.
    """
    # Signal 1: Process-based detection (most reliable)
    if not _is_claude_running(session_name):
        # Claude process exited — but verify it actually ran (not just launched)
        # by checking for any output beyond the initial prompt
        if output:
            # Check there's actual content (more than just the echoed prompt)
            lines = output.strip().split("\n")
            non_prompt_lines = [l for l in lines if not l.strip().startswith(">") and l.strip()]
            if len(non_prompt_lines) > 3:
                return True

    # Signal 1b: Direct pgrep for claude processes in the tmux session
    try:
        pgrep_result = subprocess.run(
            ["tmux", "list-panes", "-t", session_name, "-F", "#{pane_pid}"],
            capture_output=True, text=True, timeout=5
        )
        if pgrep_result.returncode == 0 and pgrep_result.stdout.strip():
            pane_pid = pgrep_result.stdout.strip().split("\n")[0].strip()
            # Use pgrep to find any claude process in the session's process tree
            tree_check = subprocess.run(
                ["pgrep", "-a", "-P", pane_pid],
                capture_output=True, text=True, timeout=5
            )
            if tree_check.returncode == 0:
                for line in tree_check.stdout.strip().split("\n"):
                    if "claude" in line.lower():
                        return False  # Claude is still running
    except Exception:
        pass

    # Signal 2: Output-based detection (fallback)
    if not output:
        return False

    # Look for completion marker or "Brewed for" in the output
    has_completion = "✻" in output or "Brewed for" in output
    if has_completion:
        lines = output.strip().split("\n")
        for line in lines[-10:]:
            stripped = line.strip()
            if re.search(r'[❯>]\s*$', stripped):
                return True
            if re.search(r'\?\s*for\s+shortcuts', stripped):
                return True
    return False


def _update_item_status(item_id: str, status: str, result: str = None):
    """Helper to update an item's status and optionally capture result."""
    data = _read_backlog()
    items = data.get("items", [])
    for i, item in enumerate(items):
        if item.get("id") == item_id:
            items[i]["status"] = status
            if status == "done":
                items[i]["done_date"] = datetime.now().isoformat()
            else:
                items[i]["done_date"] = None
            if result is not None:
                items[i]["result"] = result
            data["items"] = items
            _write_backlog(data)
            logger.info("Item %s status -> %s (result captured: %s)", item_id, status, result is not None)
            return items[i]
    return None


# ── Endpoints ──

@router.get("")
async def list_backlog_items(
    status: str | None = Query(None),
    category: str | None = Query(None),
    priority: str | None = Query(None),
    project_id: str | None = Query(None),
    tag: str | None = Query(None),
):
    """List all backlog items, with optional filtering."""
    data = _read_backlog()
    items = data.get("items", [])

    if status:
        items = [i for i in items if i.get("status") == status]
    if category:
        items = [i for i in items if i.get("category") == category]
    if priority:
        items = [i for i in items if i.get("priority") == priority]
    if project_id:
        items = [i for i in items if i.get("project_id") == project_id]
    if tag:
        items = [i for i in items if tag in i.get("tags", [])]

    return {"items": items, "total": len(items)}


@router.get("/stats")
async def backlog_stats():
    """Return aggregate statistics for the backlog."""
    data = _read_backlog()
    items = data.get("items", [])

    by_status = {}
    by_category = {}
    by_project = {}
    for item in items:
        s = item.get("status", "unknown")
        by_status[s] = by_status.get(s, 0) + 1
        c = item.get("category", "unknown")
        by_category[c] = by_category.get(c, 0) + 1
        pid = item.get("project_id") or "none"
        by_project[pid] = by_project.get(pid, 0) + 1

    return {"total": len(items), "by_status": by_status, "by_category": by_category, "by_project": by_project}


@router.post("/auto-feed")
async def auto_feed_backlog(body: AutofeedRequest):
    """Smart auto-feed endpoint: validates, deduplicates, categorizes candidates via LLM before adding.

    Accepts a list of candidate tasks, applies quality filters, LLM validation,
    deduplication, auto-categorization, and only creates items that pass all checks.
    """
    data = _read_backlog()
    existing_items = data.get("items", [])

    candidates = [c.model_dump() for c in body.candidates]
    results = {
        "received": len(candidates),
        "accepted": [],
        "rejected": [],
        "errors": [],
    }

    # ── Stage 1: Basic quality + noise filter (pre-LLM) ──
    pre_filtered = []
    for c in candidates:
        title = c.get("title", "").strip()
        desc = c.get("description", "").strip()
        source = c.get("source", "")

        # Minimum length checks
        if len(title) < MIN_TITLE_LENGTH:
            results["rejected"].append({"title": title[:50], "reason": f"title too short ({len(title)}<{MIN_TITLE_LENGTH})"})
            continue

        # Title must not be all the same or just generic filler
        generic_titles = {"todo", "task", "fix", "update", "check", "tâche", "à faire", "fix me", "do this"}
        if title.lower().strip() in generic_titles:
            results["rejected"].append({"title": title[:50], "reason": "title too generic"})
            continue

        # v3: Reject candidates based on noisy source/reason patterns
        if source and NOISE_SOURCE_PATTERNS.search(source):
            results["rejected"].append({"title": title[:50], "reason": f"noisy source: {source[:50]}"})
            continue

        # v3: Reject candidates whose description is primarily about transient errors
        if desc and NOISE_SOURCE_PATTERNS.search(desc):
            # Only reject if the entire task is about a transient issue
            transient_keywords = ['timeout', 'rate limit', '429', 'too many requests', 'connection refused']
            if any(kw in desc.lower() for kw in transient_keywords):
                results["rejected"].append({"title": title[:50], "reason": "transient issue (timeout/rate-limit)"})
                continue

        pre_filtered.append(c)

    logger.info("Auto-feed: %d/%d candidates passed pre-filter", len(pre_filtered), len(candidates))

    if not pre_filtered:
        return results

    # ── Stage 2: Deduplication check (pre-LLM) ──
    deduped = []
    for c in pre_filtered:
        dup = _is_duplicate(c.get("title", ""), existing_items)
        if dup:
            results["rejected"].append({"title": c.get("title", "")[:50], "reason": f"duplicate of: {dup[:50]}"})
            continue
        deduped.append(c)

    logger.info("Auto-feed: %d/%d candidates passed dedup", len(deduped), len(pre_filtered))

    if not deduped:
        return results

    # ── Stage 3: LLM validation + categorization ──
    validated = await _llm_validate_candidates(deduped, existing_items, body.context)

    # ── Stage 4: Create accepted items ──
    now = datetime.now().isoformat()
    for c in validated:
        if not c.get("is_valid"):
            results["rejected"].append({
                "title": c.get("title", "")[:50],
                "reason": c.get("reject_reason", "LLM rejected"),
            })
            continue

        title = c.get("llm_title") or c.get("title", "")
        description = c.get("llm_description") or c.get("description", "")
        category = c.get("llm_category") or c.get("category") or "other"
        priority = c.get("llm_priority") or c.get("priority") or "normale"
        task_prompt = c.get("llm_task_prompt", "")

        # Final duplicate check with enriched title
        dup = _is_duplicate(title, existing_items)
        if dup:
            results["rejected"].append({"title": title[:50], "reason": f"post-LLM duplicate: {dup[:50]}"})
            continue

        # Create the item
        item_id = _slugify(title)
        existing_ids = {i.get("id") for i in existing_items}
        if item_id in existing_ids:
            counter = 2
            while f"{item_id}-{counter}" in existing_ids:
                counter += 1
            item_id = f"{item_id}-{counter}"

        new_item = {
            "id": item_id,
            "title": title,
            "description": description,
            "category": category,
            "priority": priority,
            "status": "pending",
            "created": now,
            "source": "autofeed",
        }
        if task_prompt:
            new_item["task_prompt"] = task_prompt
        if c.get("source"):
            new_item["autofeed_source"] = c["source"]

        existing_items.append(new_item)
        results["accepted"].append({
            "id": item_id,
            "title": title,
            "category": category,
            "priority": priority,
        })
        logger.info("Auto-feed accepted: %s [%s/%s]", item_id, category, priority)

    # Write once at the end
    data["items"] = existing_items
    _write_backlog(data)

    logger.info("Auto-feed complete: %d accepted, %d rejected out of %d candidates",
                len(results["accepted"]), len(results["rejected"]), results["received"])

    return results


@router.get("/auto-check")
async def auto_check_inprogress():
    """Scan all in-progress items and auto-mark completed ones as done.

    For each in-progress item, checks the associated tmux session:
    - Session gone → mark done with "Session tmux terminée"
    - Session alive but Claude idle → mark done, capture last 2000 chars of scrollback
    - Session alive and Claude working → leave as in-progress
    """
    data = _read_backlog()
    items = data.get("items", [])

    in_progress = [i for i in items if i.get("status") == "in-progress"]

    checked = len(in_progress)
    done = 0
    still_running = 0
    errors = 0

    for item in in_progress:
        item_id = item.get("id")
        session_name = "task-" + item_id

        try:
            session_exists = _tmux_session_exists(session_name)

            if not session_exists:
                _update_item_status(item_id, "done", result="Session tmux terminée")
                logger.info("auto-check: %s → done (tmux session gone)", item_id)
                done += 1
                continue

            # Session exists — check if Claude is idle
            output = _get_tmux_output(session_name)
            claude_done = _detect_claude_done(session_name, output)

            if claude_done:
                scrollback = _get_tmux_scrollback(session_name, 2000)
                result_text = scrollback[-2000:] if len(scrollback) > 2000 else scrollback
                _update_item_status(item_id, "done", result=result_text)
                logger.info("auto-check: %s → done (Claude idle)", item_id)
                done += 1
            else:
                still_running += 1

        except Exception as e:
            logger.error("auto-check: error checking %s: %s", item_id, e)
            errors += 1

    return {"checked": checked, "done": done, "still_running": still_running, "errors": errors}


@router.get("/auto-feed/history")
async def auto_feed_history():
    """Return stats about auto-fed items."""
    data = _read_backlog()
    items = data.get("items", [])

    autofed = [i for i in items if i.get("source") == "autofeed" or i.get("autofeed_source")]
    manual = [i for i in items if i.get("source") != "autofeed" and not i.get("autofeed_source")]

    autofed_by_status = {}
    autofed_by_category = {}
    for item in autofed:
        s = item.get("status", "unknown")
        autofed_by_status[s] = autofed_by_status.get(s, 0) + 1
        c = item.get("category", "unknown")
        autofed_by_category[c] = autofed_by_category.get(c, 0) + 1

    return {
        "autofed_total": len(autofed),
        "manual_total": len(manual),
        "autofed_by_status": autofed_by_status,
        "autofed_by_category": autofed_by_category,
    }


# ── Intelligence endpoints ──

@router.get("/intelligence/status")
async def intelligence_status():
    """Return backlog intelligence stats."""
    from ..services.backlog_intelligence import backlog_intelligence
    return backlog_intelligence.get_status()


@router.get("/intelligence/suggestions")
async def intelligence_suggestions():
    """Return pending suggestions awaiting user validation."""
    from ..services.backlog_intelligence import backlog_intelligence
    return {"suggestions": backlog_intelligence.get_suggestions()}


@router.post("/intelligence/accept/{suggestion_id}")
async def intelligence_accept(suggestion_id: str):
    """Accept a suggestion and create a backlog item."""
    from ..services.backlog_intelligence import backlog_intelligence
    item = backlog_intelligence.accept_suggestion(suggestion_id)
    if not item:
        raise HTTPException(404, "Suggestion not found or already processed")
    return {"success": True, "item": item}


@router.post("/intelligence/reject/{suggestion_id}")
async def intelligence_reject(suggestion_id: str, request: Request = None):
    """Reject a suggestion and log the reason."""
    from ..services.backlog_intelligence import backlog_intelligence
    reason = ""
    if request:
        try:
            body = await request.json()
            reason = body.get("reason", "")
        except Exception:
            pass
    ok = backlog_intelligence.reject_suggestion(suggestion_id, reason)
    if not ok:
        raise HTTPException(404, "Suggestion not found or already processed")
    return {"success": True}


@router.post("/intelligence/trigger")
async def intelligence_trigger():
    """Force a full intelligence analysis."""
    from ..services.backlog_intelligence import backlog_intelligence
    result = await backlog_intelligence.analyze_and_suggest()
    return {"success": True, "result": result}


@router.get("/intelligence/rejection-log")
async def intelligence_rejection_log(limit: int = Query(100, le=500)):
    """Return the LLM rejection audit log."""
    from ..services.backlog_intelligence import backlog_intelligence
    return {"entries": backlog_intelligence.get_rejection_log(limit)}


@router.get("/auto-feed/trigger")
async def auto_feed_trigger():
    """Seed the backlog with initial items based on project context if backlog is empty."""
    data = _read_backlog()
    items = data.get("items", [])

    if items:
        return {"status": "already_populated", "total": len(items), "added": 0}

    now = datetime.now().isoformat()
    seed_items = [
        {
            "id": "optimiser-requetes-insights",
            "title": "Optimiser les requêtes insights du dashboard",
            "description": "L'endpoint /api/insights met plus de 4s à répondre. Mettre en cache les résultats ou optimiser le scan des 3000+ sessions JSONL.",
            "category": "dashboard",
            "priority": "normale",
            "status": "pending",
            "created": now,
        },
        {
            "id": "ajout-monitoring-ppfmultisites",
            "title": "Ajouter le monitoring PPFMultiSites au dashboard",
            "description": "Intégrer les métriques PPFMultiSites (statuts de scrapers, résultats de crawling) dans le dashboard Hermes.",
            "category": "dashboard",
            "priority": "haute",
            "status": "pending",
            "created": now,
        },
        {
            "id": "automatiser-deploiement-dashboard",
            "title": "Automatiser le déploiement du dashboard via CI/CD",
            "description": "Le dashboard est déployé manuellement via systemctl. Configurer un pipeline de build automatique du frontend et redémarrage du service.",
            "category": "devops",
            "priority": "normale",
            "status": "pending",
            "created": now,
        },
        {
            "id": "ajout-tests-endpoints-api",
            "title": "Ajouter des tests pour les endpoints API du dashboard",
            "description": "Les endpoints du dashboard n'ont pas de tests automatisés. Écrire des tests pytest pour les routers critiques (sessions, memory, backlog).",
            "category": "dashboard",
            "priority": "bassee",
            "status": "pending",
            "created": now,
        },
    ]

    data["items"] = seed_items
    _write_backlog(data)
    logger.info("Seeded backlog with %d initial items", len(seed_items))

    return {"status": "seeded", "total": len(seed_items), "added": len(seed_items)}


def _auto_match_project(projects: list, title: str, description: str = "") -> str | None:
    """Try to match a backlog item to a project using relaxed keyword matching.

    Matching strategies (first match wins):
    1. Each word of project keyword/name (split by dash/space) found in title+description
    2. Project name without common prefixes/slug suffixes found in title+description
    """
    text_lower = (title + " " + (description or "")).lower()

    for p in projects:
        pid = p.get("id", "")
        if not pid:
            continue

        # Collect candidate terms from keywords
        keywords = [k.lower() for k in p.get("keywords", []) if len(k) >= 3]
        name_lower = p.get("name", "").lower()

        # Strategy (a): split each keyword and name by dash/space -> individual words
        all_source_terms = keywords + ([name_lower] if len(name_lower) >= 3 else [])
        word_sets = []
        for term in all_source_terms:
            words = [w for w in re.split(r"[-\s_]+", term) if len(w) >= 3]
            if words:
                word_sets.append(words)

        for words in word_sets:
            if all(w in text_lower for w in words):
                return pid

        # Strategy (b): project name without slug/prefix — strip common patterns
        clean_name = name_lower
        for prefix in ("hermes-", "project-", "app-"):
            if clean_name.startswith(prefix):
                clean_name = clean_name[len(prefix):]
                break
        clean_name = re.sub(r"[-_](dashboard|app|web|service|api|backend|frontend)$", "", clean_name)
        if len(clean_name) >= 3 and clean_name in text_lower:
            return pid

    return None


@router.post("")
async def create_backlog_item(body: BacklogItemCreate):
    """Create a new backlog item. ID is auto-generated from title."""
    data = _read_backlog()
    items = data.get("items", [])

    item_id = _slugify(body.title)
    # Ensure uniqueness
    existing_ids = {i.get("id") for i in items}
    if item_id in existing_ids:
        counter = 2
        while f"{item_id}-{counter}" in existing_ids:
            counter += 1
        item_id = f"{item_id}-{counter}"

    now = datetime.now().isoformat()
    new_item = {
        "id": item_id,
        "title": body.title,
        "description": body.description,
        "category": body.category,
        "priority": body.priority,
        "status": body.status,
        "tags": body.tags,
        "created": now,
    }
    if body.project_id:
        new_item["project_id"] = body.project_id
    else:
        # Auto-match to existing project by title/description keywords
        try:
            projects_file = Path("/root/.hermes/projects.json")
            if projects_file.exists():
                with open(projects_file) as pf:
                    pdata = json.load(pf)
                matched = _auto_match_project(pdata.get("items", []), body.title, body.description)
                if matched:
                    new_item["project_id"] = matched
        except Exception:
            pass
    if body.blocked_reason:
        new_item["blocked_reason"] = body.blocked_reason
    if body.status == "done":
        new_item["done_date"] = now

    items.append(new_item)
    data["items"] = items
    _write_backlog(data)
    logger.info("Created backlog item: %s", item_id)

    # Log activity
    try:
        from .activity import log_activity
        log_activity("backlog.created", "backlog", item_id, body.title)
    except Exception:
        pass

    return new_item


@router.post("/relink")
async def relink_backlog_items():
    """Re-scan all backlog items without a project_id and try to auto-match them."""
    data = _read_backlog()
    items = data.get("items", [])

    projects_file = Path("/root/.hermes/projects.json")
    if not projects_file.exists():
        raise HTTPException(404, "Projects file not found")

    with open(projects_file) as pf:
        pdata = json.load(pf)
    projects = pdata.get("items", [])

    relinked = []
    for item in items:
        if item.get("project_id"):
            continue
        matched = _auto_match_project(projects, item.get("title", ""), item.get("description", ""))
        if matched:
            item["project_id"] = matched
            relinked.append({"id": item["id"], "title": item.get("title", ""), "project_id": matched})

    if relinked:
        data["items"] = items
        _write_backlog(data)

    logger.info("Relinked %d backlog items to projects", len(relinked))
    return {"relinked": len(relinked), "items": relinked}


@router.put("/{item_id}")
async def update_backlog_item(item_id: str, body: BacklogItemUpdate):
    """Update fields of an existing backlog item."""
    data = _read_backlog()
    items = data.get("items", [])

    for i, item in enumerate(items):
        if item.get("id") == item_id:
            updates = body.model_dump(exclude_none=True)
            # If status is being set to done and no done_date, set it
            if updates.get("status") == "done" and not updates.get("done_date"):
                updates["done_date"] = datetime.now().isoformat()
            # If status is being changed away from done, clear done_date
            if updates.get("status") and updates.get("status") != "done":
                updates["done_date"] = None
            items[i].update(updates)
            data["items"] = items
            _write_backlog(data)
            logger.info("Updated backlog item: %s", item_id)

            # Log activity
            try:
                from .activity import log_activity
                action = "backlog.status_changed" if "status" in updates else "backlog.updated"
                log_activity(action, "backlog", item_id, items[i].get("title", ""))
            except Exception:
                pass

            return items[i]

    raise HTTPException(404, "Backlog item not found")


@router.delete("/{item_id}")
async def delete_backlog_item(item_id: str):
    """Delete a backlog item by ID."""
    data = _read_backlog()
    items = data.get("items", [])
    item_title = ""
    for it in items:
        if it.get("id") == item_id:
            item_title = it.get("title", "")
            break

    new_items = [i for i in items if i.get("id") != item_id]
    if len(new_items) == len(items):
        raise HTTPException(404, "Backlog item not found")

    data["items"] = new_items
    _write_backlog(data)
    logger.info("Deleted backlog item: %s", item_id)

    # Log activity
    try:
        from .activity import log_activity
        log_activity("backlog.deleted", "backlog", item_id, item_title)
    except Exception:
        pass

    return {"status": "deleted", "id": item_id}


@router.patch("/{item_id}/status")
async def patch_backlog_status(item_id: str, body: StatusPatch):
    """Change the status of a backlog item."""
    data = _read_backlog()
    items = data.get("items", [])

    for i, item in enumerate(items):
        if item.get("id") == item_id:
            items[i]["status"] = body.status
            if body.status == "done":
                items[i]["done_date"] = datetime.now().isoformat()
            else:
                items[i]["done_date"] = None
            data["items"] = items
            _write_backlog(data)
            logger.info("Patched status of %s to %s", item_id, body.status)
            return items[i]

    raise HTTPException(404, "Backlog item not found")


@router.post("/{item_id}/run")
async def run_backlog_item(item_id: str):
    """Launch a Claude Code session to execute this backlog item."""
    data = _read_backlog()
    items = data.get("items", [])

    target_item = None
    target_index = -1
    for i, item in enumerate(items):
        if item.get("id") == item_id:
            target_item = item
            target_index = i
            break

    if target_item is None:
        raise HTTPException(404, "Backlog item not found")

    if target_item.get("status") == "done":
        # Allow re-running by resetting to pending first
        items[target_index]["status"] = "pending"
        items[target_index]["done_date"] = None
        items[target_index]["result"] = None
        data["items"] = items
        _write_backlog(data)
        logger.info("Resetting done task %s for re-run", item_id)

    # Build task prompt
    title = target_item.get("title", "")
    description = target_item.get("description", "")
    if description:
        task_prompt = "Task from Hermes Backlog:\n\n## " + title + "\n\n" + description + "\n\n## Instructions\nExecute this task autonomously. When done, report the results."
    else:
        task_prompt = "Task from Hermes Backlog:\n\n## " + title + "\n\n## Instructions\nExecute this task autonomously. When done, report the results."

    session_name = "task-" + item_id

    # Check if tmux session already exists
    result = subprocess.run(
        ["tmux", "has-session", "-t", session_name],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    if result.returncode == 0:
        # Session already exists
        return {"ok": True, "session": session_name, "status": "in-progress", "prompt": task_prompt, "existing": True}

    # Create new tmux session
    subprocess.run(["tmux", "new-session", "-d", "-s", session_name])

    # Write prompt to a temp file to avoid all quoting issues with tmux send-keys
    prompt_file = f"/tmp/backlog-task-{item_id}.txt"
    Path(prompt_file).write_text(task_prompt, encoding="utf-8")

    # Write a small launcher script that reads the prompt file and runs Claude Code
    # This avoids any quoting/escaping issues with tmux send-keys
    launcher = f"/tmp/backlog-launch-{item_id}.sh"
    Path(launcher).write_text(
        f'#!/bin/bash\n'
        f'/root/.local/bin/claude -p "$(cat {shlex.quote(prompt_file)})"\n',
        encoding="utf-8",
    )
    os.chmod(launcher, 0o755)

    # Send the short launcher command via tmux
    subprocess.run(["tmux", "send-keys", "-t", session_name, f"bash {launcher}", "Enter"])

    # Wait for Claude Code to start
    time.sleep(5)

    # Update item status to in-progress
    items[target_index]["status"] = "in-progress"
    data["items"] = items
    _write_backlog(data)
    logger.info("Launched Claude Code session %s for backlog item %s", session_name, item_id)

    return {"ok": True, "session": session_name, "status": "in-progress", "prompt": task_prompt}


@router.get("/{item_id}/session")
async def get_session_status(item_id: str):
    """Check if a Claude Code session is running for this backlog item."""
    session_name = "task-" + item_id
    result = subprocess.run(
        ["tmux", "has-session", "-t", session_name],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    running = result.returncode == 0
    return {"session": session_name, "running": running}


@router.get("/{item_id}/check")
async def check_backlog_completion(item_id: str):
    """Check if a running Claude Code session has completed for this item."""
    session_name = "task-" + item_id

    data = _read_backlog()
    items = data.get("items", [])
    target_item = None
    target_index = -1
    for i, item in enumerate(items):
        if item.get("id") == item_id:
            target_item = item
            target_index = i
            break

    if target_item is None:
        raise HTTPException(404, "Backlog item not found")

    current_status = target_item.get("status", "pending")

    # Already done?
    if current_status == "done":
        return {"item_id": item_id, "status": "done", "session_exists": False, "completed": True, "output": ""}

    # Check if tmux session exists
    session_exists = _tmux_session_exists(session_name)

    if not session_exists:
        # Session gone — mark as done if still in-progress
        if current_status == "in-progress":
            _update_item_status(item_id, "done", result="Session ended (tmux session no longer exists)")
            return {"item_id": item_id, "status": "done", "session_exists": False, "completed": True, "output": ""}
        return {"item_id": item_id, "status": current_status, "session_exists": False, "completed": False, "output": ""}

    # Session exists — check if Claude has finished
    output = _get_tmux_output(session_name)
    claude_done = _detect_claude_done(output)

    if claude_done and current_status == "in-progress":
        # Capture the last portion of output as the result
        full_output = _get_tmux_scrollback(session_name, 500)
        # Extract the meaningful result (last 2000 chars)
        result_text = full_output[-2000:] if len(full_output) > 2000 else full_output
        _update_item_status(item_id, "done", result=result_text)
        return {"item_id": item_id, "status": "done", "session_exists": True, "completed": True, "output": output}

    return {
        "item_id": item_id,
        "status": current_status,
        "session_exists": True,
        "completed": claude_done,
        "claude_idle": claude_done,
        "output": output,
    }


@router.get("/{item_id}/output")
async def get_backlog_output(item_id: str, lines: int = Query(200, ge=1, le=5000)):
    """Get the live output from a Claude Code tmux session."""
    session_name = "task-" + item_id

    if not _tmux_session_exists(session_name):
        # Try to return cached result from backlog item
        data = _read_backlog()
        items = data.get("items", [])
        for item in items:
            if item.get("id") == item_id:
                cached = item.get("result", "")
                return {
                    "item_id": item_id,
                    "session": session_name,
                    "running": False,
                    "output": cached,
                    "cached": True,
                }
        raise HTTPException(404, "No session found and item not in backlog")

    output = _get_tmux_output(session_name, lines)
    return {
        "item_id": item_id,
        "session": session_name,
        "running": True,
        "output": output,
        "cached": False,
    }


@router.post("/{item_id}/complete")
async def force_complete_item(item_id: str, capture_lines: int = Query(200, ge=1, le=5000)):
    """Force-mark a backlog item as done and capture the session output as result."""
    session_name = "task-" + item_id

    data = _read_backlog()
    items = data.get("items", [])
    target_item = None
    for i, item in enumerate(items):
        if item.get("id") == item_id:
            target_item = item
            break

    if target_item is None:
        raise HTTPException(404, "Backlog item not found")

    # Capture output if session exists
    result_text = ""
    if _tmux_session_exists(session_name):
        result_text = _get_tmux_scrollback(session_name, capture_lines)
        # Take last 3000 chars as result
        if len(result_text) > 3000:
            result_text = "...(truncated)...\n" + result_text[-3000:]
    else:
        result_text = "Session already ended. No live output captured."

    updated = _update_item_status(item_id, "done", result=result_text)

    # Optionally kill the tmux session
    if _tmux_session_exists(session_name):
        subprocess.run(
            ["tmux", "kill-session", "-t", session_name],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )

    return {"ok": True, "item_id": item_id, "item": updated}
