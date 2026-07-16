"""Pydantic schemas for auth and API token endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"


class Principal(BaseModel):
    """Authenticated caller: operator (JWT) or machine (API token)."""

    kind: Literal["user", "machine"]
    operator_id: UUID | None = None
    username: str | None = None
    api_token_id: UUID | None = None
    api_token_name: str | None = None


class ApiTokenCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)


class ApiTokenCreated(BaseModel):
    """Returned only on create — includes plaintext token once."""

    id: UUID
    name: str
    token: str


class ApiTokenOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    created_at: datetime
    revoked_at: datetime | None = None
