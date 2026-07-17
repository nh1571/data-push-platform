"""任务执行相关 API 的 Pydantic schema（触发运行、JobRun 详情等）。"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PushJobRunRequest(BaseModel):
    """``POST /api/v1/push-jobs/{id}/run`` 请求体。"""

    params: dict[str, Any] | None = None
    trigger_type: str = Field(default="manual", min_length=1, max_length=32)


class JobRunOut(BaseModel):
    """JobRun 列表/触发接口的精简表示。"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    push_job_id: UUID
    status: str
    trigger_type: str
    trigger_meta: dict[str, Any] | None = None
    params: dict[str, Any] | None = None
    config_snapshot: dict[str, Any] | None = None
    parent_run_id: UUID | None = None
    started_at: datetime
    finished_at: datetime | None = None
    error_message: str | None = None
    created_at: datetime


class DeliveryOut(BaseModel):
    """单次 JobRun 内对某一渠道的投递记录。"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    job_run_id: UUID
    channel_id: UUID | None = None
    status: str
    error_message: str | None = None
    provider_msg_id: str | None = None
    started_at: datetime
    finished_at: datetime | None = None


class JobRunLogOut(BaseModel):
    """JobRun 结构化日志行。"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    job_run_id: UUID
    step: str
    level: str
    message: str
    created_at: datetime


class JobRunDetailOut(JobRunOut):
    """详情接口：JobRun + 嵌套 deliveries / logs。"""

    deliveries: list[DeliveryOut] = Field(default_factory=list)
    logs: list[JobRunLogOut] = Field(default_factory=list)
