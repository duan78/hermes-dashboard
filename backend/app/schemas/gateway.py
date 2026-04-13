"""Response schemas for gateway endpoints."""

from pydantic import BaseModel, Field


class GatewayStatus(BaseModel):
    """Gateway service status."""
    state: str = "unknown"
    pid: int | None = None
    memory_current_mb: float | None = None
    memory_peak_mb: float | None = None
    cpu_seconds: float | None = None
    uptime: str | None = None
    tasks: int | None = None
    service_loaded: bool = False
    service_enabled: bool = False


class GatewayActionResponse(BaseModel):
    """Response after gateway action (restart/start/stop)."""
    status: str = ""
    new_state: str | None = None


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
    error: str | None = None
