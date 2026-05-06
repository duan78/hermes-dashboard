"""MCP StreamableHTTP server exposing the MOA (Mixture-of-Agents) engine.

Mounted at /api/mcp/moa so Hermes Agent can call `mixture_of_agents` as an MCP tool.
"""

import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import yaml
from mcp.server.fastmcp import FastMCP

logger = logging.getLogger(__name__)

mcp = FastMCP(
    "hermes-dashboard-moa",
    streamable_http_path="/",
    stateless_http=True,
)


def _load_hermes_config() -> dict:
    """Load the Hermes config.yaml."""
    config_path = Path.home() / ".hermes" / "config.yaml"
    if not config_path.exists():
        return {}
    return yaml.safe_load(config_path.read_text()) or {}


@mcp.tool()
async def mixture_of_agents(
    prompt: str,
    reference_models: Optional[list[str]] = None,
    aggregator_model: Optional[str] = None,
) -> str:
    """Run a Mixture-of-Agents query through multiple LLM models.

    Sends the prompt to several reference models in parallel, then synthesizes
    their responses into a single high-quality answer using an aggregator model.

    Args:
        prompt: The question or instruction to process.
        reference_models: Optional list of model names to use as proposers.
                         Overrides the dashboard MOA config if provided.
        aggregator_model: Optional model name for the synthesis step.
                         Overrides the dashboard MOA config if provided.

    Returns:
        JSON string with: response, models_used, timing, proposer_results.
    """
    from .services.moa_engine import run_moa

    raw = _load_hermes_config()
    moa_config = raw.get("moa", {})
    providers = raw.get("moa_providers", {})

    # Apply overrides
    if reference_models is not None:
        moa_config["reference_models"] = reference_models
    if aggregator_model is not None:
        moa_config["aggregator_model"] = aggregator_model

    result = await run_moa(prompt=prompt, config=moa_config, providers=providers)
    return json.dumps(result, default=str)


# Build the Starlette app — this also creates session_manager lazily
mcp_app = mcp.streamable_http_app()


async def start_mcp_session():
    """Start the MCP session manager task group. Call during app startup."""
    _session_cm = mcp.session_manager.run()
    await _session_cm.__aenter__()
    return _session_cm


async def stop_mcp_session(cm):
    """Stop the MCP session manager. Call during app shutdown."""
    await cm.__aexit__(None, None, None)
