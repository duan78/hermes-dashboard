from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .auth import AuthMiddleware
from .config import HOST, PORT, HERMES_HOME
from .routers import (
    overview,
    config,
    sessions,
    memory,
    tools,
    skills,
    cron,
    models,
    platforms,
    insights,
)

app = FastAPI(
    title="Hermes Dashboard",
    description="Web dashboard for Hermes Agent administration",
    version="0.1.0",
)

# CORS for frontend dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", f"http://127.0.0.1:{PORT}"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth
app.add_middleware(AuthMiddleware)

# Security headers
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "connect-src 'self' http://127.0.0.1:*;"
    )
    return response


# Health check
@app.get("/api/health")
async def health():
    return {"status": "ok", "hermes_home": str(HERMES_HOME)}


# Register routers
app.include_router(overview.router)
app.include_router(config.router)
app.include_router(sessions.router)
app.include_router(memory.router)
app.include_router(tools.router)
app.include_router(skills.router)
app.include_router(cron.router)
app.include_router(models.router)
app.include_router(platforms.router)
app.include_router(insights.router)

# Serve frontend static files in production
static_dir = Path(__file__).parent.parent / "static"
if static_dir.exists():
    # Mount assets directory
    assets_dir = static_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    # Serve index.html for SPA fallback
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = static_dir / full_path
        if full_path and file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(static_dir / "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
