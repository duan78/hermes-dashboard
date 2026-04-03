import re

from fastapi import APIRouter, Request
from ..config import HERMES_HOME
from ..utils import run_hermes

router = APIRouter(prefix="/api/auth-pairing", tags=["auth-pairing"])


def _parse_pairing_list(output: str) -> dict:
    """Parse hermes pairing list output into pending and approved."""
    pending = []
    approved = []
    section = None

    for line in output.strip().splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        lower = stripped.lower()
        if "pending" in lower and ("code" in lower or ":" in lower):
            section = "pending"
            continue
        elif "approved" in lower and ("user" in lower or ":" in lower):
            section = "approved"
            continue
        elif stripped.startswith("---") or stripped.startswith("==="):
            continue

        if section == "pending":
            parts = re.split(r"\s{2,}", stripped)
            if parts and parts[0] and parts[0][0].isalnum():
                pending.append({
                    "code": parts[0].strip(),
                    "platform": parts[1].strip() if len(parts) > 1 else "unknown",
                    "created": parts[2].strip() if len(parts) > 2 else "",
                })
        elif section == "approved":
            parts = re.split(r"\s{2,}", stripped)
            if parts and parts[0] and parts[0][0].isalnum():
                approved.append({
                    "user": parts[0].strip(),
                    "platform": parts[1].strip() if len(parts) > 1 else "unknown",
                    "approved_at": parts[2].strip() if len(parts) > 2 else "",
                })

    return {"pending": pending, "approved": approved}


@router.get("/list")
async def list_pairing():
    """List pending codes and approved users."""
    try:
        output = await run_hermes("pairing", "list", timeout=15)
        return _parse_pairing_list(output)
    except Exception as e:
        return {"pending": [], "approved": [], "error": str(e)}


@router.post("/approve")
async def approve_pairing(request: Request):
    """Approve a pending pairing code."""
    body = await request.json()
    code = body.get("code", "").strip()
    if not code:
        return {"success": False, "output": "Code is required"}
    try:
        output = await run_hermes("pairing", "approve", code, timeout=15)
        return {"success": True, "output": output}
    except Exception as e:
        return {"success": False, "output": str(e)}


@router.post("/revoke")
async def revoke_pairing(request: Request):
    """Revoke an approved user."""
    body = await request.json()
    user = body.get("user", "").strip()
    if not user:
        return {"success": False, "output": "User is required"}
    try:
        output = await run_hermes("pairing", "revoke", user, timeout=15)
        return {"success": True, "output": output}
    except Exception as e:
        return {"success": False, "output": str(e)}


@router.post("/clear-pending")
async def clear_pending():
    """Clear all pending pairing codes."""
    try:
        output = await run_hermes("pairing", "clear-pending", timeout=15)
        return {"success": True, "output": output}
    except Exception as e:
        return {"success": False, "output": str(e)}
