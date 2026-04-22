"""Approval history endpoints."""
import re

from fastapi import APIRouter

from ..config import HERMES_HOME

router = APIRouter(prefix="/api/approvals", tags=["approvals"])


@router.get("/history")
async def approval_history():
    """Read recent approval events from Hermes logs."""
    entries = []
    log_dir = HERMES_HOME / "logs"
    if log_dir.exists():
        for log_file in sorted(log_dir.glob("*.log"), reverse=True):
            try:
                for line in reversed(log_file.read_text(errors="replace").splitlines()):
                    if any(kw in line.lower() for kw in ["approval", "approved", "denied", "auto-approve"]):
                        ts = re.match(r"(\d{4}[-/]\d{2}[-/]\d{2}[\sT]\d{2}:\d{2}:\d{2})", line)
                        cmd = re.search(r"command[:\s]+[`'\"]?([^`'\"\s]+)", line)
                        entries.append({
                            "date": ts.group(1) if ts else "",
                            "command": cmd.group(1) if cmd else "",
                            "status": "approved" if "approved" in line.lower() or "auto" in line.lower() else "denied",
                            "raw": line[:300],
                        })
                        if len(entries) >= 50:
                            break
                if len(entries) >= 50:
                    break
            except OSError:
                pass
    return {"entries": entries, "total": len(entries)}
