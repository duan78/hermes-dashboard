"""Search History API — reads from the shared SQLite DB written by the Hermes Agent."""

import sqlite3
from pathlib import Path
from datetime import datetime, timedelta

from fastapi import APIRouter, Query

from ..config import HERMES_HOME

router = APIRouter(prefix="/api/search", tags=["search-history"])

DB_PATH = HERMES_HOME / "search_history.db"


def _connect():
    """Return a sqlite3 connection or None when the DB does not exist yet."""
    if not DB_PATH.exists():
        return None
    conn = sqlite3.connect(str(DB_PATH), timeout=3)
    conn.row_factory = sqlite3.Row
    return conn


# ── Helpers ──────────────────────────────────────────────────────────────────

def _row_to_dict(row: sqlite3.Row) -> dict:
    import json as _json
    d = dict(row)
    # Parse JSON fields
    for key in ("top_urls", "top_titles"):
        val = d.get(key)
        if isinstance(val, str):
            try:
                d[key] = _json.loads(val)
            except Exception:
                d[key] = []
        elif val is None:
            d[key] = []
    return d


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/history")
def list_search_history(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    backend: str = Query("", description="Filter by backend name"),
    query: str = Query("", description="Search text filter"),
    date_from: str = Query("", description="Start date (YYYY-MM-DD)"),
    date_to: str = Query("", description="End date (YYYY-MM-DD)"),
):
    """List search history entries with pagination and optional filters."""
    conn = _connect()
    if conn is None:
        return {
            "items": [],
            "total": 0,
            "page": page,
            "per_page": per_page,
            "stats": {"by_backend": {}, "total_searches": 0, "avg_results": 0},
        }

    try:
        where_clauses = []
        params: list = []

        if backend:
            where_clauses.append("backend = ?")
            params.append(backend)
        if query:
            where_clauses.append("query LIKE ?")
            params.append(f"%{query}%")
        if date_from:
            where_clauses.append("timestamp >= ?")
            params.append(f"{date_from} 00:00:00")
        if date_to:
            where_clauses.append("timestamp <= ?")
            params.append(f"{date_to} 23:59:59")

        where_sql = (" WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

        # Total count
        total = conn.execute(f"SELECT COUNT(*) FROM search_history{where_sql}", params).fetchone()[0]

        # Stats
        stats_row = conn.execute(
            f"SELECT backend, COUNT(*) as cnt, AVG(results_count) as avg_res "
            f"FROM search_history{where_sql} GROUP BY backend",
            params,
        ).fetchall()
        by_backend = {r["backend"]: r["cnt"] for r in stats_row}
        avg_results = sum(r["avg_res"] or 0 for r in stats_row) / len(stats_row) if stats_row else 0

        # Paginated results
        offset = (page - 1) * per_page
        rows = conn.execute(
            f"SELECT * FROM search_history{where_sql} ORDER BY timestamp DESC LIMIT ? OFFSET ?",
            params + [per_page, offset],
        ).fetchall()

        items = [_row_to_dict(r) for r in rows]

        return {
            "items": items,
            "total": total,
            "page": page,
            "per_page": per_page,
            "stats": {
                "by_backend": by_backend,
                "total_searches": total,
                "avg_results": round(avg_results, 1),
            },
        }
    finally:
        conn.close()


@router.get("/history/stats")
def search_history_stats():
    """Global search history statistics."""
    conn = _connect()
    if conn is None:
        return {
            "total_searches": 0,
            "by_backend": [],
            "avg_results": 0,
            "searches_today": 0,
            "searches_this_week": 0,
            "top_queries": [],
        }

    try:
        total = conn.execute("SELECT COUNT(*) FROM search_history").fetchone()[0]

        avg_row = conn.execute("SELECT AVG(results_count) FROM search_history").fetchone()
        avg_results = round(avg_row[0] or 0, 1)

        today = datetime.utcnow().strftime("%Y-%m-%d")
        searches_today = conn.execute(
            "SELECT COUNT(*) FROM search_history WHERE timestamp >= ?", (f"{today} 00:00:00",)
        ).fetchone()[0]

        week_ago = (datetime.utcnow() - timedelta(days=7)).strftime("%Y-%m-%d")
        searches_this_week = conn.execute(
            "SELECT COUNT(*) FROM search_history WHERE timestamp >= ?", (f"{week_ago} 00:00:00",)
        ).fetchone()[0]

        by_backend_rows = conn.execute(
            "SELECT backend, COUNT(*) as cnt FROM search_history GROUP BY backend ORDER BY cnt DESC"
        ).fetchall()
        by_backend = [{"name": r["backend"], "count": r["cnt"]} for r in by_backend_rows]

        top_queries_rows = conn.execute(
            "SELECT query, COUNT(*) as cnt FROM search_history GROUP BY query ORDER BY cnt DESC LIMIT 10"
        ).fetchall()
        top_queries = [{"query": r["query"], "count": r["cnt"]} for r in top_queries_rows]

        return {
            "total_searches": total,
            "by_backend": by_backend,
            "avg_results": avg_results,
            "searches_today": searches_today,
            "searches_this_week": searches_this_week,
            "top_queries": top_queries,
        }
    finally:
        conn.close()


@router.delete("/history")
def delete_search_history(before_date: str = Query("", description="Delete entries before this date (YYYY-MM-DD)")):
    """Delete search history. If before_date is provided, only delete entries before that date."""
    conn = _connect()
    if conn is None:
        return {"deleted": 0}

    try:
        if before_date:
            cursor = conn.execute(
                "DELETE FROM search_history WHERE timestamp < ?", (f"{before_date} 23:59:59",)
            )
        else:
            cursor = conn.execute("DELETE FROM search_history")
        conn.commit()
        return {"deleted": cursor.rowcount}
    finally:
        conn.close()
