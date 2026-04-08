"""Request models for API validation."""

from typing import Any, Optional
from pydantic import BaseModel, Field


# ── Config ──

class ConfigSetRequest(BaseModel):
    key: str = Field(..., min_length=1, description="Dot-notation config key")
    value: Any = Field(..., description="Value to set")


class ConfigSaveRequest(BaseModel):
    content: str = Field(..., description="YAML config content")


class StructuredConfigRequest(BaseModel):
    """Accepts any dict for structured config updates."""
    model_config = {"extra": "allow"}


class ConfigValueUpdateRequest(BaseModel):
    key: str = Field(..., min_length=1, description="Dot-notation config key")
    value: Any = Field(..., description="New value")


class MoaConfigSaveRequest(BaseModel):
    content: str = Field(..., description="MOA config YAML or JSON content")


class MoaProvidersSaveRequest(BaseModel):
    providers: list[dict] = Field(default_factory=list, description="Provider configurations")


class MoaProviderTestRequest(BaseModel):
    provider: str = Field(..., min_length=1, description="Provider name to test")
    prompt: str = Field("", description="Test prompt")


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


# ── Memory ──

class ContentSaveRequest(BaseModel):
    content: str = Field("", description="File content")


class MemoryFileSaveRequest(BaseModel):
    path: str = Field(..., min_length=1, description="Relative path within ~/.hermes/")
    content: str = Field("", description="File content")


class MemoryFileCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, description="File name (will be sanitized)")


class MemoryFileDeleteRequest(BaseModel):
    path: str = Field(..., min_length=1, description="Relative path to delete")


class VectorStoreRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Text to store")
    source: str = Field("manual", description="Source label")
    metadata: Optional[dict] = Field(None, description="Optional metadata")


class VectorDeleteRequest(BaseModel):
    memory_id: str = Field(..., min_length=1, description="Memory ID to delete")


# ── Files ──

class FileWriteRequest(BaseModel):
    path: str = Field(..., min_length=1, description="Relative path under HERMES_HOME")
    content: str = Field("", description="File content")


# ── Webhooks ──

class WebhookCreateRequest(BaseModel):
    url: str = Field(..., min_length=1, description="Webhook URL")
    events: list[str] = Field(default_factory=list, description="Event types")


class WebhookDeleteRequest(BaseModel):
    url: str = Field(..., min_length=1, description="Webhook URL to delete")


# ── Tools ──

class ToolEnvRequest(BaseModel):
    key: str = Field(..., min_length=1, description="Environment variable name")
    value: str = Field("", description="Variable value")
    config_key: Optional[str] = Field(None, description="Optional config.yaml key to update")
    config_value: Optional[str] = Field(None, description="Config value if config_key set")


class ToolToggleRequest(BaseModel):
    tool: str = Field(..., min_length=1, description="Tool name")
    platform: str = Field("cli", description="Platform name")


# ── Models ──

class ModelSwitchRequest(BaseModel):
    model: str = Field(..., min_length=1, description="Model name to switch to")
    provider: Optional[str] = Field(None, description="Provider name")


# ── Platforms / Pairing ──

class PairingActionRequest(BaseModel):
    code: str = Field(..., min_length=1, description="Pairing code")


class PlatformConfigRequest(BaseModel):
    platform: str = Field(..., min_length=1, description="Platform name")
    config: dict = Field(default_factory=dict, description="Platform configuration")


# ── Skills ──

class SkillActionRequest(BaseModel):
    name: str = Field(..., min_length=1, description="Skill name")


# ── Claude Code ──

class ClaudeCodeSessionRequest(BaseModel):
    session_id: str = Field(..., min_length=1, description="Session ID")


class ClaudeCodeSendRequest(BaseModel):
    session_id: str = Field(..., min_length=1, description="Session ID")
    message: str = Field(..., min_length=1, description="Message to send")


class ClaudeCodeNewRequest(BaseModel):
    prompt: str = Field("", description="Initial prompt")
    working_dir: str = Field("", description="Working directory")
