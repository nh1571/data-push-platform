"""编辑器应用服务：SQL 预览、消息/图片预览、试推、保存任务。

架构定位
--------
旧版「轻量 design」工作台的服务层，Studio 仍复用其中的：

- :func:`execute_query` — 统一取数（解密配置 → 插件执行 → max_rows）
- :func:`_ensure_channels` — 试推时校验渠道
- :func:`save_job` — 基础 CRUD；Studio 保存会再覆盖 artboard render_spec

主流程
------
1. **query_preview**：解析 SQL 参数 → 执行 → 返回列/行与 rendered_sql
2. **message_preview / image_preview**：design → Message / PNG
3. **test_push**：成消息后逐渠道 send，可选落 JobRun（trigger=editor_test）
4. **save_job**：design 写入 ``render_spec.design`` + 派生 parts

与 execution.pipeline 的差异：试推直接在请求线程内发送，不经过 Celery；
正式调度推送走 pipeline。
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.common.crypto import decrypt_dict
from app.db.models import (
    Channel,
    DataSource,
    Delivery,
    DeliveryStatus,
    JobRun,
    JobRunStatus,
    PushJob,
)
from app.modules.editor.design import build_message_from_design, design_to_parts
from app.modules.editor.schemas import (
    ChannelSendResult,
    ImagePreviewResponse,
    MessagePartPreview,
    MessagePreviewResponse,
    QueryPreviewResponse,
    SaveJobRequest,
    TestPushResponse,
)
from app.modules.editor.templates import render_and_save_template
from app.plugins.base import Message, MessagePart, QueryResult
from app.plugins.registry import plugin_registry


def _utcnow() -> datetime:
    """UTC 当前时间。"""
    return datetime.now(timezone.utc)


def _as_design(design: Any) -> dict[str, Any]:
    """将 Pydantic model / dict / None 统一为 design 字典。"""
    if design is None:
        return {}
    if hasattr(design, "model_dump"):
        return dict(design.model_dump())
    if isinstance(design, dict):
        return dict(design)
    raise ValueError(f"design must be a dict, got {type(design)!r}")


def _channel_ids_as_str(ids: list[UUID] | list[str]) -> list[str]:
    """渠道 ID 列表转字符串（PushJob.channel_ids 存 JSON 字符串）。"""
    return [str(i) for i in ids]


def _get_data_source(db: Session, data_source_id: UUID) -> DataSource:
    """加载数据源；不存在则 400。"""
    ds = db.get(DataSource, data_source_id)
    if ds is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"data_source_id not found: {data_source_id}",
        )
    return ds


def _ensure_channels(
    db: Session,
    channel_ids: list[UUID],
    *,
    allow_empty: bool = False,
) -> list[Channel]:
    """校验并按请求顺序返回 Channel 实体。

    ``allow_empty=True`` 用于草稿任务保存（可无渠道）。
    """
    if not channel_ids:
        if allow_empty:
            return []
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="channel_ids must not be empty",
        )
    found = {
        row.id: row
        for row in db.scalars(select(Channel).where(Channel.id.in_(channel_ids))).all()
    }
    missing = [str(cid) for cid in channel_ids if cid not in found]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"channel_ids not found: {missing}",
        )
    # 保持请求顺序，便于试推结果与 UI 对齐
    return [found[cid] for cid in channel_ids]


def _content_preview(part: MessagePart, *, max_len: int = 2000) -> str:
    """将 MessagePart 压成短文本预览（优先 text/path/url 等字段）。"""
    content = part.content
    if isinstance(content, str):
        text = content
    elif isinstance(content, dict):
        # 预览优先可读文本字段
        for key in ("text", "path", "url", "filename", "title"):
            if content.get(key):
                text = str(content[key])
                break
        else:
            text = str(content)
    elif content is None:
        text = ""
    else:
        text = str(content)
    if len(text) > max_len:
        return text[: max_len - 1] + "…"
    return text


def _markdown_from_message(message: Message) -> str:
    """拼接所有 text part 为 Markdown 字符串。"""
    texts: list[str] = []
    for part in message.parts:
        if part.kind == "text" and part.content is not None:
            texts.append(str(part.content))
    return "\n\n".join(texts)


def execute_query(
    db: Session,
    data_source_id: UUID,
    sql: str,
    params: dict[str, Any] | None = None,
    *,
    max_rows: int = 200,
) -> QueryResult:
    """加载数据源、解密配置、执行 SQL，并截断至 max_rows。

    Studio / Editor / 试推共用此入口，避免重复解密与插件查找逻辑。
    """
    ds = _get_data_source(db, data_source_id)
    try:
        plugin = plugin_registry.get("datasource", ds.type)
    except KeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"unknown data source type: {ds.type!r}",
        ) from exc

    config = decrypt_dict(ds.config_enc)
    result: QueryResult = plugin.execute(config, sql, dict(params or {}))
    rows = list(result.rows or [])
    if max_rows is not None and max_rows >= 0 and len(rows) > max_rows:
        rows = rows[:max_rows]
    return QueryResult(columns=list(result.columns or []), rows=rows)


def query_preview(
    db: Session,
    data_source_id: UUID,
    sql: str,
    params: dict[str, Any] | None = None,
    *,
    max_rows: int = 200,
    param_defs: list[dict[str, Any]] | None = None,
) -> QueryPreviewResponse:
    """SQL 预览：解析参数 → 执行 → 返回列/行与替换后的 rendered_sql。"""
    from app.modules.studio.sql_params import resolve_sql_params
    from app.plugins.datasource.mysql import substitute_sql_params

    _sql, resolved = resolve_sql_params(
        sql, param_defs=param_defs, overrides=params
    )
    result = execute_query(db, data_source_id, sql, resolved, max_rows=max_rows)
    rendered = substitute_sql_params(sql, resolved)
    return QueryPreviewResponse(
        columns=result.columns,
        rows=result.rows,
        resolved_params=resolved,
        rendered_sql=rendered,
        row_count=len(result.rows),
    )


def message_preview(
    db: Session,
    data_source_id: UUID,
    sql: str,
    design: Any,
    params: dict[str, Any] | None = None,
    *,
    max_rows: int = 200,
) -> MessagePreviewResponse:
    """取数 + design 构建 Message，返回 part 预览与 markdown 文本。"""
    result = execute_query(db, data_source_id, sql, params, max_rows=max_rows)
    design_dict = _as_design(design)
    message = build_message_from_design(result, design_dict, params=params)
    parts = [
        MessagePartPreview(kind=p.kind, content_preview=_content_preview(p))
        for p in message.parts
    ]
    return MessagePreviewResponse(
        parts=parts,
        markdown_text=_markdown_from_message(message),
    )


def image_preview(
    db: Session,
    data_source_id: UUID,
    sql: str,
    design: Any,
    params: dict[str, Any] | None = None,
    *,
    max_rows: int = 200,
) -> ImagePreviewResponse:
    """取数 + 强制 image 模板渲染；返回 base64 data URL 供前端 <img>。"""
    import base64

    result = execute_query(db, data_source_id, sql, params, max_rows=max_rows)
    design_dict = _as_design(design)
    # 本接口固定图片模式
    design_dict = {**design_dict, "output_mode": "image"}
    if not design_dict.get("template_id"):
        design_dict["template_id"] = "report_v1"
    try:
        from app.modules.editor.html_table import render_and_save_html

        png, path = render_and_save_html(result, design_dict, filename="preview.png")
    except Exception:
        from app.modules.editor.templates import render_and_save_template

        png, path = render_and_save_template(result, design_dict, filename="preview.png")
    b64 = base64.b64encode(png).decode("ascii")
    data_url = f"data:image/png;base64,{b64}"
    return ImagePreviewResponse(image_base64=data_url, path=path, content_type="image/png")


def test_push(
    db: Session,
    *,
    data_source_id: UUID,
    sql: str,
    design: Any,
    channel_ids: list[UUID],
    params: dict[str, Any] | None = None,
    max_rows: int = 200,
    push_job_id: UUID | None = None,
) -> TestPushResponse:
    """取数 + 建消息 + 逐渠道发送；若带 push_job_id 则写入 JobRun/Delivery 审计。"""
    result = execute_query(db, data_source_id, sql, params, max_rows=max_rows)
    design_dict = _as_design(design)
    message = build_message_from_design(result, design_dict, params=params)
    markdown_text = _markdown_from_message(message)
    channels = _ensure_channels(db, channel_ids)

    job_run: JobRun | None = None
    if push_job_id is not None:
        job = db.get(PushJob, push_job_id)
        if job is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"push_job_id not found: {push_job_id}",
            )
        job_run = JobRun(
            push_job_id=job.id,
            status=JobRunStatus.RUNNING,
            trigger_type="editor_test",
            params=params,
            config_snapshot={
                "source": "editor_test",
                "design": design_dict,
                "data_source_id": str(data_source_id),
                "query_sql": sql,
                "channel_ids": _channel_ids_as_str(channel_ids),
            },
            started_at=_utcnow(),
        )
        db.add(job_run)
        db.flush()

    deliveries_out: list[ChannelSendResult] = []
    successes = 0
    failures = 0

    for channel in channels:
        delivery_row: Delivery | None = None
        if job_run is not None:
            delivery_row = Delivery(
                job_run_id=job_run.id,
                channel_id=channel.id,
                status=DeliveryStatus.RUNNING,
            )
            db.add(delivery_row)
            db.flush()

        try:
            ch_plugin = plugin_registry.get("channel", channel.type)
            ch_config = decrypt_dict(channel.config_enc)
            dr = ch_plugin.send(ch_config, message)
            if dr.success:
                successes += 1
                if delivery_row is not None:
                    delivery_row.status = DeliveryStatus.SUCCESS
                    delivery_row.provider_msg_id = dr.provider_msg_id
                    delivery_row.finished_at = _utcnow()
                deliveries_out.append(
                    ChannelSendResult(
                        channel_id=channel.id,
                        success=True,
                        provider_msg_id=dr.provider_msg_id,
                    )
                )
            else:
                failures += 1
                if delivery_row is not None:
                    delivery_row.status = DeliveryStatus.FAILED
                    delivery_row.error_message = dr.error or "channel send failed"
                    delivery_row.finished_at = _utcnow()
                deliveries_out.append(
                    ChannelSendResult(
                        channel_id=channel.id,
                        success=False,
                        error=dr.error or "channel send failed",
                    )
                )
        except Exception as exc:  # noqa: BLE001 — 单渠道隔离
            failures += 1
            if delivery_row is not None:
                delivery_row.status = DeliveryStatus.FAILED
                delivery_row.error_message = str(exc)
                delivery_row.finished_at = _utcnow()
            deliveries_out.append(
                ChannelSendResult(
                    channel_id=channel.id,
                    success=False,
                    error=str(exc),
                )
            )

    if job_run is not None:
        if failures == 0:
            job_run.status = JobRunStatus.SUCCEEDED
            job_run.error_message = None
        elif successes == 0:
            job_run.status = JobRunStatus.FAILED
            job_run.error_message = f"all {failures} channel delivery(ies) failed"
        else:
            job_run.status = JobRunStatus.PARTIAL
            job_run.error_message = (
                f"{failures} of {successes + failures} channel delivery(ies) failed"
            )
        job_run.finished_at = _utcnow()

    db.commit()
    if job_run is not None:
        db.refresh(job_run)

    return TestPushResponse(
        row_count=len(result.rows),
        markdown_text=markdown_text,
        deliveries=deliveries_out,
        job_run_id=job_run.id if job_run is not None else None,
        success=failures == 0,
    )


def save_job(db: Session, payload: SaveJobRequest) -> PushJob:
    """创建或更新 PushJob；将 design 写入 render_spec.design 并派生 parts。"""
    design_dict = _as_design(payload.design)
    parts = design_to_parts(design_dict)
    render_spec: dict[str, Any] = {
        "design": design_dict,
        "parts": parts,
    }

    _get_data_source(db, payload.data_source_id)
    # 允许空 channel_ids，以便编辑器保存草稿
    _ensure_channels(db, payload.channel_ids, allow_empty=True)

    if payload.id is not None:
        row = db.get(PushJob, payload.id)
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="push job not found",
            )
        row.name = payload.name
        row.enabled = payload.enabled
        row.skip_if_empty = payload.skip_if_empty
        row.data_source_id = payload.data_source_id
        row.query_sql = payload.query_sql
        row.render_spec = render_spec
        row.channel_ids = _channel_ids_as_str(payload.channel_ids)
        row.schedule_cron = payload.schedule_cron
        row.schedule_enabled = payload.schedule_enabled
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    row = PushJob(
        name=payload.name,
        enabled=payload.enabled,
        skip_if_empty=payload.skip_if_empty,
        data_source_id=payload.data_source_id,
        query_sql=payload.query_sql,
        render_spec=render_spec,
        channel_ids=_channel_ids_as_str(payload.channel_ids),
        schedule_cron=payload.schedule_cron,
        schedule_enabled=payload.schedule_enabled,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
