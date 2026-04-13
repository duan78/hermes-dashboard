import asyncio
import re
import shutil
from pathlib import Path

from fastapi import APIRouter

from ..config import HERMES_HOME
from ..utils import hermes_path

router = APIRouter(prefix="/api/diagnostics", tags=["diagnostics"])

SYSTEMCTL_ENV = {"XDG_RUNTIME_DIR": "/run/user/0"}


def _parse_doctor_output(raw: str) -> dict:
    """Parse hermes doctor output into structured checks."""
    checks = []
    summary = {"pass": 0, "warn": 0, "fail": 0}

    current_category = "General"
    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped:
            continue

        # Detect category headers (e.g., lines ending with : or all caps section headers)
        if re.match(r"^[\w\s&]+:$", stripped) or re.match(r"^═+|^─+$", stripped):
            cat = stripped.rstrip(":")
            if cat and not re.match(r"^═+|^─+$", cat):
                current_category = cat
            continue

        # Check lines with symbols
        status = None
        if "✓" in stripped or "✔" in stripped or "[OK]" in stripped or "[PASS]" in stripped.upper():
            status = "pass"
        elif "⚠" in stripped or "[WARN]" in stripped.upper() or "WARNING" in stripped.upper():
            status = "warn"
        elif "✗" in stripped or "✘" in stripped or "[FAIL]" in stripped.upper() or "[ERROR]" in stripped.upper():
            status = "fail"

        if status:
            # Clean up the message
            msg = re.sub(r"[✓✔⚠✗✘\[\]]", "", stripped).strip()
            msg = re.sub(r"\s+", " ", msg)
            name = msg.split(":")[0].strip() if ":" in msg else msg[:50]
            checks.append({
                "category": current_category,
                "name": name,
                "status": status,
                "message": msg,
            })
            summary[status] += 1

    return {"checks": checks, "summary": summary, "raw": raw}


@router.post("/run")
async def run_diagnostics():
    """Run hermes doctor full diagnostics."""
    python_bin = str(Path.home() / ".hermes/hermes-agent/venv/bin/python")
    proc = await asyncio.create_subprocess_exec(
        python_bin, "-m", "hermes_cli.main", "doctor",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)
    except TimeoutError:
        proc.kill()
        return {
            "checks": [],
            "summary": {"pass": 0, "warn": 0, "fail": 1},
            "raw": "Diagnostics timed out after 60 seconds",
        }

    output = stdout.decode(errors="replace")
    if proc.returncode != 0:
        err = stderr.decode(errors="replace").strip()
        output = output + "\n" + err if output else err

    return _parse_doctor_output(output)


@router.get("/quick")
async def quick_diagnostics():
    """Quick health checks without running hermes doctor."""
    checks = []
    env_path = HERMES_HOME / ".env"
    config_path = hermes_path("config.yaml")
    log_path = hermes_path("logs", "gateway.log")
    sessions_dir = hermes_path("sessions")

    # Gateway running — try systemctl first, fall back to process check
    proc = await asyncio.create_subprocess_exec(
        "systemctl", "--user", "is-active", "hermes-gateway",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=SYSTEMCTL_ENV,
    )
    out, err = await proc.communicate()
    gw_active = out.decode().strip() == "active"
    gw_method = "systemctl"

    if not gw_active:
        # Fallback: check if the gateway process is running directly
        pgrep = await asyncio.create_subprocess_exec(
            "pgrep", "-f", "hermes_cli.main gateway run",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        pgrep_out, _ = await pgrep.communicate()
        if pgrep.returncode == 0 and pgrep_out.decode().strip():
            gw_active = True
            gw_method = "process"

    checks.append({
        "name": "Gateway Running",
        "status": "pass" if gw_active else "fail",
        "message": (
            "Gateway service is active" if gw_method == "systemctl"
            else "Gateway process is running (detected via pgrep)" if gw_active
            else "Gateway service is not running"
        ),
    })

    # Config file exists
    checks.append({
        "name": "Config File",
        "status": "pass" if config_path.exists() else "fail",
        "message": f"Found at {config_path}" if config_path.exists() else f"Missing: {config_path}",
    })

    # .env file exists
    checks.append({
        "name": ".env File",
        "status": "pass" if env_path.exists() else "warn",
        "message": f"Found at {env_path}" if env_path.exists() else "No .env file found",
    })

    # Log file accessible
    checks.append({
        "name": "Log File",
        "status": "pass" if log_path.exists() else "warn",
        "message": f"Found at {log_path}" if log_path.exists() else "No log file yet",
    })

    # Memory files
    memory_files = [
        ("MEMORY.md", HERMES_HOME / "memories" / "MEMORY.md"),
        ("USER.md", HERMES_HOME / "memories" / "USER.md"),
        ("SOUL.md", HERMES_HOME / "SOUL.md"),
    ]
    for mf_name, mf_path in memory_files:
        checks.append({
            "name": mf_name,
            "status": "pass" if mf_path.exists() else "warn",
            "message": f"Found ({mf_path.stat().st_size} bytes)" if mf_path.exists() else "Not found",
        })

    # Sessions dir
    checks.append({
        "name": "Sessions Directory",
        "status": "pass" if sessions_dir.exists() else "warn",
        "message": f"Found ({len(list(sessions_dir.glob('*.json')))} files)" if sessions_dir.exists() else "Not found",
    })

    # Disk space
    disk = shutil.disk_usage("/")
    free_gb = disk.free / (1024 ** 3)
    checks.append({
        "name": "Disk Space",
        "status": "pass" if free_gb > 1 else ("warn" if free_gb > 0.1 else "fail"),
        "message": f"{free_gb:.1f} GB free",
    })

    summary = {
        "pass": sum(1 for c in checks if c["status"] == "pass"),
        "warn": sum(1 for c in checks if c["status"] == "warn"),
        "fail": sum(1 for c in checks if c["status"] == "fail"),
    }

    return {"checks": checks, "summary": summary}
