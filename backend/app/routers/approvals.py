"""Approval history endpoints."""

import json
import logging
import re
from pathlib import Path

from fastapi import APIRouter

from ..config import HERMES_HOME
from ..utils import hermes_path

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/approvals", tags=["approvals"])


@router.get("/history")
async def get_approval_history():
    """Read recent approval entries from Hermes log files.

    Scans gateway.log and other log files for approval-related lines.
    Returns the last 50 entries.
    """
    entries = []

    log_patterns = [
        re.compile(r"(?P<date>\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}).*approval.*(?P<status>approved|denied|auto.approved|rejected)", re.IGNORECASE),
        re.compile(r"(?P<date>\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}).*tool.*(?P<status>approved|denied|rejected)", re.IGNORECASE),
        re.compile(r"(?P<date>\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}).*(?:confirm|approve|reject).*?(?:command|tool)[:\s]*(?P<command>[^\s,]+)", re.IGNORECASE),
    ]

    # Check log directory
    logs_dir = hermes_path("logs")
    log_files = []
    if logs_dir.exists():
        log_files = sorted(logs_dir.glob("*.log"), key=lambda f: f.stat().st_mtime, reverse=True)
    else:
        # Fallback to single log file
        single_log = hermes_path("gateway.log")
        if single_log.exists():
            log_files = [single_log]

    for log_file in log_files[:3]:  # Check up to 3 most recent log files
        try:
            text = log_file.read_text(errors="replace")
            for line in text.splitlines():
                for pattern in log_patterns:
                    m = pattern.search(line)
                    if m:
                        groups = m.groupdict()
                        status_raw = groups.get("status", "approved").lower().replace("auto_", "auto-")
                        if "reject" in status_raw or "denied" in status_raw:
                            status = "denied"
                        elif "approved" in status_raw:
                            status = "approved"
                        else:
                            status = status_raw

                        # Extract command from line if available
                        command = groups.get("command", "")
                        if not command:
                            # Try to extract the tool/command name from the line
                            cmd_match = re.search(r"(?:tool|command|exec)[\"':\s]+([a-zA-Z0-9_\-\s.]+)", line, re.IGNORECASE)
                            if cmd_match:
                                command = cmd_match.group(1).strip()

                        entries.append({
                            "date": groups.get("date", ""),
                            "command": command[:100] if command else "(unknown)",
                            "status": status,
                            "line": line.strip()[:300],
                        })
                        break  # Only match first pattern per line
        except Exception as e:
            logger.debug("Error reading log file %s: %s", log_file, e)
            continue

    # Sort by date descending, take last 50
    entries.sort(key=lambda x: x.get("date", ""), reverse=True)
    return {"entries": entries[:50], "total": len(entries)}
