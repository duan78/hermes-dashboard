from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from .config import DASHBOARD_TOKEN


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
            if token == DASHBOARD_TOKEN:
                return await call_next(request)

        raise HTTPException(status_code=401, detail="Unauthorized")
