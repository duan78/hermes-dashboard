"""Benchmark router — test and compare LLM response times + quality."""

import asyncio
import json
import logging
import math
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import HERMES_HOME

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/benchmark", tags=["benchmark"])

HISTORY_DIR = HERMES_HOME / "benchmark" / "history"
JUDGE_MODEL = "gemma4:31b"
JUDGE_TIMEOUT = 60
CALL_TIMEOUT = 60
LLM_TIMEOUT = 120


def _get_env_value(key: str) -> str:
    val = os.environ.get(key, "")
    if val:
        return val
    env_path = HERMES_HOME / ".env"
    if env_path.exists():
        for line in env_path.read_text(errors="replace").splitlines():
            line = line.strip()
            if line.startswith(f"{key}="):
                return line[len(key) + 1 :].strip().strip("'\"")
    return ""


def _load_yaml_config() -> dict:
    import yaml

    cfg_path = HERMES_HOME / "config.yaml"
    if cfg_path.exists():
        try:
            return yaml.safe_load(cfg_path.read_text()) or {}
        except Exception as e:
            logger.warning("Error loading config.yaml: %s", e)
    return {}


def _ensure_history_dir():
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)


# ── Models ──


class BenchmarkModel(BaseModel):
    provider: str
    model: str
    base_url: str = ""
    api_key_env: str = ""


class BenchmarkRequest(BaseModel):
    models: list[BenchmarkModel]
    prompt: str
    runs: int = 3
    judge_enabled: bool = True


# ── Helpers ──


def _get_api_key(provider: str, api_key_env: str) -> str:
    if api_key_env:
        key = _get_env_value(api_key_env)
        if key:
            return key
    # Fallbacks per provider
    if provider == "ollama-cloud":
        return _get_env_value("OLLAMA_API_KEY")
    if provider == "zai":
        config = _load_yaml_config()
        key = config.get("providers", {}).get("zai", {}).get("api_key", "")
        if not key:
            key = config.get("model", {}).get("api_key", "")
        if key:
            return key
        return _get_env_value("ZAI_API_KEY") or _get_env_value("Z_AI_API_KEY")
    if provider == "mistral":
        return _get_env_value("MISTRAL_API_KEY")
    return ""


async def _call_llm(base_url: str, api_key: str, model: str, messages: list, timeout: int = CALL_TIMEOUT) -> dict:
    """Call an OpenAI-compatible chat completion endpoint."""
    payload = {"model": model, "messages": messages, "max_tokens": 512}
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(f"{base_url}/chat/completions", headers=headers, json=payload)
        if resp.status_code != 200:
            raise HTTPException(502, f"LLM API error ({resp.status_code}): {resp.text[:300]}")
        data = resp.json()
        content = data["choices"][0]["message"].get("content", "")
        if not content:
            content = data["choices"][0]["message"].get("reasoning_content", "")
        return {"content": content, "usage": data.get("usage", {})}


async def _judge_response(judge_api_key: str, prompt: str, response: str) -> dict:
    """Use gemma4:31b as LLM Judge to score quality."""
    judge_prompt = f"""Tu es un juge impartial qui évalue des réponses de LLM. Évalue la réponse suivante sur 3 critères de 1 à 10 :

1. **Précision** : La réponse est-elle factuellement correcte ?
2. **Complétude** : La réponse couvre-t-elle bien le sujet ?
3. **Clarté** : La réponse est-elle claire et bien structurée ?

**Question posée** : {prompt}

**Réponse à évaluer** : {response}

Réponds UNIQUEMENT en JSON avec ce format exact, sans autre texte :
{{"precision": X, "completude": X, "clarte": X, "commentaire": "commentaire court"}}"""

    try:
        result = await _call_llm(
            "https://ollama.com/v1",
            judge_api_key,
            JUDGE_MODEL,
            [{"role": "user", "content": judge_prompt}],
            timeout=JUDGE_TIMEOUT,
        )
        text = result["content"].strip()
        # Extract JSON from response (may have markdown fences)
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        scores = json.loads(text.strip())
        return {
            "precision": int(scores.get("precision", 5)),
            "completude": int(scores.get("completude", 5)),
            "clarte": int(scores.get("clarte", 5)),
            "commentaire": scores.get("commentaire", ""),
        }
    except Exception as e:
        logger.warning("Judge scoring failed: %s", e)
        return {"precision": 5, "completude": 5, "clarte": 5, "commentaire": f"Judge error: {e}"}


def _compute_std_dev(times: list[float]) -> float:
    if len(times) < 2:
        return 0.0
    mean = sum(times) / len(times)
    return round(math.sqrt(sum((t - mean) ** 2 for t in times) / len(times)), 3)


# ── Endpoints ──


@router.get("/providers")
async def get_providers():
    """Auto-detect configured providers and list their models."""
    import yaml

    config = _load_yaml_config()
    providers = []

    # ── Ollama Cloud ──
    ollama_key = _get_env_value("OLLAMA_API_KEY")
    if ollama_key:
        models = []
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    "https://ollama.com/v1/models",
                    headers={"Authorization": f"Bearer {ollama_key}"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    for m in data.get("data", []):
                        model_id = m.get("id", "")
                        size = m.get("size")
                        models.append({"id": model_id, "size": size})
                    models.sort(key=lambda x: x["id"])
        except Exception as e:
            logger.warning("Failed to fetch Ollama models: %s", e)

        providers.append({
            "name": "ollama-cloud",
            "base_url": "https://ollama.com/v1",
            "api_key_env": "OLLAMA_API_KEY",
            "api_key_set": True,
            "models": models,
        })

    # ── Z.AI ──
    zai_key = config.get("providers", {}).get("zai", {}).get("api_key", "")
    if not zai_key:
        zai_key = config.get("model", {}).get("api_key", "")
    if not zai_key:
        zai_key = _get_env_value("ZAI_API_KEY") or _get_env_value("Z_AI_API_KEY")
    zai_base = config.get("providers", {}).get("zai", {}).get("api", "https://api.z.ai/api/coding/paas/v4")
    if zai_key:
        models = []
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f"{zai_base}/models",
                    headers={"Authorization": f"Bearer {zai_key}"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    for m in data.get("data", []):
                        models.append({"id": m.get("id", "")})
                    models.sort(key=lambda x: x["id"])
        except Exception as e:
            logger.warning("Failed to fetch Z.AI models: %s", e)

        providers.append({
            "name": "zai",
            "base_url": zai_base,
            "api_key_env": "ZAI_API_KEY",
            "api_key_set": True,
            "models": models,
        })

    # ── Mistral ──
    mistral_key = _get_env_value("MISTRAL_API_KEY")
    if mistral_key:
        models = []
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    "https://api.mistral.ai/v1/models",
                    headers={"Authorization": f"Bearer {mistral_key}"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    for m in data.get("data", []):
                        models.append({"id": m.get("id", "")})
                    models.sort(key=lambda x: x["id"])
        except Exception as e:
            logger.warning("Failed to fetch Mistral models: %s", e)

        providers.append({
            "name": "mistral",
            "base_url": "https://api.mistral.ai/v1",
            "api_key_env": "MISTRAL_API_KEY",
            "api_key_set": True,
            "models": models,
        })

    return {"providers": providers}


async def _run_single(bm: BenchmarkModel, prompt: str, run_idx: int) -> tuple[int, float, str | None, str | None]:
    """Execute a single LLM call. Returns (run_idx, elapsed, content, error)."""
    logger.info("benchmark run start: %s/%s run %d", bm.provider, bm.model, run_idx)
    api_key = _get_api_key(bm.provider, bm.api_key_env)
    resolved_url = bm.base_url
    if not resolved_url:
        default_urls = {
            "ollama-cloud": "https://ollama.com/v1",
            "zai": "https://api.z.ai/api/coding/paas/v4",
            "mistral": "https://api.mistral.ai/v1",
        }
        resolved_url = default_urls.get(bm.provider, "")
        if not resolved_url:
            config = _load_yaml_config()
            provider_cfg = config.get("providers", {}).get(bm.provider, {})
            resolved_url = provider_cfg.get("api", "")
    if not resolved_url:
        logger.info("benchmark run fail: %s/%s run %d — no base_url", bm.provider, bm.model, run_idx)
        return (run_idx, 0.0, None, f"Cannot determine base_url for provider '{bm.provider}'")
    try:
        start = time.time()
        result = await asyncio.wait_for(
            _call_llm(
                resolved_url, api_key, bm.model,
                [{"role": "user", "content": prompt}],
            ),
            timeout=LLM_TIMEOUT,
        )
        elapsed = round(time.time() - start, 3)
        logger.info("benchmark run done: %s/%s run %d — %.3fs", bm.provider, bm.model, run_idx, elapsed)
        return (run_idx, elapsed, result["content"], None)
    except asyncio.TimeoutError:
        logger.warning("benchmark run timeout: %s/%s run %d — exceeded %ds", bm.provider, bm.model, run_idx, LLM_TIMEOUT)
        return (run_idx, 0.0, None, f"Timeout after {LLM_TIMEOUT}s")
    except Exception as e:
        logger.warning("benchmark run fail: %s/%s run %d: %s", bm.provider, bm.model, run_idx, e)
        return (run_idx, 0.0, None, str(e))


async def _benchmark_model(bm: BenchmarkModel, prompt: str, runs: int, judge_enabled: bool, judge_api_key: str) -> dict:
    """Run all runs for one model in parallel, then optional judge scoring."""
    logger.info("benchmark model start: %s/%s (%d runs)", bm.provider, bm.model, runs)

    # Launch all runs in parallel
    run_tasks = [_run_single(bm, prompt, i) for i in range(runs)]
    run_results = await asyncio.gather(*run_tasks)

    # Collect results in run order
    times: list[float] = []
    responses: list[str] = []
    error: str | None = None

    for run_idx, elapsed, content, err in sorted(run_results, key=lambda x: x[0]):
        if err is not None:
            error = err
            continue
        times.append(elapsed)
        responses.append(content)

    if not times:
        logger.info("benchmark model fail: %s/%s — %s", bm.provider, bm.model, error or "All calls failed")
        return {
            "model": bm.model,
            "provider": bm.provider,
            "error": error or "All calls failed",
            "times": [],
            "responses": [],
            "avg_time": None,
            "min_time": None,
            "max_time": None,
            "std_dev": None,
            "quality_score": None,
            "quality_detail": None,
            "composite_score": None,
        }

    avg_time = round(sum(times) / len(times), 3)
    min_time = round(min(times), 3)
    max_time = round(max(times), 3)
    std_dev = _compute_std_dev(times)

    quality_score = None
    quality_detail = None

    if judge_enabled and judge_api_key and responses:
        quality_detail = await _judge_response(judge_api_key, prompt, responses[0])
        quality_score = round(
            (quality_detail["precision"] + quality_detail["completude"] + quality_detail["clarte"]) / 3, 2
        )

    logger.info("benchmark model done: %s/%s — avg %.3fs, quality %s", bm.provider, bm.model, avg_time, quality_score)

    return {
        "model": bm.model,
        "provider": bm.provider,
        "times": times,
        "responses": responses,
        "avg_time": avg_time,
        "min_time": min_time,
        "max_time": max_time,
        "std_dev": std_dev,
        "quality_score": quality_score,
        "quality_detail": quality_detail,
        "composite_score": None,
        "error": None,
    }


@router.post("/run")
async def run_benchmark(req: BenchmarkRequest):
    """Run benchmark: N calls per model, optional LLM Judge scoring."""
    if not req.models:
        raise HTTPException(400, "No models selected")
    if not req.prompt.strip():
        raise HTTPException(400, "Prompt is empty")

    judge_api_key = _get_env_value("OLLAMA_API_KEY") if req.judge_enabled else ""

    # Run all models in parallel — each model runs its N runs in parallel internally
    model_tasks = [
        _benchmark_model(bm, req.prompt, req.runs, req.judge_enabled, judge_api_key)
        for bm in req.models
    ]
    results = list(await asyncio.gather(*model_tasks))

    # ── Compute composite scores ──
    valid = [r for r in results if r["avg_time"] is not None]
    if valid:
        max_avg = max(r["avg_time"] for r in valid)
        if max_avg == 0:
            max_avg = 0.001

        for r in valid:
            speed_score = (max_avg / r["avg_time"]) * 10 if r["avg_time"] > 0 else 10
            speed_score = min(speed_score, 10)

            if r["quality_score"] is not None:
                quality_normalized = r["quality_score"]
            else:
                quality_normalized = 5.0  # neutral if no judge

            composite = round(0.7 * speed_score + 0.3 * quality_normalized, 2)
            r["composite_score"] = composite

    # Rank by composite score desc
    ranking = sorted(valid, key=lambda x: x["composite_score"] or 0, reverse=True)
    for i, r in enumerate(ranking):
        r["rank"] = i + 1

    # ── Save to history ──
    _ensure_history_dir()
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    filename = f"bench_{ts}.json"
    record = {
        "timestamp": ts,
        "prompt": req.prompt,
        "runs": req.runs,
        "judge_enabled": req.judge_enabled,
        "results": results,
        "ranking": [{"rank": r["rank"], "model": r["model"], "provider": r["provider"], "composite_score": r["composite_score"]} for r in ranking],
    }
    (HISTORY_DIR / filename).write_text(json.dumps(record, ensure_ascii=False, indent=2))

    return {"results": results, "ranking": ranking}


@router.get("/history")
async def get_history():
    """List past benchmark runs (newest first, max 20)."""
    _ensure_history_dir()
    files = sorted(HISTORY_DIR.glob("bench_*.json"), reverse=True)[:20]
    history = []
    for f in files:
        try:
            data = json.loads(f.read_text())
            history.append({
                "filename": f.name,
                "timestamp": data.get("timestamp", ""),
                "prompt": data.get("prompt", "")[:80],
                "runs": data.get("runs", 0),
                "model_count": len(data.get("results", [])),
                "ranking": data.get("ranking", []),
            })
        except Exception:
            continue
    return {"history": history}


@router.get("/history/{filename}")
async def get_history_detail(filename: str):
    """Load a specific benchmark from history."""
    # Sanitize filename
    if "/" in filename or ".." in filename:
        raise HTTPException(400, "Invalid filename")
    path = HISTORY_DIR / filename
    if not path.exists():
        raise HTTPException(404, "Benchmark not found")
    return json.loads(path.read_text())


@router.delete("/history/{filename}")
async def delete_history(filename: str):
    """Delete a benchmark from history."""
    if "/" in filename or ".." in filename:
        raise HTTPException(400, "Invalid filename")
    path = HISTORY_DIR / filename
    if not path.exists():
        raise HTTPException(404, "Benchmark not found")
    path.unlink()
    return {"status": "ok"}
