"""Pydantic schemas for editor preview / test-push / save-job APIs."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.modules.config_svc.schemas import PushJobOut


class DesignSpec(BaseModel):
    """Lightweight message design used by the editor UI."""

    header_text: str | None = None
    footer_text: str | None = None
    include_markdown_table: bool = True
    extra_parts: list[str] = Field(default_factory=list)
    title: str | None = None
    # Image template mode (draft jobs set output_mode=image explicitly)
    output_mode: str | None = None  # "markdown" | "image"
    template_id: str | None = None  # report_v1 | alert_v1 | kpi_v1
    theme_color: str | None = None
    show_table: bool = True
    kpi_columns: list[str] = Field(default_factory=list)


class QueryPreviewRequest(BaseModel):
    data_source_id: UUID
    sql: str = Field(..., min_length=1)
    params: dict[str, Any] | None = None
    # Dataset param definitions (auto/static/runtime) — resolved before execute
    param_defs: list[dict[str, Any]] | None = None
    max_rows: int = Field(default=200, ge=1, le=10_000)


class QueryPreviewResponse(BaseModel):
    columns: list[str]
    rows: list[list[Any]]
    row_count: int
    resolved_params: dict[str, str] = Field(default_factory=dict)
    rendered_sql: str | None = None


class MessagePreviewRequest(BaseModel):
    data_source_id: UUID
    sql: str = Field(..., min_length=1)
    params: dict[str, Any] | None = None
    design: DesignSpec | dict[str, Any] = Field(default_factory=dict)
    max_rows: int = Field(default=200, ge=1, le=10_000)


class MessagePartPreview(BaseModel):
    kind: str
    content_preview: str


class MessagePreviewResponse(BaseModel):
    parts: list[MessagePartPreview]
    markdown_text: str


class ImagePreviewRequest(BaseModel):
    data_source_id: UUID
    sql: str = Field(..., min_length=1)
    params: dict[str, Any] | None = None
    design: DesignSpec | dict[str, Any] = Field(default_factory=dict)
    max_rows: int = Field(default=200, ge=1, le=10_000)


class ImagePreviewResponse(BaseModel):
    """PNG preview for template image mode (base64 data URL for easy <img>)."""

    image_base64: str
    path: str | None = None
    content_type: str = "image/png"


class TestPushRequest(BaseModel):
    data_source_id: UUID
    sql: str = Field(..., min_length=1)
    params: dict[str, Any] | None = None
    design: DesignSpec | dict[str, Any] = Field(default_factory=dict)
    channel_ids: list[UUID] = Field(..., min_length=1)
    max_rows: int = Field(default=200, ge=1, le=10_000)
    # When set, create a JobRun + Delivery records for audit (trigger_type=editor_test).
    push_job_id: UUID | None = None


class ChannelSendResult(BaseModel):
    channel_id: UUID
    success: bool
    provider_msg_id: str | None = None
    error: str | None = None


class TestPushResponse(BaseModel):
    row_count: int
    markdown_text: str
    deliveries: list[ChannelSendResult]
    job_run_id: UUID | None = None
    success: bool


class SaveJobRequest(BaseModel):
    """Create or update a push job from the editor."""

    id: UUID | None = None
    name: str = Field(..., min_length=1, max_length=128)
    data_source_id: UUID
    query_sql: str = Field(..., min_length=1)
    design: DesignSpec | dict[str, Any] = Field(default_factory=dict)
    channel_ids: list[UUID] = Field(default_factory=list)
    skip_if_empty: bool = False
    schedule_cron: str | None = Field(default=None, max_length=128)
    schedule_enabled: bool = False
    enabled: bool = True


class SaveJobResponse(PushJobOut):
    """Same shape as PushJobOut (render_spec embeds design + parts)."""


# ---------------------------------------------------------------------------
# Studio (component artboard)
# ---------------------------------------------------------------------------


class StudioCompileRequest(BaseModel):
    """Compile artboard with live data for preview."""

    artboard: dict[str, Any] = Field(default_factory=dict)
    data_source_id: UUID | None = None
    sql: str | None = None
    params: dict[str, Any] | None = None
    max_rows: int = Field(default=200, ge=1, le=10_000)
    want_image: bool = True


class StudioCompileResponse(BaseModel):
    html: str = ""
    markdown_text: str = ""
    image_base64: str | None = None
    image_path: str | None = None
    row_count: int = 0
    parts: list[MessagePartPreview] = Field(default_factory=list)
    artboard: dict[str, Any] = Field(default_factory=dict)
    # When PNG missing: explain why (playwright/wkhtml unavailable, etc.)
    image_error: str | None = None
    ok: bool = True
    # SQL params resolved for this compile (auto yesterday/today, …)
    resolved_params: dict[str, str] = Field(default_factory=dict)
    resolved_params_by_dataset: dict[str, dict[str, str]] = Field(default_factory=dict)


class StudioSaveJobRequest(BaseModel):
    id: UUID | None = None
    name: str = Field(..., min_length=1, max_length=128)
    data_source_id: UUID
    query_sql: str = Field(..., min_length=1)
    artboard: dict[str, Any] = Field(default_factory=dict)
    channel_ids: list[UUID] = Field(default_factory=list)
    skip_if_empty: bool = False
    schedule_cron: str | None = Field(default=None, max_length=128)
    schedule_enabled: bool = False
    enabled: bool = True


class StudioTestPushRequest(BaseModel):
    artboard: dict[str, Any] = Field(default_factory=dict)
    data_source_id: UUID
    sql: str = Field(..., min_length=1)
    channel_ids: list[UUID] = Field(..., min_length=1)
    params: dict[str, Any] | None = None
    max_rows: int = Field(default=200, ge=1, le=10_000)
    push_job_id: UUID | None = None


class StudioTemplateResponse(BaseModel):
    id: str
    name: str
    artboard: dict[str, Any]
    description: str | None = None
    scene_id: str | None = None
    is_system: bool = False
    enabled: bool = True
    created_at: str | None = None
    updated_at: str | None = None


class StudioTemplateCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=512)
    scene_id: str | None = Field(default=None, max_length=64)
    artboard: dict[str, Any] = Field(default_factory=dict)


class StudioTemplateUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=512)
    artboard: dict[str, Any] | None = None
    enabled: bool | None = None
