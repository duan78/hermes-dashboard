import re
from datetime import UTC

from fastapi import APIRouter, Query

from ..utils import run_hermes

router = APIRouter(prefix="/api/insights", tags=["insights"])

# The actual emoji used as section headers in hermes insights output
_RE_DASH = r"[\u2500\-]+"


def _parse_insights(raw: str) -> dict:
    """Parse hermes insights CLI output into structured data."""
    result = {
        "period": "",
        "overview": {},
        "models": [],
        "platforms": [],
        "tools": [],
        "activity": {"days": {}, "peak_hours": "", "active_days": 0},
        "notable": [],
    }

    # Period
    m = re.search(r"Period:\s*(.+)", raw)
    if m:
        result["period"] = m.group(1).strip()

    # ── Overview key-value pairs ──
    # Between "Overview" header and the next emoji header
    ov_sec = re.search(r"Overview\s*" + _RE_DASH + r"\s*\n(.*?)(?=\n\s*\U0001f4cb|\n\s*\U0001f916|\n\s*\U0001f4f1|\n\s*\U0001f527|\n\s*\U0001f4c5|\n\s*\U0001f3c6|\Z)", raw, re.DOTALL)
    if not ov_sec:
        # Fallback: Overview section between Overview header and Models Used
        ov_sec = re.search(r"Overview\s*" + _RE_DASH + r"\s*\n(.*?)(?=\n\s*\S.*Models Used|\n\s*\S.*Platforms|\n\s*\S.*Top Tools|\Z)", raw, re.DOTALL)
    if ov_sec:
        for line in ov_sec.group(1).strip().splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("*") or stripped.startswith("\u2500"):
                continue
            # Each line: "Key:   value" possibly two pairs separated by 2+ spaces
            kvs = re.findall(r"([\w\s./]+?):\s+([\S].*?)(?:\s{2,}|$)", stripped)
            for key, val in kvs:
                k = key.strip()
                v = val.strip()
                if ":" in v and not v.startswith("$") and not v.startswith("~"):
                    continue
                if v:
                    result["overview"][k] = v

    # ── Models Used ──
    # Find lines between "Models Used" header-line and next emoji section
    models_match = re.search(r"Models Used\s*" + _RE_DASH + r"\s*\n\s*Model\s+\S.*?\n(.*?)(?=\n\s*\U0001f4f1|\n\s*\U0001f527|\n\s*\U0001f4c5|\n\s*\U0001f3c6|\Z)", raw, re.DOTALL)
    if models_match:
        for line in models_match.group(1).strip().splitlines():
            if line.strip().startswith("*"):
                continue
            parts = line.split()
            if len(parts) >= 3:
                result["models"].append({
                    "model": parts[0],
                    "sessions": parts[1],
                    "tokens": parts[2],
                    "cost": parts[3] if len(parts) > 3 else "N/A",
                })

    # ── Platforms ──
    plat_match = re.search(r"Platforms\s*" + _RE_DASH + r"\s*\n\s*Platform\s+\S.*?\n(.*?)(?=\n\s*\U0001f527|\n\s*\U0001f4c5|\n\s*\U0001f3c6|\Z)", raw, re.DOTALL)
    if plat_match:
        for line in plat_match.group(1).strip().splitlines():
            parts = line.split()
            if len(parts) >= 3:
                result["platforms"].append({
                    "platform": parts[0],
                    "sessions": parts[1],
                    "messages": parts[2],
                    "tokens": parts[3] if len(parts) > 3 else "0",
                })

    # ── Top Tools ──
    tools_match = re.search(r"Top Tools\s*" + _RE_DASH + r"\s*\n\s*Tool\s+\S.*?\n(.*?)(?=\n\s*\U0001f4c5|\n\s*\U0001f3c6|\Z)", raw, re.DOTALL)
    if tools_match:
        for line in tools_match.group(1).strip().splitlines():
            parts = line.split()
            if len(parts) >= 2 and parts[0] not in ("Tool",):
                result["tools"].append({
                    "tool": parts[0],
                    "calls": parts[1],
                    "percent": parts[2] if len(parts) > 2 else "",
                })

    # ── Activity Patterns ──
    act_match = re.search(r"Activity Patterns\s*" + _RE_DASH + r"\s*\n(.*?)(?=\n\s*\U0001f3c6|\Z)", raw, re.DOTALL)
    if act_match:
        for line in act_match.group(1).strip().splitlines():
            m_day = re.match(r"\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\S*\s*(\d+)?", line)
            if m_day:
                result["activity"]["days"][m_day.group(1)] = int(m_day.group(2) or 0)
                continue
            m_peak = re.match(r"\s*Peak hours:\s*(.*)", line)
            if m_peak:
                result["activity"]["peak_hours"] = m_peak.group(1).strip()
                continue
            m_active = re.match(r"\s*Active days:\s*(\d+)", line)
            if m_active:
                result["activity"]["active_days"] = int(m_active.group(1))

    # ── Notable Sessions ──
    not_match = re.search(r"Notable Sessions\s*" + _RE_DASH + r"\s*\n(.*)", raw, re.DOTALL)
    if not_match:
        for line in not_match.group(1).strip().splitlines():
            parts = re.match(
                r"\s*(Longest session|Most messages|Most tokens|Most tool calls)\s+(\S+\s*\S*)\s+\(([^)]+)\)",
                line,
            )
            if parts:
                result["notable"].append({
                    "label": parts.group(1),
                    "value": parts.group(2).strip(),
                    "detail": parts.group(3).strip(),
                })

    return result


@router.get("")
async def get_insights(days: int = Query(default=7)):
    """Get structured usage insights."""
    try:
        output = await run_hermes("insights", "--days", str(days), timeout=30)
        parsed = _parse_insights(output)
    except RuntimeError as e:
        parsed = {
            "error": str(e), "period": "", "overview": {},
            "models": [], "platforms": [], "tools": [],
            "activity": {"days": {}, "peak_hours": "", "active_days": 0},
            "notable": [],
        }

    # Enrich with session-derived metrics
    import json

    from ..config import HERMES_HOME

    sessions_dir = HERMES_HOME / "sessions"
    hourly_counts = [0] * 24
    top_skills = {}
    response_times = []
    platform_msg_counts = {}
    tokens_by_day = {}

    if sessions_dir.exists():
        from datetime import datetime, timedelta

        cutoff = datetime.now(UTC) - timedelta(days=days)

        for f in sessions_dir.glob("session_*.json"):
            try:
                data = json.loads(f.read_text())
                created = data.get("created_at", "")
                if created:
                    try:
                        dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                        if dt.tzinfo is None:
                            dt = dt.replace(tzinfo=UTC)
                        if dt < cutoff:
                            continue
                        hour = dt.hour
                        hourly_counts[hour] += 1
                        day_key = dt.strftime("%Y-%m-%d")
                        tokens_by_day[day_key] = tokens_by_day.get(day_key, 0) + data.get("tokens", {}).get("total", 0)
                    except (ValueError, TypeError):
                        pass

                platform = data.get("platform", "unknown")
                msg_count = data.get("message_count", 0)
                platform_msg_counts[platform] = platform_msg_counts.get(platform, 0) + msg_count

                # Collect skill usage from JSONL
                sid = data.get("session_id", f.stem.replace("session_", ""))
                jsonl_path = sessions_dir / f"{sid}.jsonl"
                if jsonl_path.exists():
                    last_user_time = None
                    for line in jsonl_path.read_text(errors="replace").strip().split("\n"):
                        if not line.strip():
                            continue
                        try:
                            msg = json.loads(line)
                        except json.JSONDecodeError:
                            continue

                        # Track tool/skill usage
                        for tc in (msg.get("tool_calls") or []):
                            name = tc.get("function", {}).get("name") or tc.get("name", "")
                            if name:
                                top_skills[name] = top_skills.get(name, 0) + 1

                        # Estimate response time
                        role = msg.get("role", "")
                        ts = msg.get("timestamp", "")
                        if role == "user" and ts:
                            last_user_time = ts
                        elif role == "assistant" and last_user_time and ts:
                            try:
                                t1 = datetime.fromisoformat(last_user_time.replace("Z", "+00:00"))
                                t2 = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                                diff = (t2 - t1).total_seconds()
                                if 0 < diff < 300:
                                    response_times.append(diff)
                            except (ValueError, TypeError):
                                pass
                            last_user_time = None
            except (json.JSONDecodeError, Exception):
                continue

    # Build enriched data
    sorted_skills = sorted(top_skills.items(), key=lambda x: x[1], reverse=True)[:10]
    avg_response = sum(response_times) / len(response_times) if response_times else 0

    parsed["hourly_activity"] = hourly_counts
    parsed["top_skills"] = [{"skill": s, "count": c} for s, c in sorted_skills]
    parsed["avg_response_seconds"] = round(avg_response, 1)
    parsed["platform_messages"] = platform_msg_counts
    parsed["tokens_by_day"] = tokens_by_day

    return parsed
