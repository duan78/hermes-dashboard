"""Response schemas for config endpoints."""

from pydantic import BaseModel, Field


class ConfigResponse(BaseModel):
    """Config YAML response."""
    yaml: str = ""


class ConfigSectionsResponse(BaseModel):
    """Config sections response."""
    sections: list[str] = Field(default_factory=list)
    toolsets: list[str] = Field(default_factory=list)

    model_config = {"extra": "allow"}


class ConfigSetResponse(BaseModel):
    """Response after setting a config value."""
    status: str = "ok"
    key: str = ""
