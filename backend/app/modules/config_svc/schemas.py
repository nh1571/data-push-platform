"""Pydantic v2 schemas for DataSource / Channel / PushJob config APIs."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Shared
# ---------------------------------------------------------------------------


class TestConnectionResult(BaseModel):
    """Outcome of a /test connection or channel validation call."""

    ok: bool
    message: str | None = None
    detail: Any | None = None


# ---------------------------------------------------------------------------
# DataSource
# ---------------------------------------------------------------------------


class DataSourceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    type: str = Field(..., min_length=1, max_length=64)
    config: dict[str, Any]


class DataSourceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    type: str | None = Field(default=None, min_length=1, max_length=64)
    config: dict[str, Any] | None = None


class DataSourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    type: str
    config: dict[str, Any]
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Channel
# ---------------------------------------------------------------------------


class ChannelCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    type: str = Field(..., min_length=1, max_length=64)
    config: dict[str, Any]


class ChannelUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    type: str | None = Field(default=None, min_length=1, max_length=64)
    config: dict[str, Any] | None = None


class ChannelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    type: str
    config: dict[str, Any]
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# PushJob
# ---------------------------------------------------------------------------


class PushJobCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    enabled: bool = True
    skip_if_empty: bool = False
    data_source_id: UUID
    query_sql: str = Field(..., min_length=1)
    render_spec: dict[str, Any] | list[Any]
    channel_ids: list[UUID]
    schedule_cron: str | None = Field(default=None, max_length=128)
    schedule_enabled: bool = False


class PushJobUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    enabled: bool | None = None
    skip_if_empty: bool | None = None
    data_source_id: UUID | None = None
    query_sql: str | None = Field(default=None, min_length=1)
    render_spec: dict[str, Any] | list[Any] | None = None
    channel_ids: list[UUID] | None = None
    schedule_cron: str | None = None
    schedule_enabled: bool | None = None


class PushJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    enabled: bool
    skip_if_empty: bool
    data_source_id: UUID
    query_sql: str
    render_spec: dict[str, Any] | list[Any]
    channel_ids: list[str]
    schedule_cron: str | None
    schedule_enabled: bool
    created_at: datetime
    updated_at: datetime
