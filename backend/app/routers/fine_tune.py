import json
import os
import re
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, HTTPException, Body, Query
from fastapi.responses import StreamingResponse
import httpx
from ..config import HERMES_HOME

router = APIRouter(prefix="/api/fine-tune", tags=["fine-tune"])


def _get_env_from_file(key: str) -> str:
    """Get env value from os.environ or ~/.hermes/.env file."""
    val = os.environ.get(key, "")
    if val:
        return val
    env_path = HERMES_HOME / ".env"
    if env_path.exists():
        for line in env_path.read_text(errors="replace").splitlines():
            line = line.strip()
            if line.startswith(f"{key}="):
                return line[len(key) + 1:].strip().strip("'\"")
    return ""


@router.get("/providers")
async def list_stt_providers():
    """List configured STT providers with API key status."""
    providers = [
        {
            "id": "voxtral",
            "name": "Voxtral (Mistral)",
            "api_key_env": "VOICE_TOOLS_OPENAI_KEY",
            "api_key_set": bool(_get_env_from_file("VOICE_TOOLS_OPENAI_KEY")),
            "base_url": "",
        },
        {
            "id": "groq_turbo",
            "name": "Groq Whisper Turbo",
            "api_key_env": "GROQ_API_KEY",
            "api_key_set": bool(_get_env_from_file("GROQ_API_KEY")),
            "base_url": "https://api.groq.com/openai/v1",
        },
        {
            "id": "groq_full",
            "name": "Groq Whisper Full",
            "api_key_env": "GROQ_API_KEY",
            "api_key_set": bool(_get_env_from_file("GROQ_API_KEY")),
            "base_url": "https://api.groq.com/openai/v1",
        },
        {
            "id": "deepgram",
            "name": "Deepgram Nova-3",
            "api_key_env": "DEEPGRAM_API_KEY",
            "api_key_set": bool(_get_env_from_file("DEEPGRAM_API_KEY")),
            "base_url": "https://api.deepgram.com/v1",
        },
        {
            "id": "assemblyai",
            "name": "AssemblyAI Universal-3-Pro",
            "api_key_env": "ASSEMBLYAI_API_KEY",
            "api_key_set": bool(_get_env_from_file("ASSEMBLYAI_API_KEY")),
            "base_url": "https://api.assemblyai.com/v2",
        },
        {
            "id": "nvidia",
            "name": "NVIDIA Canary",
            "api_key_env": "NVIDIA_API_KEY",
            "api_key_set": bool(_get_env_from_file("NVIDIA_API_KEY")),
            "base_url": "https://integrate.api.nvidia.com/v1",
        },
    ]
    return {"providers": providers, "total": len(providers)}

_TRAINING_DIR = HERMES_HOME / "fine-tune" / "training"
_AUDIO_DIR = HERMES_HOME / "fine-tune" / "audio"
_METADATA_FILE = _TRAINING_DIR / "metadata.jsonl"
_CROSSVAL_FILE = HERMES_HOME / "fine-tune" / "cross-validation" / "results.jsonl"


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
    # Try .ogg first, then .opus (legacy OpenClaw format)
    audio_path = None
    for ext in (".ogg", ".opus"):
        candidate = _AUDIO_DIR / date / f"{base_name}{ext}"
        if candidate.exists():
            audio_path = candidate
            break

    if not audio_path:
        # Fallback: search in metadata for exact path
        entries = _read_metadata()
        for e in entries:
            if e.get("base_name") == base_name and e.get("date") == date:
                p = Path(e.get("audio_file", ""))
                if p.exists():
                    audio_path = p
                    break
        if not audio_path:
            raise HTTPException(404, "Audio file not found")

    media_type = "audio/ogg" if audio_path.suffix == ".ogg" else "audio/ogg; codecs=opus"

    def iterfile():
        with open(audio_path, "rb") as f:
            while chunk := f.read(65536):
                yield chunk

    return StreamingResponse(
        iterfile(),
        media_type=media_type,
        headers={"Content-Disposition": f"inline; filename={audio_path.name}"},
    )


# ---------------------------------------------------------------------------
# Cross-Validation
# ---------------------------------------------------------------------------
def _read_crossval():
    """Read all entries from results.jsonl."""
    if not _CROSSVAL_FILE.exists():
        return []
    entries = []
    for line in _CROSSVAL_FILE.read_text(errors="replace").splitlines():
        line = line.strip()
        if line:
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return entries


def _write_crossval(entries):
    """Write all entries back to results.jsonl atomically."""
    _CROSSVAL_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = _CROSSVAL_FILE.with_suffix(".tmp")
    with open(tmp, "w") as f:
        for entry in entries:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    os.replace(tmp, _CROSSVAL_FILE)


def _extract_audio_ref(audio_path: str) -> dict:
    """Extract date and base_name from an audio_path for the audio endpoint."""
    p = Path(audio_path)
    # path like .../audio/2026-04-07/audio_abc123.ogg
    parts = p.parts
    for i, part in enumerate(parts):
        if part == "audio" and i + 2 < len(parts):
            date = parts[i + 1]
            base_name = Path(parts[i + 2]).stem
            return {"date": date, "base_name": base_name}
    return {"date": "", "base_name": p.stem}


@router.get("/crossval/stats")
async def crossval_stats():
    """Cross-validation statistics."""
    entries = _read_crossval()
    if not entries:
        return {
            "total": 0, "validated": 0, "needs_review": 0,
            "errors": 0, "validated_duration_sec": 0,
            "score_distribution": {}, "avg_min_similarity": 0,
        }

    validated = 0
    needs_review = 0
    errors = 0
    sims = []

    # Build histogram buckets 0.0-0.1, 0.1-0.2, ..., 0.9-1.0
    buckets = {f"{i/10:.1f}-{(i+1)/10:.1f}": 0 for i in range(10)}

    for e in entries:
        st = e.get("status", "error")
        if st == "validated":
            validated += 1
        elif st == "needs_review":
            needs_review += 1
        else:
            errors += 1

        ms = e.get("min_similarity")
        if ms is not None:
            sims.append(ms)
            bucket_idx = min(int(ms * 10), 9)
            key = f"{bucket_idx/10:.1f}-{(bucket_idx+1)/10:.1f}"
            buckets[key] += 1

    avg_sim = round(sum(sims) / len(sims), 4) if sims else 0

    return {
        "total": len(entries),
        "validated": validated,
        "needs_review": needs_review,
        "errors": errors,
        "validated_duration_sec": 0,
        "score_distribution": buckets,
        "avg_min_similarity": avg_sim,
        "providers": {
            "voxtral": sum(1 for e in entries if e.get("voxtral") is not None),
            "groq_turbo": sum(1 for e in entries if e.get("groq_turbo") is not None),
            "groq_full": sum(1 for e in entries if e.get("groq_full") is not None),
            "deepgram": sum(1 for e in entries if e.get("deepgram") is not None),
            "assemblyai": sum(1 for e in entries if e.get("assemblyai") is not None),
            "nvidia": sum(1 for e in entries if e.get("nvidia") is not None),
        },
    }


@router.get("/crossval/pairs")
async def crossval_pairs(
    status: str = Query(None, description="Filter by status: validated or needs_review"),
    min_score: float = Query(0.0, ge=0.0, le=1.0),
    sort: str = Query("score", description="Sort by 'score' or 'date'"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List cross-validation pairs with filters and pagination."""
    raw_entries = _read_crossval()

    # Track original indices
    indexed = [{"orig_idx": i, **e} for i, e in enumerate(raw_entries)]

    # Filter
    if status:
        indexed = [e for e in indexed if e.get("status") == status]
    indexed = [e for e in indexed if (e.get("min_similarity") or 0) >= min_score]

    # Sort
    if sort == "score":
        indexed.sort(key=lambda e: e.get("min_similarity", 0))
    else:
        indexed.sort(key=lambda e: _extract_audio_ref(e.get("audio_path", "")).get("date", ""))

    total = len(indexed)
    page = indexed[offset: offset + limit]

    pairs = []
    for e in page:
        ref = _extract_audio_ref(e.get("audio_path", ""))
        pairs.append({
            "audio_path": e.get("audio_path", ""),
            "date": ref["date"],
            "base_name": ref["base_name"],
            "index": e["orig_idx"],
            "voxtral": e.get("voxtral", ""),
            "groq_turbo": e.get("groq_turbo", ""),
            "groq_full": e.get("groq_full", ""),
            "deepgram": e.get("deepgram"),
            "assemblyai": e.get("assemblyai"),
            "nvidia": e.get("nvidia"),
            "similarities": e.get("similarities", {}),
            "min_similarity": e.get("min_similarity"),
            "status": e.get("status", "error"),
            "ai_review": e.get("ai_review"),
        })

    return {"pairs": pairs, "total": total}


@router.put("/crossval/pairs/{index}/status")
async def crossval_update_status(index: int, body: dict = Body(...)):
    """Update the status of a cross-validation pair by index (0-based)."""
    new_status = body.get("status")
    if new_status not in ("validated", "needs_review"):
        raise HTTPException(400, "Status must be 'validated' or 'needs_review'")

    entries = _read_crossval()
    if index < 0 or index >= len(entries):
        raise HTTPException(404, f"Index {index} out of range (0-{len(entries)-1})")

    entries[index]["status"] = new_status
    _write_crossval(entries)
    return {"status": "updated", "index": index, "new_status": new_status}


@router.get("/crossval/review-stats")
async def crossval_review_stats():
    """Stats on AI-reviewed pairs."""
    entries = _read_crossval()
    total = len(entries)
    needs_review = sum(1 for e in entries if e.get("status") == "needs_review")
    has_review = sum(1 for e in entries if e.get("ai_review") is not None)
    needs_review_no_review = sum(
        1 for e in entries
        if e.get("status") == "needs_review" and e.get("ai_review") is None
    )
    return {
        "total": total,
        "needs_review": needs_review,
        "has_ai_review": has_review,
        "pending_review": needs_review_no_review,
    }


# ---------------------------------------------------------------------------
# AI Reviewer
# ---------------------------------------------------------------------------
_GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"
_GROQ_REVIEW_MODEL = "llama-3.3-70b-versatile"

_REVIEW_SYSTEM_PROMPT = (
    "Tu es un expert en transcription audio française. "
    "On te donne plusieurs transcriptions du même fichier audio provenant de modèles STT différents. "
    "Compare-les toutes attentivement et détermine le texte le plus probable. "
    "Plus il y a de transcriptions similaires entre elles, plus le consensus est fort. "
    "Si un groupe de providers s'accorde et un autre est différent, le groupe majoritaire a probablement raison. "
    "Si aucune n'est parfaite, propose la meilleure version corrigée en t'appuyant sur le consensus majoritaire. "
    "Tu dois répondre UNIQUEMENT avec un objet JSON valide, sans aucun bloc markdown ni backticks. "
    "Structure exacte attendue : "
    '{"best_transcript": "...", "confidence": 0.0, "reasoning": "...", "chosen_provider": "nom_du_provider|corrected", "consensus_providers": ["provider1", "provider2", ...]}'
)


def _get_groq_api_key() -> str:
    """Read Groq API key from .env."""
    env_file = HERMES_HOME / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("GROQ_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return os.getenv("GROQ_API_KEY", "")


def _parse_llm_json(content: str) -> dict:
    """Extract JSON from LLM response (may be in ```json block)."""
    # Try to find JSON in code block first
    m = re.search(r"```(?:json)?\s*\n?(.*?)```", content, re.DOTALL)
    if m:
        content = m.group(1).strip()
    # Try to find raw JSON object
    m = re.search(r"\{.*\}", content, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    return None


# Provider display names for AI review
_PROVIDER_NAMES = {
    "voxtral": "Voxtral (Mistral)",
    "groq_turbo": "Groq Whisper Turbo",
    "groq_full": "Groq Whisper Full",
    "deepgram": "Deepgram Nova-3",
    "assemblyai": "AssemblyAI Universal-3-Pro",
    "nvidia": "NVIDIA Canary",
}


async def _call_groq_review(transcriptions: dict) -> dict:
    """Call Groq LLM to review multiple transcriptions and find consensus.
    
    Args:
        transcriptions: dict of {provider_key: transcript_text} (only non-empty entries)
    """
    api_key = _get_groq_api_key()
    if not api_key:
        raise HTTPException(500, "GROQ_API_KEY not configured")

    # Build user message with all available transcriptions
    parts = []
    for i, (key, text) in enumerate(transcriptions.items(), 1):
        name = _PROVIDER_NAMES.get(key, key)
        parts.append(f"Transcription {i} ({name}):\n{text}")
    user_msg = "\n\n".join(parts)

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            _GROQ_CHAT_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": _GROQ_REVIEW_MODEL,
                "messages": [
                    {"role": "system", "content": _REVIEW_SYSTEM_PROMPT},
                    {"role": "user", "content": user_msg},
                ],
                "temperature": 0.1,
                "max_tokens": 1024,
                "response_format": {"type": "json_object"},
            },
        )
        resp.raise_for_status()
        data = resp.json()

    content = data["choices"][0]["message"]["content"]
    parsed = _parse_llm_json(content)
    if not parsed:
        raise HTTPException(500, f"Failed to parse LLM response: {content[:200]}")

    return {
        "best_transcript": parsed.get("best_transcript", ""),
        "confidence": float(parsed.get("confidence", 0)),
        "reasoning": parsed.get("reasoning", ""),
        "chosen_provider": parsed.get("chosen_provider", "corrected"),
        "consensus_providers": parsed.get("consensus_providers", []),
        "providers_used": list(transcriptions.keys()),
        "model": _GROQ_REVIEW_MODEL,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def _get_entry_transcriptions(entry: dict) -> dict:
    """Extract all non-empty transcriptions from a crossval entry."""
    provider_keys = ["voxtral", "groq_turbo", "groq_full", "deepgram", "assemblyai", "nvidia"]
    return {k: entry.get(k) for k in provider_keys if entry.get(k) and entry.get(k).strip()}


@router.post("/crossval/review/{index}")
async def crossval_review(index: int):
    """AI review a single pair by index — uses all available providers."""
    entries = _read_crossval()
    if index < 0 or index >= len(entries):
        raise HTTPException(404, f"Index {index} out of range")

    entry = entries[index]
    if entry.get("status") != "needs_review":
        raise HTTPException(400, "Only needs_review pairs can be reviewed")

    transcriptions = _get_entry_transcriptions(entry)
    if len(transcriptions) < 2:
        raise HTTPException(400, f"Need at least 2 transcriptions, got {len(transcriptions)}")

    review = await _call_groq_review(transcriptions)
    entries[index]["ai_review"] = review
    _write_crossval(entries)

    return {"index": index, "ai_review": review}


@router.post("/crossval/review-batch")
async def crossval_review_batch():
    """AI review all needs_review pairs using ALL available providers. Streams SSE progress."""
    entries = _read_crossval()
    todo = [
        (i, e) for i, e in enumerate(entries)
        if e.get("status") == "needs_review" and "ai_review" not in e
    ]

    async def event_stream():
        reviewed = 0
        errors = 0
        yield f"data: {json.dumps({'type': 'start', 'total': len(todo)})}\n\n"

        for idx, entry in todo:
            try:
                transcriptions = _get_entry_transcriptions(entry)
                if len(transcriptions) < 2:
                    errors += 1
                    yield f"data: {json.dumps({'type': 'error', 'index': idx, 'error': f'Skip: only {len(transcriptions)} transcriptions'}, ensure_ascii=False)}\n\n"
                    continue

                review = await _call_groq_review(transcriptions)
                # Re-read to avoid overwriting concurrent changes
                current = _read_crossval()
                current[idx]["ai_review"] = review
                _write_crossval(current)
                reviewed += 1

                ref = _extract_audio_ref(entry.get("audio_path", ""))
                yield f"data: {json.dumps({'type': 'progress', 'reviewed': reviewed, 'errors': errors, 'total': len(todo), 'index': idx, 'base_name': ref['base_name'], 'ai_review': review}, ensure_ascii=False)}\n\n"

            except Exception as e:
                errors += 1
                yield f"data: {json.dumps({'type': 'error', 'index': idx, 'error': str(e)}, ensure_ascii=False)}\n\n"

            # Rate limit: 1 req/sec for Groq
            await asyncio.sleep(1.0)

        yield f"data: {json.dumps({'type': 'done', 'reviewed': reviewed, 'errors': errors, 'total': len(todo)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/crossval/review-recompute")
async def crossval_review_recompute():
    """Re-run AI review on all needs_review pairs that have more providers now than when first reviewed.
    
    Compares providers_used in existing ai_review against currently available transcriptions.
    Re-reviews entries where new providers became available (deepgram, assemblyai, nvidia).
    """
    entries = _read_crossval()
    todo = []
    for i, e in enumerate(entries):
        if e.get("status") != "needs_review":
            continue
        review = e.get("ai_review")
        if not review:
            # Never reviewed at all — skip, handled by review-batch
            continue
        # Check if we have more providers now than when reviewed
        used_providers = set(review.get("providers_used", []))
        current_transcriptions = _get_entry_transcriptions(e)
        current_providers = set(current_transcriptions.keys())
        new_providers = current_providers - used_providers
        if new_providers:
            todo.append((i, e, list(new_providers)))

    async def event_stream():
        reviewed = 0
        errors = 0
        yield f"data: {json.dumps({'type': 'start', 'total': len(todo), 'message': f'Re-reviewing {len(todo)} entries with new providers'})}\n\n"

        for idx, entry, new_provs in todo:
            try:
                transcriptions = _get_entry_transcriptions(entry)
                if len(transcriptions) < 2:
                    errors += 1
                    continue

                review = await _call_groq_review(transcriptions)
                current = _read_crossval()
                current[idx]["ai_review"] = review
                _write_crossval(current)
                reviewed += 1

                ref = _extract_audio_ref(entry.get("audio_path", ""))
                yield f"data: {json.dumps({'type': 'progress', 'reviewed': reviewed, 'errors': errors, 'total': len(todo), 'index': idx, 'base_name': ref['base_name'], 'new_providers': new_provs, 'ai_review': review}, ensure_ascii=False)}\n\n"

            except Exception as e:
                errors += 1
                yield f"data: {json.dumps({'type': 'error', 'index': idx, 'error': str(e)}, ensure_ascii=False)}\n\n"

            await asyncio.sleep(1.0)

        yield f"data: {json.dumps({'type': 'done', 'reviewed': reviewed, 'errors': errors, 'total': len(todo)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
