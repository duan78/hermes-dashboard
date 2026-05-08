import hmac
import json
import logging
from urllib.parse import parse_qs

from starlette.responses import JSONResponse
from starlette.websockets import WebSocketClose

from .config import _get_dashboard_token as _get_token

logger = logging.getLogger(__name__)


def verify_token(token: str) -> bool:
    """Verify a bearer token against the configured dashboard token."""
    if not _get_token():
        return True  # No auth configured
    return bool(token) and hmac.compare_digest(token, _get_token())


def _try_parse_jwt(token: str) -> dict | None:
    """Try to parse a JWT user token. Returns payload dict or None."""
    try:
        import jwt as pyjwt

        from .routers.users import JWT_ALGORITHM, JWT_SECRET
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except Exception as e:
        logger.warning("JWT decode failed: %s", e)
        return None


def _load_user_by_id(user_id: int) -> dict | None:
    """Load user from users.json by ID."""
    from .routers.users import USERS_FILE
    if not USERS_FILE.exists():
        return None
    try:
        with open(USERS_FILE) as f:
            data = json.load(f)
        for u in data.get("users", []):
            if u.get("id") == user_id and u.get("status") == "active":
                return u
    except (json.JSONDecodeError, OSError):
        pass
    return None


def _extract_ws_token(scope) -> str:
    """Extract token from WebSocket scope (query param or Authorization header)."""
    query_string = scope.get("query_string", b"")
    params = parse_qs(query_string.decode())
    token = params.get("token", [""])[0]

    if not token:
        headers = dict(scope.get("headers", []))
        auth_header = headers.get(b"authorization", b"").decode("utf-8", errors="replace")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

    return token


class AuthMiddleware:
    """Pure ASGI auth middleware.

    Supports two auth modes:
    1. Legacy: single shared DASHBOARD_TOKEN (bearer token)
    2. User accounts: JWT tokens from the registration/login system

    When both are available, JWT user tokens take precedence.
    When neither DASHBOARD_TOKEN nor users exist, auth is disabled.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")

        # Allow health check without auth
        if path == "/api/health":
            await self.app(scope, receive, send)
            return

        # Allow public auth endpoints without auth
        public_paths = {
            "/api/users/register",
            "/api/users/login",
            "/api/users/status",
        }
        if path in public_paths:
            await self.app(scope, receive, send)
            return

        # Allow MCP StreamableHTTP endpoint from localhost only
        if path.startswith("/api/mcp/moa"):
            client_ip = scope.get("client", ("", 0))[0]
            if client_ip in ("127.0.0.1", "::1", "localhost"):
                await self.app(scope, receive, send)
                return

        # WebSocket auth for sensitive endpoints
        if scope["type"] == "websocket":
            # Terminal WebSocket requires auth (JWT admin or legacy DASHBOARD_TOKEN)
            if path == "/ws/terminal":
                token = _extract_ws_token(scope)
                authenticated = False

                # 1. Try JWT user token first (admin/owner only)
                if token:
                    jwt_payload = _try_parse_jwt(token)
                    if jwt_payload:
                        user = _load_user_by_id(int(jwt_payload.get("sub", 0)))
                        if user and user.get("role") in ("admin", "owner"):
                            authenticated = True
                            scope.setdefault("state", {})["user"] = {
                                "id": user["id"],
                                "username": user["username"],
                                "role": user["role"],
                            }

                # 2. Fall back to legacy DASHBOARD_TOKEN
                if not authenticated and _get_token():
                    if token and hmac.compare_digest(token, _get_token()):
                        authenticated = True

                # 3. Reject if neither auth method works
                if not authenticated:
                    client_ip = scope.get("client", ("unknown", 0))[0]
                    if not _get_token() and not token:
                        logger.error(
                            "SECURITY: /ws/terminal rejected — no auth configured. "
                            "Set HERMES_DASHBOARD_TOKEN or use JWT login."
                        )
                    else:
                        logger.warning(
                            "SECURITY: /ws/terminal rejected — invalid token from %s",
                            client_ip,
                        )
                    # Reject WS before handshake is accepted — send HTTP response
                    response = JSONResponse(
                        status_code=403,
                        content={"detail": "Unauthorized: valid JWT admin token or DASHBOARD_TOKEN required"},
                    )
                    await response(scope, receive, send)
                    return

                scope["hermes_ws_authenticated"] = True
                await self.app(scope, receive, send)
                return

            if not _get_token():
                # Non-terminal WS: allow without token when none configured
                await self.app(scope, receive, send)
                return

            if path == "/ws/hub":
                # Hub WebSocket handles auth via first message
                await self.app(scope, receive, send)
                return

            await self.app(scope, receive, send)
            return

        # HTTP: extract token
        headers = dict(scope.get("headers", []))
        auth_header = headers.get(b"authorization", b"").decode("utf-8", errors="replace")
        token = ""
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

        # Try JWT user token first
        if token:
            jwt_payload = _try_parse_jwt(token)
            if jwt_payload:
                user = _load_user_by_id(int(jwt_payload.get("sub", 0)))
                if user:
                    # Store user info in scope["state"] so Starlette's
                    # request.state (backed by scope["state"]) exposes it
                    # to all downstream endpoints.
                    scope.setdefault("state", {})["user"] = {
                        "id": user["id"],
                        "username": user["username"],
                        "display_name": user.get("display_name", ""),
                        "role": user["role"],
                        "status": user["status"],
                    }
                    await self.app(scope, receive, send)
                    return

        # Fall back to legacy _get_token()
        # Skip auth if no token configured
        if not _get_token():
            await self.app(scope, receive, send)
            return

        # Allow static files and non-API paths
        if not path.startswith("/api/"):
            await self.app(scope, receive, send)
            return

        # Check legacy token
        if token and hmac.compare_digest(token, _get_token()):
            await self.app(scope, receive, send)
            return

        # Return 401 JSON response directly (no HTTPException)
        response = JSONResponse(
            status_code=401,
            content={"detail": "Unauthorized"},
        )
        await response(scope, receive, send)
