"""Response schemas for cron endpoints."""

from typing import Any, Optional
from pydantic import BaseModel, Field


class CronJob(BaseModel):
    """A cron job entry."""
    id: str = ""
    schedule: str = ""
    prompt: str = ""
    name: str = ""
    enabled: bool = True
    last_run: Optional[str] = None

    model_config = {"extra": "allow"}


class CronJobCreateResponse(BaseModel):
    """Response after creating a cron job."""
    status: str = "created"
    output: str = ""


class CronJobActionResponse(BaseModel):
    """Response after cron job action (pause/resume/run/delete)."""
    status: str = ""
    output: str = ""


class CrontabEntry(BaseModel):
    """A system crontab entry."""
    schedule: str = ""
    command: str = ""
    name: str = ""


class SystemdTimer(BaseModel):
    """A systemd timer entry."""
    name: str = ""
    next_run: str = ""
    last_run: str = ""


class SystemdService(BaseModel):
    """A systemd service status."""
    name: str = ""
    status: str = ""
    kind: str = ""


class SystemCronResponse(BaseModel):
    """System-level cron/timer/service data."""
    crontab: list[CrontabEntry] = Field(default_factory=list)
    systemd_timers: list[SystemdTimer] = Field(default_factory=list)
    systemd_services: list[SystemdService] = Field(default_factory=list)
