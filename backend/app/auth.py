import hmac
import json
import logging
import os
from urllib.parse import parse_qs
from starlette.responses import JSONResponse
from starlette.websockets import WebSocketClose
from .config import DASHBOARD_TOKEN

logger = logging.getLogger(__name__)


def verify_token(token: str) -> bool:
    """Verify a bearer token against the configured dashboard token."""
    if not DASHBOARD_TOKEN:
        return True  # No auth configured
    return bool(token) and hmac.compare_digest(token, DASHBOARD_TOKEN)


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

        # WebSocket auth for sensitive endpoints
        if scope["type"] == "websocket":
            # Terminal WebSocket REQUIRES token even when DASHBOARD_TOKEN is empty
            # This forces explicit token setup before exposing a root shell
            if path == "/ws/terminal":
                token = _extract_ws_token(scope)

                if not DASHBOARD_TOKEN:
                    logger.error(
                        "SECURITY: /ws/terminal connection rejected — "
                        "HERMES_DASHBOARD_TOKEN not configured. "
                        "A root shell endpoint CANNOT run without auth."
                    )
                    close = WebSocketClose(code=4008, reason="Server misconfigured: no auth token")
                    await close(scope, receive, send)
                    return

                if not token or not hmac.compare_digest(token, DASHBOARD_TOKEN):
                    client_ip = scope.get("client", ("unknown", 0))[0]
                    logger.warning(
                        "SECURITY: /ws/terminal rejected — invalid token from %s",
                        client_ip,
                    )
                    close = WebSocketClose(code=4008, reason="Unauthorized")
                    await close(scope, receive, send)
                    return

                # Store validated token in scope for downstream re-auth
                scope["hermes_ws_authenticated"] = True
                await self.app(scope, receive, send)
                return

            if not DASHBOARD_TOKEN:
                # Non-terminal WS: allow without token when none configured
                await self.app(scope, receive, send)
                return

            if path == "/ws/hub":
                # Hub WebSocket handles auth via first message
                await self.app(scope, receive, send)
                return

            await self.app(scope, receive, send)
            return

        # HTTP: skip auth if no token configured
        if not DASHBOARD_TOKEN:
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
