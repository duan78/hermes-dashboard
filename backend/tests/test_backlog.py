"""Tests for /api/backlog endpoints."""

import json


def _seed_backlog(backlog_file, items=None):
    """Write a backlog file with optional seed items."""
    data = {"version": 1, "created": "2026-01-01", "items": items or []}
    backlog_file.write_text(json.dumps(data))


def test_list_backlog_empty(client, tmp_hermes):
    """GET /api/backlog returns empty list when no items."""
    resp = client.get("/api/backlog")
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0


def test_list_backlog_with_items(client, tmp_hermes):
    """GET /api/backlog returns stored items."""
    backlog_file = tmp_hermes / "backlog.json"
    _seed_backlog(backlog_file, [
        {"id": "task-1", "title": "First task", "status": "pending", "category": "dashboard", "priority": "haute"},
        {"id": "task-2", "title": "Second task", "status": "done", "category": "devops", "priority": "normale"},
    ])

    resp = client.get("/api/backlog")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert data["items"][0]["id"] == "task-1"


def test_list_backlog_filter_by_status(client, tmp_hermes):
    """GET /api/backlog?status=done filters items."""
    backlog_file = tmp_hermes / "backlog.json"
    _seed_backlog(backlog_file, [
        {"id": "task-1", "title": "First", "status": "pending"},
        {"id": "task-2", "title": "Second", "status": "done"},
        {"id": "task-3", "title": "Third", "status": "done"},
    ])

    resp = client.get("/api/backlog?status=done")
    assert resp.status_code == 200
    assert resp.json()["total"] == 2


def test_list_backlog_filter_by_category(client, tmp_hermes):
    """GET /api/backlog?category=dashboard filters items."""
    backlog_file = tmp_hermes / "backlog.json"
    _seed_backlog(backlog_file, [
        {"id": "task-1", "title": "A", "status": "pending", "category": "dashboard"},
        {"id": "task-2", "title": "B", "status": "pending", "category": "devops"},
    ])

    resp = client.get("/api/backlog?category=dashboard")
    assert resp.status_code == 200
    assert resp.json()["total"] == 1


def test_create_backlog_item(client, tmp_hermes):
    """POST /api/backlog creates a new item."""
    resp = client.post("/api/backlog", json={
        "title": "Add authentication to API",
        "description": "Implement JWT auth for all endpoints",
        "category": "dashboard",
        "priority": "haute",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "add-authentication-to-api"
    assert data["title"] == "Add authentication to API"
    assert data["status"] == "pending"

    # Verify persisted
    backlog = json.loads((tmp_hermes / "backlog.json").read_text())
    assert len(backlog["items"]) == 1


def test_create_backlog_item_duplicate_id(client, tmp_hermes):
    """POST /api/backlog generates unique ID on collision."""
    backlog_file = tmp_hermes / "backlog.json"
    _seed_backlog(backlog_file, [
        {"id": "test-item", "title": "Test item", "status": "pending"},
    ])

    resp = client.post("/api/backlog", json={
        "title": "Test item",
        "description": "Another one",
    })
    assert resp.status_code == 200
    assert resp.json()["id"] == "test-item-2"


def test_update_backlog_item(client, tmp_hermes):
    """PUT /api/backlog/{id} updates fields."""
    backlog_file = tmp_hermes / "backlog.json"
    _seed_backlog(backlog_file, [
        {"id": "task-1", "title": "Original", "status": "pending", "description": "old"},
    ])

    resp = client.put("/api/backlog/task-1", json={
        "title": "Updated title",
        "description": "new desc",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Updated title"
    assert data["description"] == "new desc"


def test_update_backlog_item_not_found(client, tmp_hermes):
    """PUT /api/backlog/{id} returns 404 for missing item."""
    resp = client.put("/api/backlog/nonexistent", json={"title": "X"})
    assert resp.status_code == 404


def test_delete_backlog_item(client, tmp_hermes):
    """DELETE /api/backlog/{id} removes an item."""
    backlog_file = tmp_hermes / "backlog.json"
    _seed_backlog(backlog_file, [
        {"id": "task-1", "title": "To delete", "status": "pending"},
        {"id": "task-2", "title": "Keep", "status": "pending"},
    ])

    resp = client.delete("/api/backlog/task-1")
    assert resp.status_code == 200
    assert resp.json()["status"] == "deleted"

    # Verify item removed
    backlog = json.loads(backlog_file.read_text())
    assert len(backlog["items"]) == 1
    assert backlog["items"][0]["id"] == "task-2"


def test_delete_backlog_item_not_found(client, tmp_hermes):
    """DELETE /api/backlog/{id} returns 404 for missing item."""
    resp = client.delete("/api/backlog/nonexistent")
    assert resp.status_code == 404


def test_patch_backlog_status(client, tmp_hermes):
    """PATCH /api/backlog/{id}/status changes item status."""
    backlog_file = tmp_hermes / "backlog.json"
    _seed_backlog(backlog_file, [
        {"id": "task-1", "title": "Work", "status": "pending", "done_date": None},
    ])

    resp = client.patch("/api/backlog/task-1/status", json={"status": "done"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "done"
    assert data["done_date"] is not None


def test_patch_backlog_status_not_found(client, tmp_hermes):
    """PATCH /api/backlog/{id}/status returns 404 for missing item."""
    resp = client.patch("/api/backlog/nonexistent/status", json={"status": "done"})
    assert resp.status_code == 404


def test_backlog_stats(client, tmp_hermes):
    """GET /api/backlog/stats returns aggregate statistics."""
    backlog_file = tmp_hermes / "backlog.json"
    _seed_backlog(backlog_file, [
        {"id": "t1", "title": "A", "status": "pending", "category": "dashboard"},
        {"id": "t2", "title": "B", "status": "done", "category": "dashboard"},
        {"id": "t3", "title": "C", "status": "pending", "category": "devops"},
    ])

    resp = client.get("/api/backlog/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    assert data["by_status"]["pending"] == 2
    assert data["by_status"]["done"] == 1
    assert data["by_category"]["dashboard"] == 2
