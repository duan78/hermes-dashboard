"""Pydantic models for request validation on critical endpoints."""

from typing import Any, Optional
from pydantic import BaseModel, Field


# ── Config ──

class ConfigSetRequest(BaseModel):
    key: str = Field(..., min_length=1, description="Dot-notation config key")
    value: Any = Field(..., description="Value to set")


class StructuredConfigRequest(BaseModel):
    """Accepts any dict for structured config updates."""
    model_config = {"extra": "allow"}


# ── API Keys ──

class ApiKeySetRequest(BaseModel):
    key: str = Field(..., min_length=1, description="Environment variable name")
    value: str = Field("", description="API key value")


class ApiKeyDeleteRequest(BaseModel):
    key: str = Field(..., min_length=1, description="Environment variable name")


class ApiKeyTestRequest(BaseModel):
    key: str = Field(..., min_length=1, description="API key name to test")


# ── Cron ──

class CronCreateRequest(BaseModel):
    schedule: str = Field(..., min_length=1, description="Cron schedule expression")
    prompt: str = Field(..., min_length=1, description="Prompt to execute")
    name: str = Field("", description="Optional job name")


# ── MCP ──

class McpAddRequest(BaseModel):
    name: str = Field(..., min_length=1, description="Server name")
    type: str = Field("stdio", description="Transport type: stdio or http")
    command: str = Field("", description="Command for stdio transport")
    url: str = Field("", description="URL for http transport")
    args: list[str] = Field(default_factory=list, description="Additional arguments")


class McpToggleRequest(BaseModel):
    enabled: bool = Field(True, description="Enable or disable the server")


class McpConfigUpdateRequest(BaseModel):
    config: dict = Field(default_factory=dict, description="Server configuration")


class McpNameRequest(BaseModel):
    name: str = Field(..., min_length=1, description="Server name")
