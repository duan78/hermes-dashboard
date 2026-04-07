import json
from starlette.responses import JSONResponse
from .config import DASHBOARD_TOKEN


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

        # Allow static files and non-API paths
        if not path.startswith("/api/"):
            await self.app(scope, receive, send)
            return

        # Skip auth if no token configured
        if not DASHBOARD_TOKEN:
            await self.app(scope, receive, send)
            return

        # Check Authorization header
        headers = dict(scope.get("headers", []))
        auth_header = headers.get(b"authorization", b"").decode("utf-8", errors="replace")

        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            if token == DASHBOARD_TOKEN:
                await self.app(scope, receive, send)
                return

        # Return 401 JSON response directly (no HTTPException)
        response = JSONResponse(
            status_code=401,
            content={"detail": "Unauthorized"},
        )
        await response(scope, receive, send)
