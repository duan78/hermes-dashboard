from fastapi import APIRouter, Query
from ..utils import run_hermes

router = APIRouter(prefix="/api/insights", tags=["insights"])


@router.get("")
async def get_insights(days: int = Query(default=7)):
    """Get usage insights."""
    try:
        output = await run_hermes("insights", "--days", str(days), timeout=30)
        return {"output": output}
    except RuntimeError as e:
        return {"output": "", "error": str(e)}
