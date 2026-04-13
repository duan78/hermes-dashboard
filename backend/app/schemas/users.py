"""User management request/response models."""

from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, pattern=r'^[a-zA-Z0-9_-]+$',
                          description="Alphanumeric username (3-50 chars)")
    password: str = Field(..., min_length=8, max_length=128, description="Password (min 8 chars)")
    display_name: str = Field("", max_length=100, description="Optional display name")


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, description="Username")
    password: str = Field(..., min_length=1, description="Password")


class UserActionRequest(BaseModel):
    user_id: str = Field(..., min_length=1, description="User ID to act on")


class RoleChangeRequest(BaseModel):
    user_id: str = Field(..., min_length=1, description="User ID")
    role: str = Field(..., pattern=r'^(admin|viewer)$', description="New role")
