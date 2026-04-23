"""Backlog Intelligence — smart multi-source task extraction with LLM validation.

Sources:
  1. Sessions (enriched patterns + context)
  2. Memory files (TODO/à-faire sections)
  3. Git commits (WIP/TODO/HACK messages)
  4. Conversations (human intent messages)
  5. Skills (TODO/limitations sections)
  6. Stale backlog items (blocked/in-progress alerts)
"""

import asyncio
import fcntl
import json
import logging
import os
import re
import subprocess
import uuid
from datetime import datetime, timedelta
from difflib import SequenceMatcher
from pathlib import Path

import httpx

from ..config import HERMES_HOME

logger = logging.getLogger(__name__)

# ── Constants ──

MAX_AUTO_ADDED = 5
MAX_SUGGESTIONS = 10
LLM_TIMEOUT = 60.0
SUGGESTIONS_FILE = HERMES_HOME / "backlog_suggestions.json"
INTEL_STATS_FILE = HERMES_HOME / "backlog_intelligence_stats.json"
REJECTION_LOG_FILE = HERMES_HOME / "backlog_intelligence_rejections.jsonl"

VALID_CATEGORIES = [
    "voice-cloning", "fine-tune", "infrastructure",
    "dashboard", "seo", "devops", "other",
]
VALID_PRIORITIES = ["haute", "normale", "basse"]

# Enriched session patterns (5 categories)
INTENTION_PATTERNS = [
    r"je\s+voudrais\s+(.{10,120})",
    r"il\s+faudrait\s+(.{10,120})",
    r"faut\s+qu['']?on\s+(.{10,120})",
    r"j['']aimerais\s+(.{10,120})",
    r"on\s+pourrait\s+(.{10,120})",
    r"ça\s+serait\s+bien\s+de\s+(.{10,120})",
    r"ça\s+serait\s+cool\s+de\s+(.{10,120})",
]
DEMAND_PATTERNS = [
    r"\b(mets|enlève|change|modifie|ajoute|supprime|crée|refactor)\s+(.{10,120})",
]
PROBLEM_PATTERNS = [
    r"ça\s+marche\s+pas\s+(.{5,120})",
    r"\bbug\b\s+(.{10,120})",
    r"\berreur\b\s+(.{10,120})",
    r"problème\s+avec\s+(.{10,120})",
    r"\bcassé\b\s+(.{5,120})",
    r"\bplanté\b\s+(.{5,120})",
    r"\brégression\b\s+(.{5,120})",
]
FUTURE_PATTERNS = [
    r"ensuite\s+on\s+fera\s+(.{10,120})",
    r"plus\s+tard\s+(.{10,120})",
    r"dans\s+un\s+second\s+temps\s+(.{10,120})",
    r"la\s+prochaine\s+étape\s+(.{10,120})",
]
DEFERRED_PATTERNS = [
    r"pour\s+plus\s+tard\s*[:\-]?\s*(.{10,120})",
    r"\bà\s+voir\s*[:\-]?\s*(.{10,120})",
    r"\btodo\b\s*[:\-]\s*(.{10,120})",
    r"\bfollow\s+up\b\s*[:\-]?\s*(.{10,120})",
    r"\bà\s+retravailler\s+(.{10,120})",
]

# Original patterns (kept for backward compat)
BASIC_TASK_PATTERNS = [
    r"il\s+faut\s+(.{10,80})",
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

# Memory section headers that indicate tasks
MEMORY_TASK_SECTIONS = re.compile(
    r"^##\s+(?:à\s+faire|todo|problèmes|prochaines?\s+étapes|actions|pending|next\s+steps)",
    re.IGNORECASE | re.MULTILINE,
)

# Conversation intent verbs (French)
CONVERSATION_INTENT = re.compile(
    r"\b(veux|peux|fais|faut|aimerais|voudrais|doit|devrait|pourrait)\b",
    re.IGNORECASE,
)


class BacklogIntelligence:
    """Smart multi-source backlog task extraction with LLM validation."""

    def __init__(self):
        self.stats = {
            "candidates_analyzed": 0,
            "accepted": 0,
            "rejected": 0,
            "suggestions_created": 0,
            "by_source": {},
            "last_analysis": None,
            "analysis_count": 0,
            "reprioritizations": 0,
        }

    # ── Main entry points ──

    async def analyze_and_suggest(self) -> dict:
        """Collect candidates from all sources, validate via LLM, auto-add or suggest."""
        logger.info("BacklogIntelligence: starting analysis #%d", self.stats["analysis_count"] + 1)

        # Load context
        backlog_data = self._read_json(HERMES_HOME / "backlog.json") or {"items": []}
        existing_items = backlog_data.get("items", [])
        projects_data = self._read_json(HERMES_HOME / "projects.json") or {"items": []}
        projects = projects_data.get("items", [])

        # Collect from all sources
        all_candidates = []
        source_results = {}

        for source_name, extractor in [
            ("sessions", self._extract_from_sessions),
            ("memory", self._extract_from_memory),
            ("git", self._extract_from_git),
            ("conversations", self._extract_from_conversations),
            ("skills", self._extract_from_skills),
        ]:
            try:
                candidates = extractor()
                source_results[source_name] = len(candidates)
                for c in candidates:
                    c["source"] = source_name
                all_candidates.extend(candidates)
            except Exception as e:
                logger.error("Source %s extraction error: %s", source_name, e)
                source_results[source_name] = 0

        # Source 6: stale items (creates notifications, not candidates)
        try:
            stale_count = self._check_stale_items(existing_items)
            source_results["stale_alerts"] = stale_count
        except Exception as e:
            logger.error("Stale items check error: %s", e)

        if not all_candidates:
            self.stats["last_analysis"] = datetime.now().isoformat()
            self.stats["analysis_count"] += 1
            self._save_stats()
            return {"auto_added": 0, "suggestions": 0, "rejected": 0, "sources": source_results}

        # Fuzzy dedup before LLM
        deduped = self._fuzzy_dedup(all_candidates, existing_items)
        logger.info("BacklogIntelligence: %d candidates → %d after dedup", len(all_candidates), len(deduped))

        if not deduped:
            self.stats["last_analysis"] = datetime.now().isoformat()
            self.stats["analysis_count"] += 1
            self._save_stats()
            return {"auto_added": 0, "suggestions": 0, "rejected": 0, "sources": source_results}

        # LLM validation
        validated = await self._llm_batch_validate(deduped, existing_items, projects)

        # Process results
        auto_added = 0
        suggestions_count = 0
        rejected_count = 0
        now = datetime.now().isoformat()

        high_confidence = []
        mid_confidence = []

        for c in validated:
            confidence = c.get("confidence", 0.5)
            if not c.get("is_valid"):
                rejected_count += 1
                self._log_rejection(c)
                continue
            if confidence >= 0.5:
                high_confidence.append(c)
            elif confidence >= 0.3:
                mid_confidence.append(c)
            else:
                rejected_count += 1
                self._log_rejection(c)

        # Auto-add high confidence (max 5)
        for c in high_confidence[:MAX_AUTO_ADDED]:
            title = c.get("llm_title") or c.get("title", "")
            project_id = c.get("llm_project_id") or self._auto_assign_project(c, projects)
            item_id = self._slugify(title)
            existing_ids = {i.get("id") for i in existing_items}
            if item_id in existing_ids:
                counter = 2
                while f"{item_id}-{counter}" in existing_ids:
                    counter += 1
                item_id = f"{item_id}-{counter}"

            new_item = {
                "id": item_id,
                "title": title,
                "description": c.get("llm_description") or c.get("description", ""),
                "category": c.get("llm_category") or "other",
                "priority": c.get("llm_priority") or "normale",
                "status": "pending",
                "tags": c.get("llm_tags") or [],
                "source": "autofeed",
                "autofeed_source": c.get("source", "unknown"),
                "confidence": c.get("confidence", 0.5),
                "created": now,
            }
            if project_id:
                new_item["project_id"] = project_id
            task_prompt = c.get("llm_task_prompt", "")
            if task_prompt:
                new_item["task_prompt"] = task_prompt

            existing_items.append(new_item)
            auto_added += 1
            self._create_notification(
                "info", "backlog",
                f"Tâche auto-détectée : {title[:60]}",
                f"Source: {c.get('source', 'unknown')} | Confiance: {c.get('confidence', 0):.0%}",
                data={"item_id": item_id, "confidence": c.get("confidence", 0)},
            )

        # Save suggestions (mid-confidence, max 10)
        current_suggestions = self._read_suggestions()
        for c in mid_confidence[:MAX_SUGGESTIONS]:
            title = c.get("llm_title") or c.get("title", "")
            project_id = c.get("llm_project_id") or self._auto_assign_project(c, projects)
            suggestion = {
                "id": str(uuid.uuid4())[:8],
                "title": title,
                "description": c.get("llm_description") or c.get("description", ""),
                "category": c.get("llm_category") or "other",
                "priority": c.get("llm_priority") or "normale",
                "tags": c.get("llm_tags") or [],
                "task_prompt": c.get("llm_task_prompt", ""),
                "confidence": c.get("confidence", 0.3),
                "source": c.get("source", "unknown"),
                "project_id": project_id,
                "created": now,
                "status": "pending",
            }
            current_suggestions.append(suggestion)
            suggestions_count += 1

        # Keep max 50 suggestions
        if len(current_suggestions) > 50:
            current_suggestions = current_suggestions[-50:]
        self._save_suggestions(current_suggestions)

        # Write backlog
        backlog_data["items"] = existing_items
        self._write_json(HERMES_HOME / "backlog.json", backlog_data)

        # Update stats
        self.stats["candidates_analyzed"] += len(all_candidates)
        self.stats["accepted"] += auto_added
        self.stats["rejected"] += rejected_count
        self.stats["suggestions_created"] += suggestions_count
        for src, cnt in source_results.items():
            self.stats["by_source"][src] = self.stats["by_source"].get(src, 0) + cnt
        self.stats["last_analysis"] = datetime.now().isoformat()
        self.stats["analysis_count"] += 1
        self._save_stats()

        logger.info(
            "BacklogIntelligence: analysis complete — %d auto-added, %d suggestions, %d rejected",
            auto_added, suggestions_count, rejected_count,
        )

        return {
            "auto_added": auto_added,
            "suggestions": suggestions_count,
            "rejected": rejected_count,
            "sources": source_results,
        }

    async def reprioritize_backlog(self) -> dict:
        """Re-evaluate priorities of pending items based on context signals."""
        backlog_data = self._read_json(HERMES_HOME / "backlog.json") or {"items": []}
        items = backlog_data.get("items", [])
        projects_data = self._read_json(HERMES_HOME / "projects.json") or {"items": []}
        projects = projects_data.get("items", [])
        sessions_dir = HERMES_HOME / "sessions"

        # Build project activity map (which projects had sessions in last 24h)
        active_projects = set()
        if sessions_dir.exists():
            cutoff = datetime.now() - timedelta(hours=24)
            for sf in sorted(sessions_dir.glob("*.jsonl"), reverse=True)[:20]:
                try:
                    mtime = datetime.fromtimestamp(sf.stat().st_mtime)
                    if mtime < cutoff:
                        break
                    content = sf.read_text(errors="ignore").lower()
                    for p in projects:
                        terms = [p.get("name", "").lower()] + [k.lower() for k in p.get("keywords", [])]
                        if any(t in content for t in terms if t):
                            active_projects.add(p.get("id"))
                except Exception:
                    continue

        changes = []
        now = datetime.now()

        for item in items:
            if item.get("status") not in ("pending", "blocked", "waiting-human"):
                continue

            score = 0
            title_lower = item.get("title", "").lower()
            desc_lower = (item.get("description") or "").lower()

            # Age points (+1 per day since creation)
            created = item.get("created", "")
            if created:
                try:
                    age_days = (now - datetime.fromisoformat(created)).days
                    score += min(age_days, 30)
                except Exception:
                    pass

            # Bug/error keywords (+3)
            if any(w in title_lower or w in desc_lower for w in ["bug", "erreur", "cassé", "planté", "régression", "error", "crash"]):
                score += 3

            # Active project (+3)
            pid = item.get("project_id")
            if pid and pid in active_projects:
                score += 3

            # Blocked/stale (+2)
            if item.get("status") == "blocked":
                score += 2

            # Compute target priority from score
            if score >= 10:
                target = "haute"
            elif score >= 5:
                target = "normale"
            else:
                target = "basse"

            current = item.get("priority", "normale")
            if target != current:
                item["priority"] = target
                changes.append({
                    "id": item.get("id"),
                    "title": item.get("title", ""),
                    "from": current,
                    "to": target,
                    "score": score,
                })

        if changes:
            self._write_json(HERMES_HOME / "backlog.json", backlog_data)
            self.stats["reprioritizations"] += len(changes)
            self._save_stats()
            for ch in changes:
                self._log_activity(
                    "backlog.reprioritized", "backlog",
                    ch["id"], ch["title"],
                    {"from": ch["from"], "to": ch["to"], "score": ch["score"]},
                )

        return {"changes": len(changes), "details": changes[:10]}

    # ── Source extractors ──

    def _extract_from_sessions(self) -> list[dict]:
        """Scan recent session files — parse JSONL, extract ONLY human/assistant text."""
        sessions_dir = HERMES_HOME / "sessions"
        if not sessions_dir.exists():
            return []

        files = sorted(sessions_dir.glob("*.jsonl"), reverse=True)[:10]
        candidates = []
        all_patterns = (
            INTENTION_PATTERNS + DEMAND_PATTERNS + PROBLEM_PATTERNS +
            FUTURE_PATTERNS + DEFERRED_PATTERNS + BASIC_TASK_PATTERNS
        )

        # Markers that indicate JSON/tool/code artifacts, not natural language
        GARBAGE_MARKERS = [
            '{"', '"timestamp"', '"function"', '"arguments"', '"tool"',
            '\\n', '\\t', '```', 'git diff', 'npm run', 'tmux',
        ]

        for sf in files:
            try:
                raw = sf.read_text(errors="ignore")
                session_name = sf.stem

                # Parse JSONL — only keep human/user/assistant text content
                clean_parts = []
                for line in raw.split('\n'):
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)
                    except (json.JSONDecodeError, ValueError):
                        continue

                    role = entry.get("role", entry.get("type", ""))
                    if role not in ("human", "assistant", "user"):
                        continue

                    msg_content = entry.get("content", "")
                    if isinstance(msg_content, str):
                        clean_parts.append(msg_content)
                    elif isinstance(msg_content, list):
                        for block in msg_content:
                            if isinstance(block, dict) and block.get("type") == "text":
                                clean_parts.append(block.get("text", ""))

                clean_text = "\n".join(clean_parts)

                for pattern in all_patterns:
                    for m in re.finditer(pattern, clean_text, re.IGNORECASE):
                        task_text = m.group(1) if m.lastindex else m.group(0)
                        task_text = re.sub(r'[\n\r]+', ' ', task_text).strip()[:120]
                        if len(task_text) < 15:
                            continue

                        # Skip if it looks like JSON, code, or tool output
                        if any(marker in task_text for marker in GARBAGE_MARKERS):
                            continue

                        candidates.append({
                            "title": task_text[:80],
                            "description": f"Détecté dans la session {session_name}",
                            "raw_text": task_text,
                            "session": session_name,
                            "category_hint": "bug" if pattern in PROBLEM_PATTERNS else "",
                        })
            except Exception:
                continue

        return candidates

    def _extract_from_memory(self) -> list[dict]:
        """Scan memory files modified in last 48h for task sections."""
        memory_dir = HERMES_HOME / "memory"
        if not memory_dir.exists():
            return []

        cutoff = (datetime.now() - timedelta(hours=48)).timestamp()
        candidates = []

        for mf in memory_dir.glob("*.md"):
            try:
                if mf.stat().st_mtime < cutoff:
                    continue
                content = mf.read_text(errors="ignore")
                name = mf.stem

                # Find task-related sections
                for m in MEMORY_TASK_SECTIONS.finditer(content):
                    section_start = m.start()
                    # Find next ## or end of file
                    next_section = content.find("\n## ", section_start + 1)
                    section = content[section_start:next_section] if next_section > 0 else content[section_start:]

                    # Extract bullet points or lines
                    for line in section.split('\n')[1:]:
                        line = line.strip().lstrip('- *').strip()
                        if len(line) >= 15:
                            candidates.append({
                                "title": line[:80],
                                "description": f"Détecté dans memory/{name}.md, section '{m.group(0).strip()}'",
                                "raw_text": line,
                                "memory_file": name,
                            })
            except Exception:
                continue

        return candidates

    def _extract_from_git(self) -> list[dict]:
        """Check git logs for WIP/TODO/HACK/FIXME messages."""
        projects_data = self._read_json(HERMES_HOME / "projects.json") or {"items": []}
        candidates = []

        for p in projects_data.get("items", []):
            repo = p.get("github_repo", "")
            if not repo:
                continue
            repo_name = repo.split("/")[-1] if "/" in repo else repo
            for rpath in [Path.home() / repo_name, Path("/root") / repo_name]:
                if rpath.exists() and (rpath / ".git").exists():
                    try:
                        result = subprocess.run(
                            ["git", "log", "--oneline", "-10",
                             "--since=1 day ago", "--format=%s"],
                            capture_output=True, text=True, timeout=5,
                            cwd=str(rpath),
                        )
                        if result.returncode != 0:
                            continue
                        for line in result.stdout.strip().split('\n'):
                            line = line.strip()
                            if not line:
                                continue
                            lower = line.lower()
                            if any(kw in lower for kw in ["wip", "todo", "hack", "fixme"]):
                                candidates.append({
                                    "title": line[:80],
                                    "description": f"Commit WIP/TODO dans {p.get('name', repo_name)}: {line}",
                                    "raw_text": line,
                                    "project_id": p.get("id"),
                                })
                    except Exception:
                        continue
                    break

        return candidates

    def _extract_from_conversations(self) -> list[dict]:
        """Extract action-intent messages from recent human conversations."""
        sessions_dir = HERMES_HOME / "sessions"
        if not sessions_dir.exists():
            return []

        files = sorted(sessions_dir.glob("*.jsonl"), reverse=True)[:10]
        candidates = []

        # Anti-garbage patterns — messages that are conversation, not tasks
        CONVERSATION_NOISE = [
            r"^(sam|claude|hey|bonjour|salut)[\s,]",
            r"\?$",
            r"^est-ce\s+que",
            r"^c'est\s+quoi",
            r"^pourquoi",
            r"je\s+te\s+demande",
            r"on\s+a\s+bien",
            r"^dis\s+moi",
            r"ça\s+serait\s+bien\s+de\s+",
            r"il\s+y\s+a\s+quelque\s+chose\s+qui\s+ne\s+va\s+pas",
        ]

        for sf in files:
            try:
                content = sf.read_text(errors="ignore")
                session_name = sf.stem

                for line in content.split('\n'):
                    try:
                        entry = json.loads(line)
                    except (json.JSONDecodeError, ValueError):
                        continue

                    if entry.get("type") != "human":
                        continue
                    message = (entry.get("message") or "").strip()

                    # Length filters — real tasks are concise, not monologues
                    if len(message) < 20 or len(message) > 500:
                        continue

                    # Skip conversational noise (greetings, questions, voice-like)
                    is_noise = any(re.search(p, message, re.IGNORECASE) for p in CONVERSATION_NOISE)
                    if is_noise:
                        continue

                    if not CONVERSATION_INTENT.search(message):
                        continue

                    candidates.append({
                        "title": message[:80].rstrip(),
                        "description": f"Message de {session_name}",
                        "raw_text": message[:200],
                        "session": session_name,
                    })
            except Exception:
                continue

        return candidates

    def _extract_from_skills(self) -> list[dict]:
        """Check skills for TODO/limitations sections."""
        skills_dir = HERMES_HOME / "skills"
        if not skills_dir.exists():
            return []

        cutoff_7d = (datetime.now() - timedelta(days=7)).timestamp()
        candidates = []

        task_section_re = re.compile(
            r"^##\s+(?:pitfalls|todo|limitations|known\s+issues|caveats)",
            re.IGNORECASE | re.MULTILINE,
        )

        for sf in skills_dir.glob("*.md"):
            try:
                if sf.stat().st_mtime < cutoff_7d:
                    continue
                content = sf.read_text(errors="ignore")
                name = sf.stem

                for m in task_section_re.finditer(content):
                    section_start = m.start()
                    next_section = content.find("\n## ", section_start + 1)
                    section = content[section_start:next_section] if next_section > 0 else content[section_start:]

                    for line in section.split('\n')[1:]:
                        line = line.strip().lstrip('- *').strip()
                        if len(line) >= 15:
                            candidates.append({
                                "title": f"[{name}] {line[:60]}",
                                "description": f"Détecté dans le skill '{name}', section '{m.group(0).strip()}'",
                                "raw_text": line,
                                "skill": name,
                            })
            except Exception:
                continue

        return candidates

    def _check_stale_items(self, existing_items: list[dict]) -> int:
        """Check for stale blocked/in-progress items and create notifications."""
        now = datetime.now()
        alerts = 0

        for item in existing_items:
            status = item.get("status", "")
            created = item.get("created", "")
            if not created:
                continue

            try:
                age = (now - datetime.fromisoformat(created)).days
            except Exception:
                continue

            if status == "blocked" and age >= 7:
                self._create_notification(
                    "action_required", "backlog",
                    f"Tâche bloquée depuis {age} jours : {item.get('title', '')[:50]}",
                    f"La tâche '{item.get('title', '')}' est bloquée depuis {age} jours.",
                    data={"item_id": item.get("id"), "days_blocked": age},
                )
                alerts += 1
            elif status == "in-progress" and age >= 3:
                self._create_notification(
                    "warning", "backlog",
                    f"Tâche en cours depuis {age} jours : {item.get('title', '')[:50]}",
                    f"La tâche '{item.get('title', '')}' est en cours depuis {age} jours sans completion.",
                    data={"item_id": item.get("id"), "days_in_progress": age},
                )
                alerts += 1

        return alerts

    # ── LLM Validation ──

    async def _llm_batch_validate(
        self, candidates: list[dict], existing_items: list[dict], projects: list[dict]
    ) -> list[dict]:
        """Validate and enrich candidates via LLM. Returns candidates with LLM fields."""
        llm_cfg = self._load_llm_config()
        if not llm_cfg or not llm_cfg.get("api_key"):
            logger.warning("No LLM config — passing candidates through without validation")
            for c in candidates:
                c["is_valid"] = True
                c["confidence"] = 0.5
                c["llm_title"] = c.get("title", "")
                c["llm_description"] = c.get("description", "")
                c["llm_category"] = "other"
                c["llm_priority"] = "normale"
                c["llm_task_prompt"] = ""
                c["llm_tags"] = []
                c["llm_project_id"] = c.get("project_id")
            return candidates

        # Build context
        existing_titles = [i.get("title", "") for i in existing_items if i.get("status") != "done"]
        existing_summary = "\n".join(f"- {t}" for t in existing_titles[:50]) if existing_titles else "(empty backlog)"

        projects_summary = "\n".join(
            f"- {p.get('name', '')} (id: {p.get('id', '')}) keywords: {', '.join(p.get('keywords', [])[:5])}"
            for p in projects[:20]
        ) if projects else "(no projects)"

        candidate_lines = []
        for i, c in enumerate(candidates):
            candidate_lines.append(
                f'{i + 1}. title: "{c.get("title", "")}"\n'
                f'   description: "{c.get("description", "")}"\n'
                f'   source: {c.get("source", "unknown")}'
            )
        candidates_text = "\n".join(candidate_lines)

        prompt = f"""Tu es un chef de projet senior qui analyse les conversations et activités d'un développeur pour en extraire des tâches backlog pertinentes.

PROJETS ACTIFS:
{projects_summary}

BACKLOG EXISTANT (ne pas dupliquer):
{existing_summary}

CANDIDATS À VALIDER:
{candidates_text}

RÈGLES STRICTES — REJETER les candidats qui sont:
- Trop vagues ou génériques ("vérifier X", "améliorer Y")
- Duplicatas proches d'éléments existants du backlog
- De simples observations, pas des tâches actionnables
- Des tâches triviales (< 15 min)
- Du bruit transitoire (timeouts, rate limits, erreurs temporaires)
- Des suggestions "nice to have" sans urgence ni demande explicite

RÈGLES — ACCEPTER UNIQUEMENT les candidats qui sont:
- Des tâches claires, spécifiques, actionnables avec un livrable défini
- Du travail réel > 30 minutes
- Des bugs avec des détails de reproduction
- Des fonctionnalités demandées explicitement par l'utilisateur
- Des problèmes critiques d'infrastructure

PRIORISATION CONTEXTUELLE:
- Tâches liées à un projet actif (sessions récentes) → priorité plus haute
- Bugs/erreurs → haute priorité
- Demandes explicites de l'utilisateur → haute priorité
- Suggestions/opinions → basse priorité ou rejet
- "Nice to have" sans urgence → basse priorité

Pour CHAQUE candidat, répondre en JSON:
```json
[
  {{
    "index": 1,
    "is_valid": true/false,
    "reject_reason": "pourquoi rejeté" ou null,
    "title": "titre concis (français, forme impérative)",
    "description": "description détaillée avec contexte (français)",
    "category": "un de: {', '.join(VALID_CATEGORIES)}",
    "priority": "un de: {', '.join(VALID_PRIORITIES)}",
    "project_id": "id du projet correspondant ou null",
    "tags": ["tag1", "tag2"],
    "task_prompt": "instruction complète pour un agent IA (français, détaillé)",
    "confidence": 0.8
  }}
]
```

Confiance: 0.0-1.0. >= 0.5 = ajout auto, 0.3-0.5 = suggestion, < 0.3 = rejet.

Répondre UNIQUEMENT avec le tableau JSON, aucun autre texte."""

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

            async with httpx.AsyncClient(timeout=httpx.Timeout(LLM_TIMEOUT, connect=10.0)) as client:
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code != 200:
                    logger.error("LLM validation failed: %d %s", resp.status_code, resp.text[:200])
                    return self._fallback_validate(candidates)

                content = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "")

            json_match = re.search(r'\[[\s\S]*\]', content)
            if not json_match:
                logger.error("LLM response not valid JSON: %s", content[:300])
                return self._fallback_validate(candidates)

            results = json.loads(json_match.group())
            results_by_index = {r.get("index", i + 1): r for i, r in enumerate(results)}

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
                c["llm_tags"] = r.get("tags", [])
                c["llm_project_id"] = r.get("project_id")
                c["confidence"] = min(1.0, max(0.0, r.get("confidence", 0.5)))

            return candidates

        except Exception as e:
            logger.error("LLM validation error: %s", e)
            return self._fallback_validate(candidates)

    @staticmethod
    def _fallback_validate(candidates):
        """Strict heuristic validation when LLM is unavailable."""
        validated = []

        GARBAGE_MARKERS = [
            'timestamp', '"function"', '"arguments"', '"tool"',
            '\\"', '\\n', '```', 'git diff', 'npm run', 'tmux capture',
            'json', 'content":', '"role":', '"type":',
        ]

        # Lowercase-starting verbs that are legitimate task starters
        TASK_STARTERS = {
            "ajouter", "ajoute", "corriger", "corrige", "créer", "crée",
            "fix", "implement", "modifie", "modifier", "supprimer", "supprime",
            "mettre", "mets", "enlever", "enlève", "refactor", "update",
            "add", "remove", "delete", "create", "build", "deploy",
        }

        for c in candidates:
            title = c.get("title", "")
            raw = c.get("raw_text", title)

            # Reject anything with JSON/tool artifacts
            if any(m in raw for m in GARBAGE_MARKERS):
                c["is_valid"] = False
                c["reject_reason"] = "contains non-task artifacts (JSON/tool output)"
                c["confidence"] = 0.1
                continue

            # Reject if title contains escape sequence artifacts
            if '\\\\' in title or '\\n' in title:
                c["is_valid"] = False
                c["reject_reason"] = "contains escape sequence artifacts"
                c["confidence"] = 0.1
                continue

            # Reject if title starts with lowercase (likely mid-sentence fragment)
            # unless it's a recognized task-starting verb
            if title and title[0].islower():
                first_word = title.split()[0].lower() if title.split() else ""
                if first_word not in TASK_STARTERS:
                    c["is_valid"] = False
                    c["reject_reason"] = "title starts with lowercase (likely fragment)"
                    c["confidence"] = 0.1
                    continue

            # Accept but with confidence below suggestion threshold (0.3)
            # → won't be auto-added or suggested
            c["is_valid"] = True
            c["confidence"] = 0.25
            c["llm_title"] = c.get("title", "")
            c["llm_description"] = c.get("description", "")
            c["llm_category"] = c.get("category_hint", "other") or "other"
            c["llm_priority"] = "basse"
            c["llm_task_prompt"] = ""
            c["llm_tags"] = []
            c["llm_project_id"] = c.get("project_id")
            validated.append(c)

        return validated

    # ── Helpers ──

    def _fuzzy_dedup(self, candidates: list[dict], existing_items: list[dict]) -> list[dict]:
        """Remove duplicates within candidates and against existing backlog."""
        existing_titles = {i.get("title", "").lower() for i in existing_items}
        seen_texts = set()
        deduped = []

        for c in candidates:
            title_lower = c.get("title", "").lower().strip()

            # Check against existing backlog
            if title_lower in existing_titles:
                continue

            # Similarity check against existing
            is_dup = False
            for et in existing_titles:
                if et and SequenceMatcher(None, title_lower, et).ratio() > 0.65:
                    is_dup = True
                    break
            if is_dup:
                continue

            # Check within candidates
            text_key = title_lower[:50]
            if text_key in seen_texts:
                continue
            seen_texts.add(text_key)
            deduped.append(c)

        return deduped

    def _auto_assign_project(self, candidate: dict, projects: list[dict]) -> str | None:
        """Try to auto-assign a project based on title/keywords matching."""
        title_lower = (candidate.get("llm_title") or candidate.get("title", "")).lower()
        for p in projects:
            terms = [p.get("name", "").lower()] + [k.lower() for k in p.get("keywords", [])]
            if any(t in title_lower for t in terms if len(t) >= 3):
                return p.get("id")
        return None

    @staticmethod
    def _slugify(title: str) -> str:
        slug = title.lower().strip()
        slug = re.sub(r"[^a-z0-9\s-]", "", slug)
        slug = re.sub(r"[\s]+", "-", slug)
        slug = re.sub(r"-+", "-", slug)
        return slug.strip("-") or "item"

    @staticmethod
    def _load_llm_config():
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

    def _read_suggestions(self) -> list[dict]:
        data = self._read_json(SUGGESTIONS_FILE)
        return data.get("suggestions", []) if data else []

    def _save_suggestions(self, suggestions: list[dict]):
        self._write_json(SUGGESTIONS_FILE, {"version": 1, "suggestions": suggestions})

    def _log_rejection(self, candidate: dict):
        """Append rejection to audit log."""
        try:
            entry = {
                "timestamp": datetime.now().isoformat(),
                "title": candidate.get("title", "")[:80],
                "source": candidate.get("source", ""),
                "reject_reason": candidate.get("reject_reason", ""),
                "confidence": candidate.get("confidence", 0),
            }
            with open(REJECTION_LOG_FILE, "a") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        except Exception:
            pass

    def _save_stats(self):
        self._write_json(INTEL_STATS_FILE, self.stats)

    def get_status(self) -> dict:
        stats = self._read_json(INTEL_STATS_FILE) or self.stats
        suggestions = self._read_suggestions()
        pending_suggestions = [s for s in suggestions if s.get("status") == "pending"]
        return {
            **stats,
            "pending_suggestions": len(pending_suggestions),
        }

    def get_suggestions(self) -> list[dict]:
        return [s for s in self._read_suggestions() if s.get("status") == "pending"]

    def accept_suggestion(self, suggestion_id: str) -> dict | None:
        """Accept a suggestion: move it to backlog."""
        suggestions = self._read_suggestions()
        target = None
        for s in suggestions:
            if s.get("id") == suggestion_id and s.get("status") == "pending":
                s["status"] = "accepted"
                target = s
                break

        if not target:
            return None

        self._save_suggestions(suggestions)

        # Create backlog item
        backlog_data = self._read_json(HERMES_HOME / "backlog.json") or {"items": []}
        item_id = self._slugify(target["title"])
        existing_ids = {i.get("id") for i in backlog_data.get("items", [])}
        if item_id in existing_ids:
            counter = 2
            while f"{item_id}-{counter}" in existing_ids:
                counter += 1
            item_id = f"{item_id}-{counter}"

        new_item = {
            "id": item_id,
            "title": target["title"],
            "description": target.get("description", ""),
            "category": target.get("category", "other"),
            "priority": target.get("priority", "normale"),
            "status": "pending",
            "tags": target.get("tags", []),
            "source": "autofeed",
            "autofeed_source": target.get("source", "suggestion"),
            "confidence": target.get("confidence", 0.4),
            "created": datetime.now().isoformat(),
        }
        if target.get("project_id"):
            new_item["project_id"] = target["project_id"]
        if target.get("task_prompt"):
            new_item["task_prompt"] = target["task_prompt"]

        backlog_data.setdefault("items", []).append(new_item)
        self._write_json(HERMES_HOME / "backlog.json", backlog_data)

        self.stats["accepted"] = self.stats.get("accepted", 0) + 1
        self._save_stats()

        return new_item

    def reject_suggestion(self, suggestion_id: str, reason: str = "") -> bool:
        """Reject a suggestion and log why."""
        suggestions = self._read_suggestions()
        for s in suggestions:
            if s.get("id") == suggestion_id and s.get("status") == "pending":
                s["status"] = "rejected"
                self._log_rejection({
                    "title": s.get("title", ""),
                    "source": s.get("source", ""),
                    "reject_reason": reason or "user_rejected",
                    "confidence": s.get("confidence", 0),
                })
                break
        else:
            return False

        self._save_suggestions(suggestions)
        self.stats["rejected"] = self.stats.get("rejected", 0) + 1
        self._save_stats()
        return True

    def get_rejection_log(self, limit: int = 100) -> list[dict]:
        """Read rejection log entries."""
        if not REJECTION_LOG_FILE.exists():
            return []
        try:
            lines = REJECTION_LOG_FILE.read_text().strip().split('\n')
            entries = []
            for line in lines[-limit:]:
                try:
                    entries.append(json.loads(line))
                except (json.JSONDecodeError, ValueError):
                    continue
            return list(reversed(entries))
        except Exception:
            return []

    def _create_notification(self, ntype, category, title, description="", data=None):
        """Create a notification."""
        notifs_file = HERMES_HOME / "notifications.json"
        notifs_data = self._read_json(notifs_file) or {"version": 1, "items": []}

        notif = {
            "id": str(uuid.uuid4()),
            "type": ntype,
            "category": category,
            "title": title,
            "description": description[:200],
            "data": data or {},
            "actions": [],
            "status": "unread",
            "created": datetime.now().isoformat(),
            "expires": None,
        }
        notifs_data["items"].append(notif)
        if len(notifs_data["items"]) > 200:
            notifs_data["items"] = notifs_data["items"][-200:]
        self._write_json(notifs_file, notifs_data)

        try:
            from ..websocket_hub import hub
            asyncio.get_event_loop().create_task(
                hub.broadcast("notification:new", {"id": notif["id"], "type": ntype, "title": title})
            )
        except Exception:
            pass

    def _log_activity(self, action, entity_type, entity_id="", entity_name="", details=None):
        """Log an activity entry."""
        act_file = HERMES_HOME / "activity.json"
        act_data = self._read_json(act_file) or {"version": 1, "entries": []}

        entry = {
            "id": str(uuid.uuid4())[:8],
            "timestamp": datetime.now().isoformat(),
            "action": action,
            "actor": "backlog_intelligence",
            "entity_type": entity_type,
            "entity_id": entity_id,
            "entity_name": entity_name,
            "details": details or {},
            "metadata": {"source": "backlog_intelligence"},
        }
        act_data["entries"].append(entry)
        if len(act_data["entries"]) > 500:
            act_data["entries"] = act_data["entries"][-500:]
        self._write_json(act_file, act_data)


# Singleton
backlog_intelligence = BacklogIntelligence()
