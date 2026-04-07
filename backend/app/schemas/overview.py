"""Response schemas for overview endpoints."""

from typing import Any, Optional
from pydantic import BaseModel, Field


class GatewayInfo(BaseModel):
    """Gateway state info."""
    state: str = "unknown"
    pid: Optional[int] = None
    platforms: dict = Field(default_factory=dict)


class ModelInfo(BaseModel):
    """Active model info."""
    name: str = "unknown"
    provider: str = "unknown"


class SessionsOverview(BaseModel):
    """Sessions summary for overview."""
    total: int = 0
    active: int = 0
    messages: int = 0


class OverviewStats(BaseModel):
    """Dashboard overview response."""
    gateway: Optional[GatewayInfo] = None
    model: Optional[ModelInfo] = None
    sessions: SessionsOverview = Field(default_factory=SessionsOverview)
    skills_installed: int = 0
    cron_active: int = 0
    platforms: dict[str, str] = Field(default_factory=dict)
    uptime_seconds: Optional[int] = None


class LogResponse(BaseModel):
    """Log entries response."""
    logs: list[str] = Field(default_factory=list)
    error: Optional[str] = None


class SystemMetrics(BaseModel):
    """System metrics response."""
    cpu_percent: float = 0
    ram_total_gb: float = 0
    ram_used_gb: float = 0
    ram_percent: float = 0
    disk_total_gb: float = 0
    disk_used_gb: float = 0
    disk_percent: float = 0
    load_avg: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])


class ChangelogCommit(BaseModel):
    """A single changelog commit."""
    hash: str = ""
    message: str = ""


class ChangelogResponse(BaseModel):
    """Changelog response."""
    commits: list[ChangelogCommit] = Field(default_factory=list)
    total_behind: int = 0
    error: Optional[str] = None


class VersionInfo(BaseModel):
    """Hermes version info response."""
    current_version: str = ""
    version_date: str = ""
    project_path: str = ""
    python_version: str = ""
    openai_sdk_version: str = ""
    update_available: bool = False
    commits_behind: int = 0
    raw: str = ""
    error: Optional[str] = None


class UpdateResponse(BaseModel):
    """Hermes update response."""
    success: bool = False
    output: str = ""
    error: str = ""
