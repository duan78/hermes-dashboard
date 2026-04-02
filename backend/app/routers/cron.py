import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, Body
from ..utils import run_hermes, hermes_path

router = APIRouter(prefix="/api/cron", tags=["cron"])


@router.get("")
async def list_cron_jobs():
    """List all cron jobs."""
    cron_dir = hermes_path("cron")
    if not cron_dir.exists():
        return []

    jobs = []
    for f in sorted(cron_dir.glob("*.json")):
        try:
            data = json.loads(f.read_text())
            data["id"] = f.stem
            jobs.append(data)
        except json.JSONDecodeError:
            continue
    return jobs


@router.post("")
async def create_cron_job(body: dict = Body(...)):
    """Create a cron job."""
    schedule = body.get("schedule")
    prompt = body.get("prompt")
    name = body.get("name", "")
    if not schedule or not prompt:
        raise HTTPException(400, "Missing 'schedule' or 'prompt'")
    try:
        args = ["cron", "create", "--schedule", schedule, "--prompt", prompt]
        if name:
            args += ["--name", name]
        output = await run_hermes(*args, timeout=30)
        return {"status": "created", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))


@router.get("/{job_id}")
async def get_cron_job(job_id: str):
    """Get cron job details."""
    job_file = hermes_path("cron", f"{job_id}.json")
    if not job_file.exists():
        raise HTTPException(404, "Job not found")
    return json.loads(job_file.read_text())


@router.post("/{job_id}/pause")
async def pause_cron_job(job_id: str):
    """Pause a cron job."""
    try:
        output = await run_hermes("cron", "pause", job_id, timeout=15)
        return {"status": "paused", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))


@router.post("/{job_id}/resume")
async def resume_cron_job(job_id: str):
    """Resume a cron job."""
    try:
        output = await run_hermes("cron", "resume", job_id, timeout=15)
        return {"status": "resumed", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))


@router.post("/{job_id}/run")
async def run_cron_job(job_id: str):
    """Run a cron job manually."""
    try:
        output = await run_hermes("cron", "run", job_id, timeout=60)
        return {"status": "running", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))


@router.delete("/{job_id}")
async def delete_cron_job(job_id: str):
    """Delete a cron job."""
    try:
        output = await run_hermes("cron", "remove", job_id, "--yes", timeout=15)
        return {"status": "deleted", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))
