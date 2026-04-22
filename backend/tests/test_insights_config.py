"""Tests for /api/insights and /api/config endpoints."""

import json
from unittest.mock import AsyncMock, patch

import yaml


# ── Insights ──


def test_insights_returns_structure(client, tmp_hermes):
    """GET /api/insights returns expected top-level keys."""
    with patch("app.routers.insights.run_hermes", new_callable=AsyncMock, side_effect=RuntimeError("no hermes")):
        resp = client.get("/api/insights")
    assert resp.status_code == 200
    data = resp.json()
    for key in ("period", "overview", "models", "platforms", "tools", "activity", "notable"):
        assert key in data, f"Missing key: {key}"


def test_insights_includes_enriched_metrics(client, tmp_hermes):
    """GET /api/insights includes session-enriched metrics."""
    with patch("app.routers.insights.run_hermes", new_callable=AsyncMock, side_effect=RuntimeError("no hermes")):
        resp = client.get("/api/insights")
    assert resp.status_code == 200
    data = resp.json()
    assert "hourly_activity" in data
    assert "top_skills" in data
    assert "avg_response_seconds" in data
    assert len(data["hourly_activity"]) == 24


def test_insights_with_sessions(client, tmp_hermes):
    """GET /api/insights counts sessions from session files."""
    sessions_dir = tmp_hermes / "sessions"
    for i in range(3):
        sd = {
            "session_id": f"ins-{i}",
            "model": "gpt-4o",
            "platform": "cli",
            "created_at": "2026-04-20T10:00:00Z",
            "message_count": 5,
        }
        (sessions_dir / f"session_ins-{i}.json").write_text(json.dumps(sd))

    with patch("app.routers.insights.run_hermes", new_callable=AsyncMock, side_effect=RuntimeError("no hermes")):
        resp = client.get("/api/insights")
    assert resp.status_code == 200
    data = resp.json()
    # hourly_activity should have activity at hour 10
    assert data["hourly_activity"][10] == 3


# ── Config ──


def test_get_config_not_found(client, tmp_hermes):
    """GET /api/config returns 404 when config.yaml is absent."""
    resp = client.get("/api/config")
    assert resp.status_code == 404


def test_get_config(client, tmp_hermes):
    """GET /api/config returns config with masked secrets."""
    config = {
        "model": {"default": "gpt-4o", "api_key": "sk-secret123"},
        "agent": {"max_turns": 50},
    }
    (tmp_hermes / "config.yaml").write_text(yaml.dump(config))

    resp = client.get("/api/config")
    assert resp.status_code == 200
    data = resp.json()
    assert "config" in data
    # api_key should be masked
    assert data["config"]["model"]["api_key"] != "sk-secret123"


def test_save_config(client, tmp_hermes):
    """PUT /api/config saves raw YAML."""
    (tmp_hermes / "config.yaml").write_text("model:\n  default: gpt-4o\n")

    resp = client.put("/api/config", json={"yaml": "model:\n  default: claude-3"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "saved"

    saved = yaml.safe_load((tmp_hermes / "config.yaml").read_text())
    assert saved["model"]["default"] == "claude-3"


def test_save_config_invalid_yaml(client, tmp_hermes):
    """PUT /api/config rejects invalid YAML."""
    (tmp_hermes / "config.yaml").write_text("model:\n  default: gpt-4o\n")

    resp = client.put("/api/config", json={"yaml": "{{invalid yaml"})
    assert resp.status_code == 400


def test_get_config_sections(client, tmp_hermes):
    """GET /api/config/sections returns config broken into sections."""
    config = {"model": {"default": "gpt-4o"}, "agent": {"max_turns": 50}}
    (tmp_hermes / "config.yaml").write_text(yaml.dump(config))

    resp = client.get("/api/config/sections")
    assert resp.status_code == 200
    data = resp.json()
    assert "model" in data
    assert "agent" in data


# ── MOA Config ──


def test_get_moa_config_default(client, tmp_hermes):
    """GET /api/config/moa returns defaults when no moa section."""
    (tmp_hermes / "config.yaml").write_text("model:\n  default: gpt-4o\n")

    resp = client.get("/api/config/moa")
    assert resp.status_code == 200
    data = resp.json()
    assert "reference_models" in data
    assert "aggregator_model" in data
    assert isinstance(data["reference_models"], list)


def test_get_moa_config_custom(client, tmp_hermes):
    """GET /api/config/moa returns custom moa config."""
    config = {
        "model": {"default": "gpt-4o"},
        "moa": {
            "reference_models": ["model-a", "model-b"],
            "aggregator_model": "model-aggr",
            "aggregator_provider": "ollama_cloud",
        },
    }
    (tmp_hermes / "config.yaml").write_text(yaml.dump(config))

    resp = client.get("/api/config/moa")
    assert resp.status_code == 200
    data = resp.json()
    assert data["reference_models"] == ["model-a", "model-b"]
    assert data["aggregator_model"] == "model-aggr"


def test_save_moa_config(client, tmp_hermes):
    """PUT /api/config/moa saves moa configuration."""
    (tmp_hermes / "config.yaml").write_text("model:\n  default: gpt-4o\n")

    resp = client.put("/api/config/moa", json={
        "reference_models": ["m1", "m2"],
        "aggregator_model": "m-agg",
        "aggregator_provider": "ollama_cloud",
        "reference_temperature": 0.5,
        "aggregator_temperature": 0.2,
    })
    assert resp.status_code == 200
    assert resp.json()["status"] == "saved"

    saved = yaml.safe_load((tmp_hermes / "config.yaml").read_text())
    assert saved["moa"]["reference_models"] == ["m1", "m2"]


def test_save_moa_config_invalid_provider(client, tmp_hermes):
    """PUT /api/config/moa rejects invalid aggregator_provider."""
    (tmp_hermes / "config.yaml").write_text("model:\n  default: gpt-4o\n")

    resp = client.put("/api/config/moa", json={
        "aggregator_provider": "invalid_provider",
    })
    assert resp.status_code == 400


# ── Auth tests ──


def test_unauthorized_with_token(authed_client, tmp_hermes):
    """Requests without token are rejected when DASHBOARD_TOKEN is set."""
    resp = authed_client.get("/api/backlog")
    assert resp.status_code == 401


def test_authorized_with_token(authed_client, tmp_hermes):
    """Requests with valid token succeed."""
    headers = {"Authorization": f"Bearer {authed_client.test_token}"}
    resp = authed_client.get("/api/backlog", headers=headers)
    assert resp.status_code == 200


def test_health_no_auth_needed(authed_client):
    """GET /api/health works without token even when auth is configured."""
    resp = authed_client.get("/api/health")
    assert resp.status_code == 200
