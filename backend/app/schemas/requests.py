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


# ── Skills ──

class SkillActionRequest(BaseModel):
    name: str = Field(..., min_length=1, description="Skill name")


# ── Claude Code ──

class ClaudeCodeSessionRequest(BaseModel):
    session: str = Field(..., min_length=1, description="Tmux session name")


class ClaudeCodeSendRequest(BaseModel):
    session: str = Field(..., min_length=1, description="Tmux session name")
    message: str = Field(..., min_length=1, description="Message to send")


class ClaudeCodeNewRequest(BaseModel):
    name: str = Field("claude-session", description="Session name")
    workdir: str = Field("", description="Working directory")


# ── Platforms / Pairing ──

class PairingApproveRequest(BaseModel):
    code: str = Field(..., min_length=1, description="Pairing code to approve")


class PairingRevokeRequest(BaseModel):
    user_id: str = Field(..., min_length=1, description="User ID to revoke")


class PlatformConfigureRequest(BaseModel):
    platform: str = Field(..., min_length=1, description="Platform name")
    vars: dict = Field(default_factory=dict, description="Env vars to set")


# ── Fine-tune ──

class TranscriptUpdateRequest(BaseModel):
    transcript: str = Field("", description="Transcript content")


class CrossvalStatusRequest(BaseModel):
    status: str = Field(..., description="New status: 'validated' or 'needs_review'")


# ── Config (flexible YAML endpoints) ──

class YamlSaveRequest(BaseModel):
    yaml: str = Field(..., min_length=1, description="YAML content to save")


class MoaConfigUpdateRequest(BaseModel):
    """Flexible MOA config update — accepts any valid MOA fields."""
    model_config = {"extra": "allow"}


class MoaProvidersUpdateRequest(BaseModel):
    """Providers dict — validated in the router."""
    model_config = {"extra": "allow"}


# ── Provider Routing ──

class ProviderCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, description="Provider name (unique key)")
    api: str = Field("", description="API base URL")
    default_model: str = Field("", description="Default model for this provider")
    transport: str = Field("chat_completions", description="Transport type")


class ProviderUpdateRequest(BaseModel):
    provider: Optional[str] = Field(None, description="Provider name")
    api: Optional[str] = Field(None, description="API base URL")
    default_model: Optional[str] = Field(None, description="Default model name")
    model: Optional[str] = Field(None, description="Model name (alias for default_model)")
    transport: Optional[str] = Field(None, description="Transport type")
    base_url: Optional[str] = Field(None, description="Base URL (alias for api)")
    context_length: Optional[int] = Field(None, description="Context length")


class ProviderTestRequest(BaseModel):
    provider: str = Field(..., min_length=1, description="Provider name to test")
    base_url: Optional[str] = Field(None, description="Override base URL")
    api_key_env: Optional[str] = Field(None, description="API key env var name")
    model: Optional[str] = Field(None, description="Override model name")


# ── System Prompt ──

class CustomPromptRequest(BaseModel):
    content: str = Field("", description="Custom prompt content (JSON or text)")


# ── Personalities ──

class PersonalityCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, description="Personality name (unique key)")
    system_prompt: str = Field(..., min_length=1, description="System prompt for this personality")
    description: str = Field("", description="Optional description")
    tone: str = Field("", description="Optional tone")
    style: str = Field("", description="Optional style")


class PersonalityDeleteRequest(BaseModel):
    name: str = Field(..., min_length=1, description="Personality name to delete")
