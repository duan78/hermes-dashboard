"""Response schemas for gateway endpoints."""

from typing import Any, Optional
from pydantic import BaseModel, Field


class GatewayStatus(BaseModel):
    """Gateway service status."""
    state: str = "unknown"
    pid: Optional[int] = None
    memory_current_mb: Optional[float] = None
    memory_peak_mb: Optional[float] = None
    cpu_seconds: Optional[float] = None
    uptime: Optional[str] = None
    tasks: Optional[int] = None
    service_loaded: bool = False
    service_enabled: bool = False


class GatewayActionResponse(BaseModel):
    """Response after gateway action (restart/start/stop)."""
    status: str = ""
    new_state: Optional[str] = None


class LogEntry(BaseModel):
    """A single parsed log entry."""
    timestamp: str = ""
    level: str = "INFO"
    logger: str = ""
    message: str = ""


class GatewayLogsResponse(BaseModel):
    """Gateway logs response."""
    logs: list[LogEntry] = Field(default_factory=list)
    total_lines: int = 0
    filtered: int = 0
    error: Optional[str] = None
