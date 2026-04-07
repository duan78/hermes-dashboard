import hmac
import json
from urllib.parse import parse_qs
from starlette.responses import JSONResponse
from starlette.websockets import WebSocketClose
from .config import DASHBOARD_TOKEN


def verify_token(token: str) -> bool:
    """Verify a bearer token against the configured dashboard token."""
    if not DASHBOARD_TOKEN:
        return True  # No auth configured
    return bool(token) and hmac.compare_digest(token, DASHBOARD_TOKEN)


class AuthMiddleware:
    """Pure ASGI auth middleware.

    BaseHTTPMiddleware converts HTTPException(401) into 500 responses,
    so we use a raw ASGI middleware that returns JSONResponse directly.
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

        # Skip auth if no token configured
        if not DASHBOARD_TOKEN:
            await self.app(scope, receive, send)
            return

        # WebSocket auth for sensitive endpoints
        if scope["type"] == "websocket":
            if path == "/ws/hub":
                # Hub WebSocket handles auth via first message
                await self.app(scope, receive, send)
                return
            if path == "/ws/terminal":
                # Check token from query param (?token=...) or subprotocol header
                query_string = scope.get("query_string", b"")
                params = parse_qs(query_string.decode())
                token = params.get("token", [""])[0]

                # Also check Authorization header from WebSocket handshake
                if not token:
                    headers = dict(scope.get("headers", []))
                    auth_header = headers.get(b"authorization", b"").decode("utf-8", errors="replace")
                    if auth_header.startswith("Bearer "):
                        token = auth_header[7:]

                if not token or not hmac.compare_digest(token, DASHBOARD_TOKEN):
                    # Reject WebSocket connection with 4008 (Policy Violation)
                    close = WebSocketClose(code=4008, reason="Unauthorized")
                    await close(scope, receive, send)
                    return

            await self.app(scope, receive, send)
            return

        # Allow static files and non-API paths
        if not path.startswith("/api/"):
            await self.app(scope, receive, send)
            return

        # Check Authorization header
        headers = dict(scope.get("headers", []))
        auth_header = headers.get(b"authorization", b"").decode("utf-8", errors="replace")

        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            if hmac.compare_digest(token, DASHBOARD_TOKEN):
                await self.app(scope, receive, send)
                return

        # Return 401 JSON response directly (no HTTPException)
        response = JSONResponse(
            status_code=401,
            content={"detail": "Unauthorized"},
        )
        await response(scope, receive, send)
