import asyncio
import json
import os
import re
import shlex
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Body

router = APIRouter(prefix="/api/claude-code", tags=["claude-code"])

CLAUUDE_DIR = Path.home() / ".claude"
PROJECTS_DIR = CLAUUDE_DIR / "projects"


async def _run(cmd: list, timeout: int = 10) -> str:
    """Run a subprocess asynchronously via executor — avoids blocking the event loop."""
    try:
        loop = asyncio.get_event_loop()
        r = await loop.run_in_executor(
            None,
            lambda: subprocess.run(cmd, capture_output=True, text=True, timeout=timeout),
        )
        return r.stdout.strip()
    except Exception:
        return ""


def _detect_status(output: str) -> str:
    """Detect Claude Code session status from tmux output."""
    lines = output.strip().split("\n")
    last_lines = "\n".join(lines[-5:])

    if "Do you want to make this edit?" in last_lines or "? for shortcuts" in last_lines:
        # Check if there's an active task indicator
        if any(p in last_lines for p in ["·", "❯", "⎿"]):
            # Check if working or idle
            if any(w in last_lines for w in ["Thinking", "Catapulting", "Building", "Writing", "Creating", "Improving", "Reading", "Scanning"]):
                return "working"
            if "❯\n" in last_lines or last_lines.endswith("❯"):
                return "idle"
        return "idle"

    if any(w in last_lines for w in ["Thinking", "Catapulting", "Building", "Writing", "Creating", "Improving"]):
        return "working"

    if "esc to interrupt" in last_lines:
        return "working"

    if "[Command interrupted" in last_lines:
        return "interrupted"

    if "Goodbye" in output or "Thanks for" in output:
        return "completed"

    return "unknown"


@router.get("/active")
async def active_sessions():
    """List active Claude Code tmux sessions."""
    result = await _run(["tmux", "list-sessions", "-F", "#{session_name}"])
    sessions = []
    active_tmux = [s for s in result.split("\n") if s.startswith("claude-")]

    for name in active_tmux:
        # Get output
        output = await _run(["tmux", "capture-pane", "-t", name, "-p"])
        status = _detect_status(output)

        # Get process info
        pid = None
        cpu = 0.0
        mem_mb = 0.0
        workdir = ""

        ps_result = await _run(["ps", "aux"])
        for line in ps_result.split("\n"):
            if "/root/.local/bin/claude" in line and "grep" not in line:
                parts = line.split()
                pid = parts[1]
                try:
                    cpu = float(parts[2])
                    mem_mb = float(parts[5]) / 1024
                except (ValueError, IndexError):
                    pass
                # Try to get cwd from /proc
                if pid:
                    try:
                        workdir = os.readlink(f"/proc/{pid}/cwd")
                    except Exception:
                        pass
                break

        sessions.append({
            "name": name,
            "status": status,
            "pid": pid,
            "cpu_percent": round(cpu, 1),
            "memory_mb": round(mem_mb, 1),
            "workdir": workdir,
            "last_output": "\n".join(output.split("\n")[-30:]),
            "output_lines": len(output.split("\n")),
        })

    return {"sessions": sessions}


@router.get("/history")
async def session_history(limit: int = 30, project: str = ""):
    """List past Claude Code sessions from .claude/projects/."""
    if not PROJECTS_DIR.exists():
        return {"sessions": []}

    sessions = []
    for proj_dir in sorted(PROJECTS_DIR.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if not proj_dir.is_dir():
            continue

        # Find all .jsonl files (skip subagents for now)
        jsonl_files = sorted(
            [f for f in proj_dir.glob("*.jsonl") if "subagent" not in f.name],
            key=lambda f: f.stat().st_mtime,
            reverse=True
        )

        for f in jsonl_files[:5]:  # Top 5 per project
            project_name = proj_dir.name.replace("-root-", "/").replace("-root", "/").replace("-", " ").strip("/")
            if project and project.lower() not in project_name.lower():
                continue

            mtime = datetime.fromtimestamp(f.stat().st_mtime)
            line_count = 0
            try:
                with open(f) as fh:
                    line_count = sum(1 for _ in fh)
            except Exception:
                pass

            subagents = 0
            sub_dir = f.parent / f.stem / "subagents"
            if sub_dir.exists():
                subagents = len(list(sub_dir.glob("*.jsonl")))

            sessions.append({
                "id": f.stem,
                "project": project_name,
                "size_bytes": f.stat().st_size,
                "size_kb": round(f.stat().st_size / 1024, 1),
                "last_modified": mtime.isoformat(),
                "turns_approx": line_count,
                "subagents_count": subagents,
                "path": str(f),
            })

    # Sort by date desc
    sessions.sort(key=lambda x: x["last_modified"], reverse=True)
    return {"sessions": sessions[:limit]}


@router.get("/output")
async def session_output(session: str = "", lines: int = 50):
    """Capture current tmux session output."""
    if not session:
        raise HTTPException(400, "session required")
    output = await _run(["tmux", "capture-pane", "-t", session, "-p"])
    return {"session": session, "output": output}


@router.post("/stop")
async def stop_session(body: dict = Body(...)):
    """Send Ctrl+C to a Claude Code session."""
    session = body.get("session", "")
    if not session:
        raise HTTPException(400, "session required")
    subprocess.run(["tmux", "send-keys", "-t", session, "C-c"], capture_output=True)
    return {"status": "stopped", "session": session}


@router.post("/send")
async def send_to_session(body: dict = Body(...)):
    """Send text to a Claude Code session."""
    session = body.get("session", "")
    message = body.get("message", "")
    if not session or not message:
        raise HTTPException(400, "session and message required")
    subprocess.run(["tmux", "send-keys", "-t", session, "-l", "--", message], capture_output=True)
    subprocess.run(["tmux", "send-keys", "-t", session, "Enter"], capture_output=True)
    return {"status": "sent", "session": session}


@router.post("/new")
async def new_session(body: dict = Body(...)):
    """Create a new Claude Code tmux session."""
    name = body.get("name", "claude-session")
    if not name.startswith("claude-"):
        name = f"claude-{name}"
    workdir = body.get("workdir", "")

    subprocess.run(["tmux", "new-session", "-d", "-s", name], capture_output=True)
    if workdir:
        workdir_resolved = Path(workdir).resolve()
        if not workdir_resolved.is_dir():
            raise HTTPException(400, "Invalid workdir")
        subprocess.run(["tmux", "send-keys", "-t", name, "-l", "--", f"cd {shlex.quote(str(workdir_resolved))}"], capture_output=True)
        subprocess.run(["tmux", "send-keys", "-t", name, "Enter"], capture_output=True)
    subprocess.run(["tmux", "send-keys", "-t", name, "-l", "--", "/root/.local/bin/claude"], capture_output=True)
    subprocess.run(["tmux", "send-keys", "-t", name, "Enter"], capture_output=True)
    return {"status": "created", "session": name}


@router.delete("/session")
async def kill_session(body: dict = Body(...)):
    """Kill a tmux session."""
    session = body.get("session", "")
    if not session:
        raise HTTPException(400, "session required")
    subprocess.run(["tmux", "kill-session", "-t", session], capture_output=True)
    return {"status": "killed", "session": session}


@router.get("/session/{session_id}/messages")
async def session_messages(session_id: str, limit: int = 30):
    """Read messages from a past Claude Code session JSONL."""
    # Find the file
    jsonl_file = None
    for proj_dir in PROJECTS_DIR.glob("*"):
        candidate = proj_dir / f"{session_id}.jsonl"
        if candidate.exists():
            jsonl_file = candidate
            break

    if not jsonl_file:
        raise HTTPException(404, "Session not found")

    messages = []
    total_turns = 0
    with open(jsonl_file) as f:
        for line in f:
            try:
                d = json.loads(line.strip())
                msg_type = d.get("type", "")

                if msg_type in ("user", "assistant"):
                    total_turns += 1
                    content = d.get("message", {})
                    if isinstance(content, dict):
                        role = content.get("role", msg_type)
                        text_parts = []
                        for block in content.get("content", []):
                            if isinstance(block, dict) and block.get("type") == "text":
                                text_parts.append(block.get("text", ""))
                            elif isinstance(block, str):
                                text_parts.append(block)
                        text = "\n".join(text_parts)[:500]
                    elif isinstance(content, str):
                        role = msg_type
                        text = content[:500]
                    else:
                        continue

                    messages.append({
                        "role": role,
                        "content": text,
                        "type": msg_type,
                    })
            except Exception:
                continue

    # Return last N messages
    messages = messages[-limit:]
    return {"messages": messages, "session_id": session_id, "total_turns": total_turns}


@router.get("/stats")
async def claude_stats():
    """Get Claude Code statistics."""
    # Active sessions
    result = await _run(["tmux", "list-sessions", "-F", "#{session_name}"])
    active = len([s for s in result.split("\n") if s.startswith("claude-")])

    # Past sessions
    total_past = 0
    projects = set()
    if PROJECTS_DIR.exists():
        for proj_dir in PROJECTS_DIR.iterdir():
            if proj_dir.is_dir():
                projects.add(proj_dir.name)
                total_past += len([f for f in proj_dir.glob("*.jsonl") if "subagent" not in str(f)])

    # Last activity
    last_activity = None
    if PROJECTS_DIR.exists():
        all_jsonl = list(PROJECTS_DIR.glob("*/*.jsonl"))
        non_subagent = [f for f in all_jsonl if "subagent" not in str(f)]
        if non_subagent:
            latest = max(non_subagent, key=lambda f: f.stat().st_mtime)
            last_activity = datetime.fromtimestamp(latest.stat().st_mtime).isoformat()

    return {
        "active_sessions": active,
        "total_past_sessions": total_past,
        "total_projects": len(projects),
        "last_activity": last_activity,
    }


@router.get("/projects")
async def list_projects():
    """List all Claude Code projects."""
    projects = []
    if not PROJECTS_DIR.exists():
        return {"projects": []}

    for proj_dir in sorted(PROJECTS_DIR.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if not proj_dir.is_dir():
            continue
        name = proj_dir.name.replace("-root-", "/").replace("-root", "/").replace("-", " ").strip("/")
        sessions = len([f for f in proj_dir.glob("*.jsonl") if "subagent" not in str(f)])
        total_size = sum(f.stat().st_size for f in proj_dir.glob("*.jsonl") if "subagent" not in str(f))
        mtime = datetime.fromtimestamp(proj_dir.stat().st_mtime)

        projects.append({
            "name": name,
            "sessions": sessions,
            "total_size_kb": round(total_size / 1024, 1),
            "last_modified": mtime.isoformat(),
        })

    return {"projects": projects}
