"""Shared test fixtures for hermes-dashboard API tests."""

import os
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient


def _start_patches(tmp_hermes: Path, token: str = ""):
    """Start all patches and return them for cleanup."""
    patches = [
        # Source of truth
        patch("app.config.HERMES_HOME", tmp_hermes),
        patch("app.config._get_dashboard_token", lambda: token),
        patch("app.auth._get_token", lambda: token),
        # utils
        patch("app.utils.HERMES_HOME", tmp_hermes),
        # Memory router module-level state
        patch("app.routers.memory.HERMES_HOME", tmp_hermes),
        patch("app.routers.memory._HERMES_ROOT", tmp_hermes),
        patch("app.routers.memory._MEMORY_CLAW_DB_PATH", str(tmp_hermes / "memory.lance")),
        # Config router
        patch("app.routers.config.HERMES_HOME", tmp_hermes),
        # Backlog: file path
        patch("app.routers.backlog.BACKLOG_FILE", tmp_hermes / "backlog.json"),
    ]
    for p in patches:
        p.start()
    return patches


def _stop_patches(patches):
    """Stop all patches in reverse order."""
    for p in reversed(patches):
        p.stop()


@pytest.fixture(autouse=True)
def _reset_memory_globals():
    """Reset memory router module-level globals between tests."""
    from app.routers import memory
    memory._claw_store = None
    memory._claw_embedder = None
    memory._claw_error = None
    yield
    memory._claw_store = None
    memory._claw_embedder = None
    memory._claw_error = None


@pytest.fixture(autouse=True)
def _reset_insights_cache():
    """Clear insights cache between tests."""
    from app.routers import insights
    insights._insights_cache.clear()
    yield
    insights._insights_cache.clear()


@pytest.fixture()
def tmp_hermes(tmp_path):
    """Create a temporary HERMES_HOME with standard subdirectories."""
    for d in ("sessions", "memories", "memory", "skills", "logs", "cron"):
        (tmp_path / d).mkdir()
    return tmp_path


@pytest.fixture()
def client(tmp_hermes):
    """FastAPI TestClient with isolated HERMES_HOME. Auth disabled (no token)."""
    patches = _start_patches(tmp_hermes, token="")
    from app.main import app
    with TestClient(app) as c:
        yield c
    _stop_patches(patches)


@pytest.fixture()
def authed_client(tmp_hermes):
    """TestClient with HERMES_DASHBOARD_TOKEN enabled."""
    token = "test-dashboard-token-12345"
    patches = _start_patches(tmp_hermes, token=token)
    from app.main import app
    with TestClient(app) as c:
        c.test_token = token
        yield c
    _stop_patches(patches)
