"""EasyCRM Leads API with offset-based pagination."""

import json
import logging
import threading
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..config import HERMES_HOME

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/leads", tags=["leads"])

LEADS_FILE = HERMES_HOME / "leads.json"
_lock = threading.Lock()

DEFAULT_PAGE_SIZE = 25
MAX_PAGE_SIZE = 100

STATUS_OPTIONS = {"new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"}


# ── Pydantic models ──

class LeadCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200, description="Lead name")
    email: str = Field("", max_length=300, description="Contact email")
    phone: str = Field("", max_length=50, description="Phone number")
    company: str = Field("", max_length=200, description="Company name")
    status: str = Field("new", description=f"One of: {', '.join(sorted(STATUS_OPTIONS))}")
    source: str = Field("", max_length=100, description="Lead source (e.g. website, referral)")
    notes: str = Field("", max_length=5000, description="Free-form notes")
    value: float | None = Field(None, ge=0, description="Estimated deal value")


class LeadUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    email: str | None = Field(None, max_length=300)
    phone: str | None = Field(None, max_length=50)
    company: str | None = Field(None, max_length=200)
    status: str | None = Field(None)
    source: str | None = Field(None, max_length=100)
    notes: str | None = Field(None, max_length=5000)
    value: float | None = Field(None, ge=0)


# ── Persistence helpers ──

def _load_leads() -> list[dict]:
    if not LEADS_FILE.exists():
        return []
    try:
        data = json.loads(LEADS_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("Failed to load leads: %s", e)
        return []


def _save_leads(leads: list[dict]):
    LEADS_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = LEADS_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(leads, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(LEADS_FILE)


# ── Endpoints ──

@router.get("")
async def list_leads(
    offset: int = Query(0, ge=0, description="Number of leads to skip"),
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE, description="Page size"),
    search: str = Query("", description="Search in name, email, company, notes"),
    status: str = Query("", description="Filter by status"),
    sort: str = Query("created_desc", description="Sort: created_desc, created_asc, name_asc, name_desc, value_desc, value_asc"),
):
    """List leads with offset-based pagination."""
    with _lock:
        leads = _load_leads()

    # Filter
    if status:
        status_lower = status.lower()
        leads = [l for l in leads if l.get("status", "").lower() == status_lower]

    if search:
        terms = search.lower().split()
        filtered = []
        for l in leads:
            blob = f"{l.get('name','')} {l.get('email','')} {l.get('company','')} {l.get('notes','')} {l.get('source','')}".lower()
            if all(t in blob for t in terms):
                filtered.append(l)
        leads = filtered

    # Sort
    sort_fns = {
        "created_desc": lambda l: l.get("created_at", ""),
        "created_asc": lambda l: l.get("created_at", ""),
        "name_asc": lambda l: l.get("name", "").lower(),
        "name_desc": lambda l: l.get("name", "").lower(),
        "value_desc": lambda l: l.get("value") or 0,
        "value_asc": lambda l: l.get("value") or 0,
    }
    sort_fn = sort_fns.get(sort, sort_fns["created_desc"])
    reverse = sort.endswith("_desc")
    leads.sort(key=sort_fn, reverse=reverse)

    total = len(leads)
    page = leads[offset : offset + limit]

    return {
        "leads": page,
        "total": total,
        "offset": offset,
        "limit": limit,
        "has_more": (offset + limit) < total,
    }


@router.get("/stats")
async def leads_stats():
    """Return aggregate stats about leads."""
    with _lock:
        leads = _load_leads()

    by_status = {}
    total_value = 0.0
    for l in leads:
        s = l.get("status", "new")
        by_status[s] = by_status.get(s, 0) + 1
        v = l.get("value")
        if v:
            total_value += v

    return {
        "total": len(leads),
        "by_status": by_status,
        "total_value": total_value,
    }


@router.post("")
async def create_lead(body: LeadCreate):
    """Create a new lead."""
    if body.status and body.status not in STATUS_OPTIONS:
        raise HTTPException(400, f"Invalid status. Allowed: {', '.join(sorted(STATUS_OPTIONS))}")

    lead = {
        "id": str(uuid.uuid4())[:12],
        "name": body.name.strip(),
        "email": body.email.strip(),
        "phone": body.phone.strip(),
        "company": body.company.strip(),
        "status": body.status or "new",
        "source": body.source.strip(),
        "notes": body.notes.strip(),
        "value": body.value,
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }

    with _lock:
        leads = _load_leads()
        leads.append(lead)
        _save_leads(leads)

    return lead


@router.put("/{lead_id}")
async def update_lead(lead_id: str, body: LeadUpdate):
    """Update an existing lead."""
    if body.status is not None and body.status not in STATUS_OPTIONS:
        raise HTTPException(400, f"Invalid status. Allowed: {', '.join(sorted(STATUS_OPTIONS))}")

    with _lock:
        leads = _load_leads()
        for i, l in enumerate(leads):
            if l["id"] == lead_id:
                for field, value in body.model_dump(exclude_unset=True).items():
                    if isinstance(value, str):
                        value = value.strip()
                    leads[i][field] = value
                leads[i]["updated_at"] = datetime.now(UTC).isoformat()
                _save_leads(leads)
                return leads[i]

    raise HTTPException(404, "Lead not found")


@router.delete("/{lead_id}")
async def delete_lead(lead_id: str):
    """Delete a lead."""
    with _lock:
        leads = _load_leads()
        new_leads = [l for l in leads if l["id"] != lead_id]
        if len(new_leads) == len(leads):
            raise HTTPException(404, "Lead not found")
        _save_leads(new_leads)

    return {"status": "deleted", "id": lead_id}
