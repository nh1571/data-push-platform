"""Pydantic schemas for job execution APIs."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PushJobRunRequest(BaseModel):
    """Body for ``POST /api/v1/push-jobs/{id}/run``."""

    params: dict[str, Any] | None = None
    trigger_type: str = Field(default="manual", min_length=1, max_length=32)


class JobRunOut(BaseModel):
    """Minimal job-run representation for run + get endpoints."""

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
