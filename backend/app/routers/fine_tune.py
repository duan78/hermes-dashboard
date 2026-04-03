import json
import os
from pathlib import Path
from fastapi import APIRouter, HTTPException, Body, Query
from fastapi.responses import StreamingResponse
from ..config import HERMES_HOME

router = APIRouter(prefix="/api/fine-tune", tags=["fine-tune"])

_TRAINING_DIR = HERMES_HOME / "fine-tune" / "training"
_AUDIO_DIR = HERMES_HOME / "fine-tune" / "audio"
_METADATA_FILE = _TRAINING_DIR / "metadata.jsonl"


def _read_metadata():
    """Read all entries from metadata.jsonl."""
    if not _METADATA_FILE.exists():
        return []
    entries = []
    for line in _METADATA_FILE.read_text(errors="replace").splitlines():
        line = line.strip()
        if line:
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return entries


def _write_metadata(entries):
    """Write all entries back to metadata.jsonl atomically."""
    _TRAINING_DIR.mkdir(parents=True, exist_ok=True)
    tmp = _METADATA_FILE.with_suffix(".tmp")
    with open(tmp, "w") as f:
        for entry in entries:
            f.write(json.dumps(entry) + "\n")
    os.replace(tmp, _METADATA_FILE)


@router.get("/available")
async def available():
    """Check if fine-tune data exists."""
    exists = _METADATA_FILE.exists()
    total = 0
    if exists:
        total = len(_read_metadata())
    return {"available": exists and total > 0, "total_pairs": total}


@router.get("/pairs")
async def list_pairs(
    date: str = Query(None, description="Filter by date YYYY-MM-DD"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List fine-tune pairs with optional date filter."""
    entries = _read_metadata()
    if date:
        entries = [e for e in entries if e.get("date") == date]

    dates = sorted({e.get("date") for e in entries if e.get("date")}, reverse=True)
    total = len(entries)
    page = entries[offset: offset + limit]

    pairs = []
    for e in page:
        transcript = ""
        tf = Path(e.get("transcript_file", ""))
        if tf.exists():
            transcript = tf.read_text(errors="replace")
        pairs.append({
            "base_name": e.get("base_name", ""),
            "date": e.get("date", ""),
            "timestamp": e.get("timestamp", ""),
            "transcript": transcript,
            "transcript_length": e.get("transcript_length", len(transcript)),
            "audio_size_bytes": e.get("audio_size_bytes", 0),
            "estimated_duration_sec": e.get("estimated_duration_sec", 0),
            "audio_file": e.get("audio_file", ""),
            "transcript_file": e.get("transcript_file", ""),
        })

    return {"pairs": pairs, "total": total, "dates": dates}


@router.put("/pairs/{base_name}")
async def update_pair(base_name: str, body: dict = Body(...)):
    """Update the transcript of a pair."""
    transcript = body.get("transcript", "")
    entries = _read_metadata()
    target = None
    for e in entries:
        if e.get("base_name") == base_name:
            target = e
            break
    if not target:
        raise HTTPException(404, f"Pair '{base_name}' not found")

    tf = Path(target["transcript_file"])
    if not tf.exists():
        raise HTTPException(404, "Transcript file not found on disk")
    tf.write_text(transcript)
    target["transcript_length"] = len(transcript)
    _write_metadata(entries)
    return {"status": "updated"}


@router.delete("/pairs/{base_name}")
async def delete_pair(base_name: str):
    """Delete a pair (audio + transcript + metadata entry)."""
    entries = _read_metadata()
    target = None
    for e in entries:
        if e.get("base_name") == base_name:
            target = e
            break
    if not target:
        raise HTTPException(404, f"Pair '{base_name}' not found")

    # Delete files
    for key in ("audio_file", "transcript_file"):
        p = Path(target.get(key, ""))
        if p.exists():
            p.unlink()

    # Remove from metadata
    entries = [e for e in entries if e.get("base_name") != base_name]
    _write_metadata(entries)
    return {"status": "deleted"}


@router.get("/stats")
async def stats():
    """Global fine-tune statistics."""
    entries = _read_metadata()
    if not entries:
        return {
            "total_pairs": 0,
            "total_duration_sec": 0,
            "total_audio_size_mb": 0,
            "dates": [],
            "avg_transcript_length": 0,
        }

    total_duration = sum(e.get("estimated_duration_sec", 0) for e in entries)
    total_audio_bytes = sum(e.get("audio_size_bytes", 0) for e in entries)
    lengths = [e.get("transcript_length", 0) for e in entries]
    dates = sorted({e.get("date") for e in entries if e.get("date")}, reverse=True)

    return {
        "total_pairs": len(entries),
        "total_duration_sec": total_duration,
        "total_audio_size_mb": round(total_audio_bytes / (1024 * 1024), 2),
        "dates": dates,
        "avg_transcript_length": round(sum(lengths) / len(lengths), 1) if lengths else 0,
    }


@router.get("/audio/{date}/{base_name}")
async def serve_audio(date: str, base_name: str):
    """Serve an audio file for in-browser playback."""
    # Build expected path
    audio_path = _AUDIO_DIR / date / f"{base_name}.ogg"
    if not audio_path.exists():
        # Fallback: search in metadata for exact path
        entries = _read_metadata()
        for e in entries:
            if e.get("base_name") == base_name and e.get("date") == date:
                p = Path(e.get("audio_file", ""))
                if p.exists():
                    audio_path = p
                    break
        if not audio_path.exists():
            raise HTTPException(404, "Audio file not found")

    def iterfile():
        with open(audio_path, "rb") as f:
            while chunk := f.read(65536):
                yield chunk

    return StreamingResponse(
        iterfile(),
        media_type="audio/ogg",
        headers={"Content-Disposition": f"inline; filename={base_name}.ogg"},
    )
