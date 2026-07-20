"""DataSource / Channel / PushJob 配置类 API 的 Pydantic v2 schema。"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Shared
# ---------------------------------------------------------------------------


class TestConnectionResult(BaseModel):
    """数据源/渠道 ``/test`` 连通性或配置校验结果。"""

    ok: bool
    message: str | None = None
    detail: Any | None = None


# ---------------------------------------------------------------------------
# DataSource
# ---------------------------------------------------------------------------


class DataSourceCreate(BaseModel):
    """创建数据源请求体。"""
    name: str = Field(..., min_length=1, max_length=128)
    type: str = Field(..., min_length=1, max_length=64)
    config: dict[str, Any]


class DataSourceUpdate(BaseModel):
    """更新数据源（部分字段可选）。"""
    name: str | None = Field(default=None, min_length=1, max_length=128)
    type: str | None = Field(default=None, min_length=1, max_length=64)
    config: dict[str, Any] | None = None


class DataSourceOut(BaseModel):
    """数据源响应（config 已脱敏）。"""
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
    """创建渠道请求体。"""
    name: str = Field(..., min_length=1, max_length=128)
    type: str = Field(..., min_length=1, max_length=64)
    config: dict[str, Any]


class ChannelUpdate(BaseModel):
    """更新渠道（部分字段可选）。"""
    name: str | None = Field(default=None, min_length=1, max_length=128)
    type: str | None = Field(default=None, min_length=1, max_length=64)
    config: dict[str, Any] | None = None


class ChannelOut(BaseModel):
    """渠道响应（config 已脱敏）。"""
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
    """完整创建推送任务请求体。"""
    name: str = Field(..., min_length=1, max_length=128)
    enabled: bool = True
    skip_if_empty: bool = False
    data_source_id: UUID
    query_sql: str = Field(..., min_length=1)
    render_spec: dict[str, Any] | list[Any]
    channel_ids: list[UUID] = Field(default_factory=list)
    push_target_ids: list[UUID] = Field(default_factory=list)
    schedule_cron: str | None = Field(default=None, max_length=128)
    schedule_enabled: bool = False


class PushJobDraftCreate(BaseModel):
    """创建草稿任务的最小载荷（随后在内容编辑器中完善）。"""

    name: str = Field(..., min_length=1, max_length=128)
    data_source_id: UUID
    enabled: bool = True


class PushJobUpdate(BaseModel):
    """更新推送任务（部分字段可选）。"""
    name: str | None = Field(default=None, min_length=1, max_length=128)
    enabled: bool | None = None
    skip_if_empty: bool | None = None
    data_source_id: UUID | None = None
    query_sql: str | None = Field(default=None, min_length=1)
    render_spec: dict[str, Any] | list[Any] | None = None
    channel_ids: list[UUID] | None = None
    push_target_ids: list[UUID] | None = None
    schedule_cron: str | None = None
    schedule_enabled: bool | None = None


class PushJobOut(BaseModel):
    """推送任务响应；列表可附带最近一次运行摘要。"""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    enabled: bool
    skip_if_empty: bool
    data_source_id: UUID
    query_sql: str
    render_spec: dict[str, Any] | list[Any]
    channel_ids: list[str]
    push_target_ids: list[str]
    schedule_cron: str | None
    schedule_enabled: bool
    created_at: datetime
    updated_at: datetime
    # Optional enrichment on list endpoint
    last_run_id: UUID | None = None
    last_run_status: str | None = None
    last_run_at: datetime | None = None
