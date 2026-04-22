"""Delegation monitoring endpoints."""
import os

from fastapi import APIRouter

router = APIRouter(prefix="/api/delegation", tags=["delegation"])


@router.get("/active")
async def active_delegations():
    """Check for active subagent/delegation processes."""
    active = []
    try:
        for pid_dir in os.listdir("/proc"):
            if not pid_dir.isdigit():
                continue
            try:
                cmdline = open(f"/proc/{pid_dir}/cmdline", "rb").read().decode(errors="replace")
                if "delegate" in cmdline.lower() or "subagent" in cmdline.lower():
                    active.append({"pid": int(pid_dir), "command": cmdline.replace("\x00", " ")[:200]})
            except (OSError, PermissionError):
                pass
    except OSError:
        pass
    return {"active": active, "count": len(active)}
