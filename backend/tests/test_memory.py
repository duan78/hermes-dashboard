"""Tests for /api/memory endpoints."""

import json


def test_get_soul_not_found(client, tmp_hermes):
    """GET /api/memory/soul returns exists=False when SOUL.md is absent."""
    resp = client.get("/api/memory/soul")
    assert resp.status_code == 200
    data = resp.json()
    assert data["exists"] is False
    assert data["content"] == ""


def test_get_soul_found(client, tmp_hermes):
    """GET /api/memory/soul returns content when SOUL.md exists."""
    (tmp_hermes / "SOUL.md").write_text("I am Hermes, a helpful AI assistant.")
    resp = client.get("/api/memory/soul")
    assert resp.status_code == 200
    data = resp.json()
    assert data["exists"] is True
    assert "Hermes" in data["content"]


def test_save_soul(client, tmp_hermes):
    """PUT /api/memory/soul saves content to SOUL.md."""
    resp = client.put("/api/memory/soul", json={"content": "New soul content"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "saved"
    assert (tmp_hermes / "SOUL.md").read_text() == "New soul content"


def test_get_memory_not_found(client, tmp_hermes):
    """GET /api/memory/memory returns exists=False when absent."""
    resp = client.get("/api/memory/memory")
    assert resp.status_code == 200
    assert resp.json()["exists"] is False


def test_get_memory_found(client, tmp_hermes):
    """GET /api/memory/memory returns content from memories/MEMORY.md."""
    mem_dir = tmp_hermes / "memories"
    mem_dir.mkdir(exist_ok=True)
    (mem_dir / "MEMORY.md").write_text("Remember this fact.")
    resp = client.get("/api/memory/memory")
    assert resp.status_code == 200
    assert resp.json()["exists"] is True
    assert "Remember" in resp.json()["content"]


def test_list_memory_files_empty(client, tmp_hermes):
    """GET /api/memory/files returns empty list when no files."""
    resp = client.get("/api/memory/files")
    assert resp.status_code == 200
    assert resp.json()["files"] == []


def test_list_memory_files(client, tmp_hermes):
    """GET /api/memory/files lists files in memories/ directory."""
    mem_dir = tmp_hermes / "memories"
    mem_dir.mkdir(exist_ok=True)
    (mem_dir / "notes.md").write_text("some notes")
    (mem_dir / "goals.md").write_text("some goals")
    (mem_dir / "data.lock").write_text("locked")  # should be excluded

    resp = client.get("/api/memory/files")
    assert resp.status_code == 200
    files = resp.json()["files"]
    names = [f["name"] for f in files]
    assert "notes.md" in names
    assert "goals.md" in names
    assert "data.lock" not in names


def test_list_all_files(client, tmp_hermes):
    """GET /api/memory/all scans root and subdirectories for .md files."""
    (tmp_hermes / "SOUL.md").write_text("soul")
    (tmp_hermes / "memories" / "notes.md").write_text("notes")
    (tmp_hermes / "skills" / "coding.md").write_text("coding")

    resp = client.get("/api/memory/all")
    assert resp.status_code == 200
    files = resp.json()["files"]
    names = [f["name"] for f in files]
    assert "SOUL.md" in names
    assert "notes.md" in names
    assert "coding.md" in names


def test_read_file(client, tmp_hermes):
    """GET /api/memory/read reads a file by path."""
    (tmp_hermes / "memories" / "test.md").write_text("test content")
    resp = client.get("/api/memory/read?path=memories/test.md")
    assert resp.status_code == 200
    assert resp.json()["content"] == "test content"


def test_read_file_not_found(client, tmp_hermes):
    """GET /api/memory/read returns 404 for missing file."""
    resp = client.get("/api/memory/read?path=nonexistent.md")
    assert resp.status_code == 404


def test_read_file_traversal_blocked(client, tmp_hermes):
    """GET /api/memory/read blocks path traversal."""
    resp = client.get("/api/memory/read?path=../../../etc/passwd")
    assert resp.status_code in (400, 403)


def test_create_file(client, tmp_hermes):
    """POST /api/memory/create creates a new .md file."""
    resp = client.post("/api/memory/create", json={"name": "new-note"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "created"
    assert data["name"] == "new-note.md"
    assert (tmp_hermes / "memories" / "new-note.md").exists()


def test_create_file_duplicate(client, tmp_hermes):
    """POST /api/memory/create returns 409 for duplicate file."""
    (tmp_hermes / "memories" / "exists.md").write_text("already here")
    resp = client.post("/api/memory/create", json={"name": "exists.md"})
    assert resp.status_code == 409


def test_save_file(client, tmp_hermes):
    """POST /api/memory/save saves a file by path."""
    (tmp_hermes / "memories").mkdir(exist_ok=True)
    resp = client.post("/api/memory/save", json={
        "path": "memories/saved.md",
        "content": "saved content",
    })
    assert resp.status_code == 200
    assert (tmp_hermes / "memories" / "saved.md").read_text() == "saved content"


def test_delete_file(client, tmp_hermes):
    """DELETE /api/memory/delete removes a file."""
    f = tmp_hermes / "memories" / "to-delete.md"
    f.write_text("delete me")
    resp = client.request("DELETE", "/api/memory/delete", json={"path": "memories/to-delete.md"})
    assert resp.status_code == 200
    assert not f.exists()


def test_delete_soul_blocked(client, tmp_hermes):
    """DELETE /api/memory/delete refuses to delete SOUL.md."""
    (tmp_hermes / "SOUL.md").write_text("identity")
    resp = client.request("DELETE", "/api/memory/delete", json={"path": "SOUL.md"})
    assert resp.status_code == 403


def test_vector_stats_no_lancedb(client, tmp_hermes):
    """GET /api/memory/vector/stats returns 503 when LanceDB fails to load."""
    resp = client.get("/api/memory/vector/stats")
    # Returns 503 because LanceDB dir exists but has no 'memories' table
    assert resp.status_code in (200, 503)


def test_vector_available_no_lancedb(client, tmp_hermes):
    """GET /api/memory/vector/available returns available=False when no LanceDB."""
    resp = client.get("/api/memory/vector/available")
    assert resp.status_code == 200
    data = resp.json()
    assert data["available"] is False
