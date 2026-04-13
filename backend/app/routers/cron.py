import json
import logging
import subprocess

from fastapi import APIRouter, HTTPException

from ..schemas import CronCreateRequest
from ..schemas.cron import CronJob, CronJobActionResponse, CronJobCreateResponse, SystemCronResponse
from ..utils import hermes_path, run_hermes

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cron", tags=["cron"])


@router.get("/system", response_model=SystemCronResponse)
async def list_system_crons():
    """List system-level cron jobs and systemd timers."""
    result = {
        "crontab": [],
        "systemd_timers": [],
        "systemd_services": [],
    }

    # 1. Parse crontab for entries
    try:
        crontab = subprocess.check_output(["crontab", "-l"], text=True, timeout=5)
        for line in crontab.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if len(parts) >= 6:
                schedule = " ".join(parts[:5])
                command = " ".join(parts[5:])
                # Extract script name from command path (before any redirection)
                cmd_before_redirect = command.split(">")[0].strip()
                name = cmd_before_redirect.split("/")[-1].replace(".sh", "").replace(".py", "")
                if name in ("bash", "sh", "python3", "python"):
                    for segment in cmd_before_redirect.split():
                        if "/" in segment:
                            name = segment.split("/")[-1].replace(".sh", "").replace(".py", "")
                            break
                result["crontab"].append({
                    "schedule": schedule,
                    "command": command,
                    "name": name,
                })
    except Exception as e:
        logger.debug("Failed to read crontab: %s", e)

    # 2. List Hermes-related systemd timers
    try:
        timers_output = subprocess.check_output(
            ["systemctl", "list-timers", "--all", "--no-pager"],
            text=True, timeout=5
        )
        hermes_keywords = ["hermes", "claude", "watchdog"]
        for line in timers_output.splitlines():
            if any(h in line.lower() for h in hermes_keywords):
                parts = line.split()
                if len(parts) >= 7:
                    timer_name = parts[-1]
                    result["systemd_timers"].append({
                        "name": timer_name,
                        "next_run": " ".join(parts[0:3]) if len(parts) > 2 else "",
                        "last_run": " ".join(parts[3:6]) if len(parts) > 5 else "",
                    })
    except Exception as e:
        logger.debug("Failed to list systemd timers: %s", e)

    # 3. Check key Hermes services/timers status
    # For timer-based services, check the timer (not the service which is oneshot)
    checks = [
        ("hermes-watchdog", "timer"),
        ("hermes-dashboard", "service"),
        ("hermes-gateway", "service"),
    ]
    for name, kind in checks:
        try:
            status = subprocess.check_output(
                ["systemctl", "is-active", f"{name}.{kind}"],
                text=True, timeout=5
            ).strip()
        except Exception:
            # Fallback: try as service
            try:
                status = subprocess.check_output(
                    ["systemctl", "is-active", name], text=True, timeout=5
                ).strip()
            except Exception as e:
                logger.debug("Service %s not found: %s", name, e)
                status = "not-found"
        result["systemd_services"].append({"name": name, "status": status, "kind": kind})

    return result


@router.get("", response_model=list[CronJob])
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


@router.post("", response_model=CronJobCreateResponse)
async def create_cron_job(body: CronCreateRequest):
    """Create a cron job."""
    logger.info("Creating cron job: name=%s schedule=%s", body.name, body.schedule)
    try:
        args = ["cron", "create", "--schedule", body.schedule, "--prompt", body.prompt]
        if body.name:
            args += ["--name", body.name]
        output = await run_hermes(*args, timeout=30)
        return {"status": "created", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))


@router.get("/{job_id}", response_model=CronJob)
async def get_cron_job(job_id: str):
    """Get cron job details."""
    job_file = hermes_path("cron", f"{job_id}.json")
    if not job_file.exists():
        raise HTTPException(404, "Job not found")
    return json.loads(job_file.read_text())


@router.post("/{job_id}/pause", response_model=CronJobActionResponse)
async def pause_cron_job(job_id: str):
    """Pause a cron job."""
    try:
        output = await run_hermes("cron", "pause", job_id, timeout=15)
        return {"status": "paused", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))


@router.post("/{job_id}/resume", response_model=CronJobActionResponse)
async def resume_cron_job(job_id: str):
    """Resume a cron job."""
    try:
        output = await run_hermes("cron", "resume", job_id, timeout=15)
        return {"status": "resumed", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))


@router.post("/{job_id}/run", response_model=CronJobActionResponse)
async def run_cron_job(job_id: str):
    """Run a cron job manually."""
    try:
        output = await run_hermes("cron", "run", job_id, timeout=60)
        return {"status": "running", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))


@router.delete("/{job_id}", response_model=CronJobActionResponse)
async def delete_cron_job(job_id: str):
    """Delete a cron job."""
    logger.info("Deleting cron job: %s", job_id)
    try:
        output = await run_hermes("cron", "remove", job_id, "--yes", timeout=15)
        return {"status": "deleted", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))
