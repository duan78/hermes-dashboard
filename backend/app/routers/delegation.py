"""Delegation monitoring endpoints."""

import os
import logging

from fastapi import APIRouter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/delegation", tags=["delegation"])


@router.get("/active")
async def get_active_subagents():
    """Check for active subagent/child processes.

    Scans /proc for processes that look like Hermes delegate/child processes.
    Returns a list of active subagent PIDs and a count.
    """
    active = []
    try:
        for pid_dir in os.listdir("/proc"):
            if not pid_dir.isdigit():
                continue
            try:
                cmdline_path = os.path.join("/proc", pid_dir, "cmdline")
                if not os.path.exists(cmdline_path):
                    continue
                with open(cmdline_path, "rb") as f:
                    cmdline = f.read().decode(errors="replace")
                # Look for delegate/child processes in the Hermes agent
                if "delegate" in cmdline.lower() and "hermes" in cmdline.lower():
                    active.append({
                        "pid": int(pid_dir),
                        "cmdline": cmdline.replace("\x00", " ").strip()[:200],
                    })
                elif "hermes" in cmdline.lower() and "child" in cmdline.lower():
                    active.append({
                        "pid": int(pid_dir),
                        "cmdline": cmdline.replace("\x00", " ").strip()[:200],
                    })
            except (PermissionError, FileNotFoundError, OSError):
                continue
    except Exception as e:
        logger.warning("Failed to scan /proc for subagents: %s", e)

    return {
        "active": active,
        "count": len(active),
    }
