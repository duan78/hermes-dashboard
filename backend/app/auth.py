import secrets
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from .config import DASHBOARD_TOKEN


def verify_token(token: str) -> bool:
    """Check if a token matches the configured DASHBOARD_TOKEN.
    Returns True if auth is disabled (no token configured)."""
    if not DASHBOARD_TOKEN:
        return True
    return secrets.compare_digest(token, DASHBOARD_TOKEN)


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Allow health check without auth
        if request.url.path == "/api/health":
            return await call_next(request)

        # Allow static files
        if not request.url.path.startswith("/api/"):
            return await call_next(request)

        if not DASHBOARD_TOKEN:
            return await call_next(request)

        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]  # Strip "Bearer "
            if verify_token(token):
                return await call_next(request)

        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
