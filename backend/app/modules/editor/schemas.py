"""编辑器预览 / 试推 / 保存任务 / Studio 相关 API 的 Pydantic schema。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.modules.config_svc.schemas import PushJobOut


class DesignSpec(BaseModel):
    """编辑器 UI 使用的轻量消息 design。"""

    header_text: str | None = None
    footer_text: str | None = None
    include_markdown_table: bool = True
    extra_parts: list[str] = Field(default_factory=list)
    title: str | None = None
    # 图片模板模式（草稿任务会显式设 output_mode=image）
    output_mode: str | None = None  # "markdown" | "image"
    template_id: str | None = None  # report_v1 | alert_v1 | kpi_v1
    theme_color: str | None = None
    show_table: bool = True
    kpi_columns: list[str] = Field(default_factory=list)


class QueryPreviewRequest(BaseModel):
    """SQL 预览请求。"""
    data_source_id: UUID
    sql: str = Field(..., min_length=1)
    params: dict[str, Any] | None = None
    # 数据集参数定义（auto/static/runtime）— 执行前解析
    param_defs: list[dict[str, Any]] | None = None
    max_rows: int = Field(default=200, ge=1, le=10_000)


class QueryPreviewResponse(BaseModel):
    """SQL 预览响应：列/行与解析后参数。"""
    columns: list[str]
    rows: list[list[Any]]
    row_count: int
    resolved_params: dict[str, str] = Field(default_factory=dict)
    rendered_sql: str | None = None


class MessagePreviewRequest(BaseModel):
    """消息预览请求（design 模式）。"""
    data_source_id: UUID
    sql: str = Field(..., min_length=1)
    params: dict[str, Any] | None = None
    design: DesignSpec | dict[str, Any] = Field(default_factory=dict)
    max_rows: int = Field(default=200, ge=1, le=10_000)


class MessagePartPreview(BaseModel):
    """单个 Message part 的短预览。"""
    kind: str
    content_preview: str


class MessagePreviewResponse(BaseModel):
    """消息预览响应。"""
    parts: list[MessagePartPreview]
    markdown_text: str


class ImagePreviewRequest(BaseModel):
    """图片预览请求。"""
    data_source_id: UUID
    sql: str = Field(..., min_length=1)
    params: dict[str, Any] | None = None
    design: DesignSpec | dict[str, Any] = Field(default_factory=dict)
    max_rows: int = Field(default=200, ge=1, le=10_000)


class ImagePreviewResponse(BaseModel):
    """模板图片模式 PNG 预览（base64 data URL，便于 <img>）。"""

    image_base64: str
    path: str | None = None
    content_type: str = "image/png"


class TestPushRequest(BaseModel):
    """试推请求（design 模式）。"""
    data_source_id: UUID
    sql: str = Field(..., min_length=1)
    params: dict[str, Any] | None = None
    design: DesignSpec | dict[str, Any] = Field(default_factory=dict)
    channel_ids: list[UUID] = Field(..., min_length=1)
    max_rows: int = Field(default=200, ge=1, le=10_000)
    # 若设置：创建 JobRun + Delivery 审计（trigger_type=editor_test）
    push_job_id: UUID | None = None


class ChannelSendResult(BaseModel):
    """单渠道发送结果。"""
    channel_id: UUID
    success: bool
    provider_msg_id: str | None = None
    error: str | None = None


class TestPushResponse(BaseModel):
    """试推响应。"""
    row_count: int
    markdown_text: str
    deliveries: list[ChannelSendResult]
    job_run_id: UUID | None = None
    success: bool


class SaveJobRequest(BaseModel):
    """从编辑器创建或更新推送任务。"""

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
    """与 PushJobOut 同形（render_spec 内嵌 design + parts）。"""


# ---------------------------------------------------------------------------
# Studio（组件画板）
# ---------------------------------------------------------------------------


class StudioCompileRequest(BaseModel):
    """用实时数据编译画板，供工作台预览。"""

    artboard: dict[str, Any] = Field(default_factory=dict)
    data_source_id: UUID | None = None
    sql: str | None = None
    params: dict[str, Any] | None = None
    max_rows: int = Field(default=200, ge=1, le=10_000)
    want_image: bool = True


class StudioCompileResponse(BaseModel):
    """Studio 编译预览响应。"""
    html: str = ""
    markdown_text: str = ""
    image_base64: str | None = None
    image_path: str | None = None
    row_count: int = 0
    parts: list[MessagePartPreview] = Field(default_factory=list)
    artboard: dict[str, Any] = Field(default_factory=dict)
    # PNG 缺失时说明原因（未装 playwright/wkhtml 等）
    image_error: str | None = None
    ok: bool = True
    # 本次编译解析的 SQL 参数（auto 昨天/今天等）
    resolved_params: dict[str, str] = Field(default_factory=dict)
    resolved_params_by_dataset: dict[str, dict[str, str]] = Field(default_factory=dict)


class StudioSaveJobRequest(BaseModel):
    """Studio 保存任务请求（含 artboard）。"""
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
    """Studio 试推请求（含 artboard）。"""
    artboard: dict[str, Any] = Field(default_factory=dict)
    data_source_id: UUID
    sql: str = Field(..., min_length=1)
    channel_ids: list[UUID] = Field(..., min_length=1)
    params: dict[str, Any] | None = None
    max_rows: int = Field(default=200, ge=1, le=10_000)
    push_job_id: UUID | None = None


class StudioTemplateResponse(BaseModel):
    """Studio 模板列表/详情项。"""
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
    """创建用户模板请求。"""
    name: str = Field(..., min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=512)
    scene_id: str | None = Field(default=None, max_length=64)
    artboard: dict[str, Any] = Field(default_factory=dict)


class StudioTemplateUpdateRequest(BaseModel):
    """更新模板请求。"""
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=512)
    artboard: dict[str, Any] | None = None
    enabled: bool | None = None
