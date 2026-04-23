"""Export router — export data as JSON or CSV for projects, backlog, wiki, activity, tags."""

import csv
import fcntl
import io
import json
import logging
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from ..config import HERMES_HOME

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/export", tags=["export"])

EXPORTABLE = ["projects", "backlog", "activity", "tags", "wiki"]

MODULE_FILES = {
    "projects": HERMES_HOME / "projects.json",
    "backlog": HERMES_HOME / "backlog.json",
    "activity": HERMES_HOME / "activity.json",
    "tags": HERMES_HOME / "tags.json",
}

MODULE_ITEM_KEY = {
    "projects": "items",
    "backlog": "items",
    "activity": "entries",
    "tags": "items",
}


def _read_module_data(module: str):
    """Read raw module data."""
    if module == "wiki":
        return _read_wiki_data()

    file_path = MODULE_FILES.get(module)
    if not file_path or not file_path.exists():
        return []

    with open(file_path) as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_SH)
        try:
            data = json.load(f)
        finally:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)

    key = MODULE_ITEM_KEY.get(module, "items")
    return data.get(key, [])


def _read_wiki_data():
    """Read wiki pages from ~/wiki directory."""
    wiki_path = Path.home() / "wiki"
    pages = []
    for subdir in ["entities", "concepts", "comparisons", "queries"]:
        dir_path = wiki_path / subdir
        if not dir_path.exists():
            continue
        for f in sorted(dir_path.glob("*.md")):
            try:
                content = f.read_text(errors="ignore")
                title = f.stem.replace("-", " ").title()
                pages.append({
                    "name": f.stem,
                    "title": title,
                    "type": subdir,
                    "size": len(content),
                })
            except Exception:
                continue
    return pages


def _to_csv(items: list[dict], module: str) -> str:
    """Convert list of dicts to CSV string."""
    if not items:
        return ""

    output = io.StringIO()
    # Flatten nested dicts for CSV
    flat_items = []
    for item in items:
        flat = {}
        for k, v in item.items():
            if isinstance(v, (dict, list)):
                flat[k] = json.dumps(v, ensure_ascii=False)
            else:
                flat[k] = v
        flat_items.append(flat)

    # Collect all keys
    all_keys = []
    for item in flat_items:
        for k in item:
            if k not in all_keys:
                all_keys.append(k)

    writer = csv.DictWriter(output, fieldnames=all_keys, extrasaction="ignore")
    writer.writeheader()
    for item in flat_items:
        writer.writerow(item)

    return output.getvalue()


@router.get("/{module}")
async def export_module(
    module: str,
    format: str = Query("json", regex="^(json|csv)$"),
):
    if module not in EXPORTABLE:
        raise HTTPException(400, f"Invalid module. Valid: {EXPORTABLE}")

    items = _read_module_data(module)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"hermes_{module}_{timestamp}"

    if format == "csv":
        csv_content = _to_csv(items, module)
        if not csv_content:
            csv_content = "No data to export\n"

        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}.csv"'
            },
        )

    # JSON format
    json_content = json.dumps(items, indent=2, ensure_ascii=False)
    return Response(
        content=json_content,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}.json"'
        },
    )
