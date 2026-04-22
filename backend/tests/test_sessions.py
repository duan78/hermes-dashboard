"""Tests for /api/sessions endpoints."""

import json


def test_list_sessions_empty(client, tmp_hermes):
    """GET /api/sessions returns empty list when no sessions exist."""
    resp = client.get("/api/sessions")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_sessions_returns_sessions(client, tmp_hermes):
    """GET /api/sessions returns sessions from JSON files."""
    sessions_dir = tmp_hermes / "sessions"
    session_data = {
        "session_id": "abc-123",
        "model": "gpt-4o",
        "platform": "cli",
        "created_at": "2026-01-15T10:30:00Z",
        "preview": "Hello world",
        "message_count": 2,
    }
    (sessions_dir / "session_abc-123.json").write_text(json.dumps(session_data))

    # Create matching JSONL
    jsonl_lines = [
        json.dumps({"role": "user", "content": "Hello world"}),
        json.dumps({"role": "assistant", "content": "Hi there"}),
    ]
    (sessions_dir / "abc-123.jsonl").write_text("\n".join(jsonl_lines))

    resp = client.get("/api/sessions")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == "abc-123"
    assert data[0]["model"] == "gpt-4o"
    assert data[0]["platform"] == "cli"
    assert data[0]["messages_count"] == 2


def test_list_sessions_deduplicates(client, tmp_hermes):
    """GET /api/sessions deduplicates by session_id."""
    sessions_dir = tmp_hermes / "sessions"
    for i in range(3):
        sd = {
            "session_id": "same-id",
            "model": "gpt-4o",
            "platform": "cli",
            "created_at": f"2026-01-1{i}T10:00:00Z",
            "message_count": 1,
        }
        (sessions_dir / f"session_same-id-{i}.json").write_text(json.dumps(sd))

    resp = client.get("/api/sessions")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_get_session_detail(client, tmp_hermes):
    """GET /api/sessions/{id} returns session detail with messages."""
    sessions_dir = tmp_hermes / "sessions"
    session_data = {
        "session_id": "xyz-789",
        "model": "claude-3",
        "created_at": "2026-02-01T12:00:00Z",
    }
    (sessions_dir / "session_xyz-789.json").write_text(json.dumps(session_data))

    jsonl_lines = [
        json.dumps({"role": "user", "content": "What is 2+2?"}),
        json.dumps({"role": "assistant", "content": "4"}),
    ]
    (sessions_dir / "xyz-789.jsonl").write_text("\n".join(jsonl_lines))

    resp = client.get("/api/sessions/xyz-789")
    assert resp.status_code == 200
    data = resp.json()
    assert data["session_id"] == "xyz-789"
    assert len(data["messages"]) == 2
    assert data["messages"][0]["content"] == "What is 2+2?"


def test_get_session_not_found(client, tmp_hermes):
    """GET /api/sessions/{id} returns 404 for missing session."""
    resp = client.get("/api/sessions/nonexistent")
    assert resp.status_code == 404


def test_search_sessions(client, tmp_hermes):
    """GET /api/sessions/search finds matching sessions."""
    sessions_dir = tmp_hermes / "sessions"
    session_data = {
        "session_id": "search-test",
        "model": "gpt-4o",
        "platform": "web",
        "created_at": "2026-03-01T10:00:00Z",
        "preview": "Deploy the application to production",
    }
    (sessions_dir / "session_search-test.json").write_text(json.dumps(session_data))

    resp = client.get("/api/sessions/search?q=Deploy")
    assert resp.status_code == 200
    results = resp.json()
    assert len(results) == 1
    assert results[0]["id"] == "search-test"
    assert "preview" in results[0]["matched_in"]


def test_search_sessions_no_query(client, tmp_hermes):
    """GET /api/sessions/search without q parameter returns 422."""
    resp = client.get("/api/sessions/search")
    assert resp.status_code == 422


def test_export_session(client, tmp_hermes):
    """GET /api/sessions/{id}/export returns session data."""
    sessions_dir = tmp_hermes / "sessions"
    (sessions_dir / "export-test.jsonl").write_text('{"role":"user","content":"hi"}')

    resp = client.get("/api/sessions/export-test/export")
    assert resp.status_code == 200
    data = resp.json()
    assert data["format"] == "jsonl"
    assert "hi" in data["data"]


def test_health_endpoint(client):
    """GET /api/health returns ok without auth."""
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
