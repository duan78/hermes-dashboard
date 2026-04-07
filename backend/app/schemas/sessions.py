"""Response schemas for sessions endpoints."""

from typing import Any, Optional
from pydantic import BaseModel, Field


class SessionSummary(BaseModel):
    """Summary of a session for listing."""
    id: str = ""
    model: str = "unknown"
    platform: str = "unknown"
    created: str = ""
    messages_count: int = 0
    tokens: dict = Field(default_factory=dict)
    preview: str = ""


class SessionSearchResult(BaseModel):
    """Session search result with match info."""
    id: str = ""
    model: str = "unknown"
    platform: str = "unknown"
    created: str = ""
    messages_count: int = 0
    preview: str = ""
    matched_in: list[str] = Field(default_factory=list)
    snippet: str = ""


class SessionMessage(BaseModel):
    """A single message in a session."""
    role: str = ""
    content: str = ""
    timestamp: Optional[str] = None
    tool_calls: Optional[list[dict]] = None

    model_config = {"extra": "allow"}


class SessionDetail(BaseModel):
    """Full session detail with messages."""
    session_id: Optional[str] = None
    model: str = "unknown"
    platform: str = "unknown"
    messages: list[SessionMessage] = Field(default_factory=list)
    usage: Optional[dict] = None
    token_usage: Optional[dict] = None

    model_config = {"extra": "allow"}


class SessionStats(BaseModel):
    """Session statistics."""
    output: str = ""
    error: Optional[str] = None


class SessionExport(BaseModel):
    """Session export data."""
    format: str = ""
    data: str = ""
