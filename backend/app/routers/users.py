"""User management with admin-approval registration flow.

Users are stored in ~/.hermes/dashboard_users.json.
- First user to register is automatically approved as admin.
- Subsequent users start with status='pending' and role='viewer'.
- An admin must approve them before they can log in.
"""

import fcntl
import json
import logging
import os
import secrets
import tempfile
from datetime import UTC, datetime

import bcrypt
import jwt
from fastapi import APIRouter, Request

from ..config import DASHBOARD_TOKEN, HERMES_HOME

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/users", tags=["users"])

USERS_FILE = HERMES_HOME / "dashboard_users.json"

# JWT config
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_SECONDS = 86400 * 7  # 7 days


def _get_jwt_secret() -> str:
    """Derive JWT secret from dashboard token or generate one."""
    if DASHBOARD_TOKEN:
        return DASHBOARD_TOKEN + "__jwt_suffix"
    # Fallback: read or create a random secret
    secret_path = HERMES_HOME / ".dashboard_jwt_secret"
    if secret_path.exists():
        return secret_path.read_text().strip()
    secret = secrets.token_urlsafe(48)
    secret_path.write_text(secret)
    secret_path.chmod(0o600)
    return secret


JWT_SECRET = _get_jwt_secret()


# ── File I/O with locking ──

def _read_users() -> dict:
    """Read users file. Returns {"users": [...], "next_id": N}."""
    if not USERS_FILE.exists():
        return {"users": [], "next_id": 1}
    try:
        f = open(USERS_FILE)
        fcntl.flock(f, fcntl.LOCK_SH)
        data = json.load(f)
        fcntl.flock(f, fcntl.LOCK_UN)
        f.close()
        return data
    except (json.JSONDecodeError, OSError):
        return {"users": [], "next_id": 1}


def _write_users(data: dict):
    """Atomic write of users file with locking."""
    USERS_FILE.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(
        dir=str(USERS_FILE.parent), suffix=".tmp", prefix=".users_"
    )
    try:
        with os.fdopen(fd, "w") as f:
            fcntl.flock(f, fcntl.LOCK_EX)
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, USERS_FILE)
    except BaseException:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
    try:
        USERS_FILE.chmod(0o600)
    except OSError:
        pass


def _find_user(data: dict, **filters) -> dict | None:
    """Find first user matching all filters."""
    for u in data["users"]:
        if all(u.get(k) == v for k, v in filters.items()):
            return u
    return None


def _create_token(user: dict) -> str:
    """Generate a JWT for the given user."""
    payload = {
        "sub": str(user["id"]),
        "username": user["username"],
        "role": user["role"],
        "iat": int(datetime.now(UTC).timestamp()),
        "exp": int(datetime.now(UTC).timestamp()) + JWT_EXPIRY_SECONDS,
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _user_response(user: dict) -> dict:
    """Sanitize user dict for API responses (remove password hash)."""
    return {
        "id": user["id"],
        "username": user["username"],
        "display_name": user.get("display_name", ""),
        "role": user["role"],
        "status": user["status"],
        "created_at": user.get("created_at", ""),
        "approved_at": user.get("approved_at", ""),
        "approved_by": user.get("approved_by", ""),
    }


# ── Endpoints ──

@router.post("/register")
async def register(request: Request):
    """Register a new user account.

    - First user is auto-approved as admin.
    - Subsequent users need admin approval.
    """
    body = await request.json()
    username = (body.get("username") or "").strip()
    password = body.get("password", "")
    display_name = (body.get("display_name") or "").strip()

    # Validate
    if not username or len(username) < 3 or len(username) > 50:
        return {"success": False, "error": "Username must be 3-50 characters"}
    if not username.replace("-", "").replace("_", "").isalnum():
        return {"success": False, "error": "Username: only letters, digits, - and _"}
    if len(password) < 8:
        return {"success": False, "error": "Password must be at least 8 characters"}

    data = _read_users()

    # Check uniqueness
    if _find_user(data, username=username):
        return {"success": False, "error": "Username already taken"}

    is_first = len(data["users"]) == 0
    user_id = data["next_id"]
    now = datetime.now(UTC).isoformat()

    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(12)).decode("utf-8")

    user = {
        "id": user_id,
        "username": username,
        "display_name": display_name or username,
        "password_hash": password_hash,
        "role": "admin" if is_first else "viewer",
        "status": "active" if is_first else "pending",
        "created_at": now,
        "approved_at": now if is_first else "",
        "approved_by": "system" if is_first else "",
    }

    data["users"].append(user)
    data["next_id"] = user_id + 1
    _write_users(data)

    logger.info("User registered: %s (id=%d, role=%s, status=%s, first=%s)",
                username, user_id, user["role"], user["status"], is_first)

    # Auto-login for first user
    if is_first:
        token = _create_token(user)
        return {
            "success": True,
            "auto_approved": True,
            "user": _user_response(user),
            "token": token,
        }

    return {
        "success": True,
        "auto_approved": False,
        "message": "Account created. An admin must approve your registration before you can log in.",
    }


@router.post("/login")
async def login(request: Request):
    """Authenticate a user and return a JWT."""
    body = await request.json()
    username = (body.get("username") or "").strip()
    password = body.get("password", "")

    if not username or not password:
        return {"success": False, "error": "Username and password required"}

    data = _read_users()
    user = _find_user(data, username=username)

    if not user:
        return {"success": False, "error": "Invalid credentials"}

    if user["status"] == "pending":
        return {"success": False, "error": "Your account is pending admin approval"}
    if user["status"] == "rejected":
        return {"success": False, "error": "Your account has been rejected"}
    if user["status"] != "active":
        return {"success": False, "error": "Account is not active"}

    if not bcrypt.checkpw(password.encode("utf-8"), user["password_hash"].encode("utf-8")):
        return {"success": False, "error": "Invalid credentials"}

    token = _create_token(user)
    logger.info("User logged in: %s (id=%d, role=%s)", username, user["id"], user["role"])

    return {
        "success": True,
        "token": token,
        "user": _user_response(user),
    }


@router.get("/me")
async def get_current_user(request: Request):
    """Return current authenticated user info."""
    user = getattr(request.state, "user", None)
    if not user:
        # Check for legacy token auth
        if DASHBOARD_TOKEN:
            return {
                "authenticated": True,
                "mode": "legacy_token",
                "role": "admin",
                "user": None,
            }
        return {"authenticated": False}
    return {
        "authenticated": True,
        "mode": "user",
        "role": user.get("role", "viewer"),
        "user": _user_response(user),
    }


@router.get("/list")
async def list_users(request: Request):
    """List all users. Admin only."""
    user = getattr(request.state, "user", None)
    if not user or user.get("role") != "admin":
        return {"success": False, "error": "Admin access required"}

    data = _read_users()
    return {
        "success": True,
        "users": [_user_response(u) for u in data["users"]],
    }


@router.post("/approve")
async def approve_user(request: Request):
    """Approve a pending user. Admin only."""
    user = getattr(request.state, "user", None)
    if not user or user.get("role") != "admin":
        return {"success": False, "error": "Admin access required"}

    body = await request.json()
    user_id = body.get("user_id")
    if not user_id:
        return {"success": False, "error": "user_id required"}

    data = _read_users()
    target = _find_user(data, id=int(user_id))
    if not target:
        return {"success": False, "error": "User not found"}
    if target["status"] != "pending":
        return {"success": False, "error": f"User status is '{target['status']}', not 'pending'"}

    now = datetime.now(UTC).isoformat()
    target["status"] = "active"
    target["approved_at"] = now
    target["approved_by"] = user.get("username", "admin")
    _write_users(data)

    logger.info("User approved: %s (id=%d) by %s", target["username"], target["id"], user.get("username"))
    return {"success": True, "user": _user_response(target)}


@router.post("/reject")
async def reject_user(request: Request):
    """Reject a pending user. Admin only."""
    user = getattr(request.state, "user", None)
    if not user or user.get("role") != "admin":
        return {"success": False, "error": "Admin access required"}

    body = await request.json()
    user_id = body.get("user_id")
    if not user_id:
        return {"success": False, "error": "user_id required"}

    data = _read_users()
    target = _find_user(data, id=int(user_id))
    if not target:
        return {"success": False, "error": "User not found"}
    if target["status"] != "pending":
        return {"success": False, "error": f"User status is '{target['status']}', not 'pending'"}

    target["status"] = "rejected"
    _write_users(data)

    logger.info("User rejected: %s (id=%d) by %s", target["username"], target["id"], user.get("username"))
    return {"success": True, "user": _user_response(target)}


@router.post("/role")
async def change_role(request: Request):
    """Change a user's role. Admin only."""
    user = getattr(request.state, "user", None)
    if not user or user.get("role") != "admin":
        return {"success": False, "error": "Admin access required"}

    body = await request.json()
    user_id = body.get("user_id")
    new_role = body.get("role")
    if not user_id or not new_role:
        return {"success": False, "error": "user_id and role required"}
    if new_role not in ("admin", "viewer"):
        return {"success": False, "error": "Role must be 'admin' or 'viewer'"}

    data = _read_users()
    target = _find_user(data, id=int(user_id))
    if not target:
        return {"success": False, "error": "User not found"}
    if target["id"] == user.get("id"):
        return {"success": False, "error": "Cannot change your own role"}

    target["role"] = new_role
    _write_users(data)

    logger.info("User role changed: %s -> %s by %s", target["username"], new_role, user.get("username"))
    return {"success": True, "user": _user_response(target)}


@router.post("/delete")
async def delete_user(request: Request):
    """Delete a user. Admin only."""
    user = getattr(request.state, "user", None)
    if not user or user.get("role") != "admin":
        return {"success": False, "error": "Admin access required"}

    body = await request.json()
    user_id = body.get("user_id")
    if not user_id:
        return {"success": False, "error": "user_id required"}

    data = _read_users()
    target = _find_user(data, id=int(user_id))
    if not target:
        return {"success": False, "error": "User not found"}
    if target["id"] == user.get("id"):
        return {"success": False, "error": "Cannot delete your own account"}

    data["users"] = [u for u in data["users"] if u["id"] != int(user_id)]
    _write_users(data)

    logger.info("User deleted: %s (id=%d) by %s", target["username"], target["id"], user.get("username"))
    return {"success": True}


@router.get("/status")
async def registration_status():
    """Return whether registration is open and user counts."""
    data = _read_users()
    users = data.get("users", [])
    return {
        "total_users": len(users),
        "pending_count": sum(1 for u in users if u["status"] == "pending"),
        "active_count": sum(1 for u in users if u["status"] == "active"),
        "has_admin": any(u["role"] == "admin" for u in users),
    }
