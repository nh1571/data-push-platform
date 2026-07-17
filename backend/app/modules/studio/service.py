"""Studio 应用服务：数据集解析、画板编译、试推与任务落库。

架构定位
--------
位于 API 层与编译/执行层之间，编排以下步骤：

1. **文档归一化** :func:`ensure_artboard_doc`
   接受 artboard v3 / 嵌套 render_spec / 旧 design，统一为可编译文档。
2. **多数据集取数** :func:`resolve_data_context`
   解析 SQL 参数（auto 日期等），执行各 dataset，产出 ``data_ctx``。
3. **编译** :func:`~app.modules.studio.compile.compile_artboard`
4. **试推 / 保存** :func:`studio_test_push` / :func:`save_job_with_artboard`

与旧 Editor 的关系
------------------
取数复用 :mod:`app.modules.editor.service`；保存任务时仍写 PushJob，
但 ``render_spec`` 内嵌完整 ``artboard_doc``（version=3）。
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.modules.editor import service as editor_service
from app.modules.editor.schemas import ChannelSendResult, SaveJobRequest
from app.modules.studio.compile import compile_artboard
from app.modules.studio.defaults import default_daily_artboard
from app.modules.studio.migrate import design_to_artboard, extract_artboard, is_artboard_spec
from app.modules.studio.normalize import ARTBOARD_VERSION, normalize_artboard_doc
from app.modules.studio.sql_params import extract_placeholders, resolve_sql_params
from app.plugins.base import QueryResult


def ensure_artboard_doc(
    raw: Any,
    *,
    data_source_id: str | None = None,
    sql: str | None = None,
) -> dict[str, Any]:
    """将入参归一为 artboard v3 文档，并同步主数据集 data_source_id / sql。

    识别顺序：完整 artboard → 嵌套 extract → 旧 design 迁移 → 默认日报模板。
    最后强制 :func:`normalize_artboard_doc`（canvases / library / segments）。
    """
    if isinstance(raw, dict) and is_artboard_spec(raw) and (
        "tree" in raw or "canvases" in raw
    ):
        doc = dict(raw)
    elif isinstance(raw, dict) and extract_artboard(raw):
        doc = dict(extract_artboard(raw) or {})
    elif isinstance(raw, dict) and (raw.get("design") or raw.get("header_text") or raw.get("template_id")):
        design = raw.get("design") if isinstance(raw.get("design"), dict) else raw
        doc = design_to_artboard(
            design if isinstance(design, dict) else {},
            data_source_id=data_source_id,
            sql=sql,
        )
    else:
        doc = default_daily_artboard()

    doc = normalize_artboard_doc(doc)

    # 同步主数据集槽位（任务级 data_source/sql 覆盖文档内定义）
    datasets = list(doc.get("datasets") or [])
    if not datasets:
        datasets = [{"id": "main", "name": "主查询", "data_source_id": data_source_id, "sql": sql or "SELECT 1"}]
        doc["datasets"] = datasets
    main = datasets[0]
    if data_source_id:
        main["data_source_id"] = data_source_id
    if sql is not None:
        main["sql"] = sql
    doc["version"] = ARTBOARD_VERSION
    doc["kind"] = "artboard"
    return doc


def resolve_data_context(
    db: Session,
    doc: dict[str, Any],
    *,
    fallback_data_source_id: UUID | None = None,
    fallback_sql: str | None = None,
    params: dict[str, Any] | None = None,
    max_rows: int = 200,
) -> tuple[dict[str, QueryResult], dict[str, dict[str, str]]]:
    """执行画板上全部可运行数据集。

    返回
    -------
    (data_ctx, resolved_params_by_dataset)
        data_ctx 供编译器绑定；params 映射供工作台展示本次实际 SQL 参数
        （模板含 auto 日期时动态变化）。

    说明
    ----
    - main 数据集的 SQL 优先使用任务/请求传入的 ``fallback_sql``。
    - 次级数据集编译期失败会被吞掉（可选数据）；main 失败则抛 HTTP 异常。
    """
    ctx: dict[str, QueryResult] = {}
    params_by_ds: dict[str, dict[str, str]] = {}
    datasets = list(doc.get("datasets") or [])
    if not datasets and fallback_data_source_id and fallback_sql:
        datasets = [
            {
                "id": "main",
                "data_source_id": str(fallback_data_source_id),
                "sql": fallback_sql,
            }
        ]

    for ds in datasets:
        ds_id = str(ds.get("id") or "main")
        raw_source = ds.get("data_source_id") or fallback_data_source_id
        # main SQL 始终优先任务/编辑器显式 SQL
        if ds_id == "main" and fallback_sql:
            sql = str(fallback_sql).strip()
        else:
            sql = str(ds.get("sql") or (fallback_sql if ds_id == "main" else "") or "").strip()
        if not raw_source or not sql:
            continue
        try:
            source_uuid = raw_source if isinstance(raw_source, UUID) else UUID(str(raw_source))
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"invalid data_source_id for dataset {ds_id}",
            ) from exc
        # 合并请求参数 + 数据集 param 定义（auto 昨天/今天…）
        param_defs = ds.get("params") if isinstance(ds.get("params"), list) else []
        # 数据集级覆盖：param_values 盖过全局 params
        ds_overrides = dict(params or {})
        if isinstance(ds.get("param_values"), dict):
            ds_overrides.update({str(k): v for k, v in ds["param_values"].items()})
        _sql, resolved = resolve_sql_params(
            sql, param_defs=param_defs, overrides=ds_overrides
        )
        # UI 仅展示 SQL 用到或声明过的参数名（不全量内置）
        used = set(extract_placeholders(sql))
        for p in param_defs or []:
            if isinstance(p, dict) and p.get("name"):
                used.add(str(p["name"]))
        if used:
            params_by_ds[ds_id] = {k: str(resolved.get(k, "")) for k in sorted(used)}
        else:
            params_by_ds[ds_id] = {}
        try:
            ctx[ds_id] = editor_service.execute_query(
                db, source_uuid, sql, resolved, max_rows=max_rows
            )
        except HTTPException:
            if ds_id == "main":
                raise
            # 次级数据集编译期可选
            continue

    if not ctx:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="artboard has no executable dataset (need data_source_id + sql)",
        )
    return ctx, params_by_ds


def studio_compile(
    db: Session,
    *,
    artboard: dict[str, Any],
    data_source_id: UUID | None = None,
    sql: str | None = None,
    params: dict[str, Any] | None = None,
    max_rows: int = 200,
    want_image: bool = True,
) -> dict[str, Any]:
    """工作台编译入口：归一文档 → 取数 → 编译 → 组装 API 响应 dict。"""
    doc = ensure_artboard_doc(
        artboard,
        data_source_id=str(data_source_id) if data_source_id else None,
        sql=sql,
    )
    ctx, params_by_ds = resolve_data_context(
        db,
        doc,
        fallback_data_source_id=data_source_id,
        fallback_sql=sql,
        params=params,
        max_rows=max_rows,
    )
    result = compile_artboard(doc, ctx, want_image=want_image)
    # 主平铺参数：优先 main，否则取第一个数据集
    flat = dict(params_by_ds.get("main") or {})
    if not flat and params_by_ds:
        flat = dict(next(iter(params_by_ds.values())))
    return {
        "html": result.html,
        "markdown_text": result.markdown,
        "image_base64": result.image_base64,
        "image_path": result.image_path,
        "row_count": result.row_count,
        "parts": result.parts_preview,
        "artboard": doc,
        "image_error": result.image_error,
        "ok": bool(result.image_base64 or result.markdown or result.html),
        "resolved_params": flat,
        "resolved_params_by_dataset": params_by_ds,
    }


def studio_test_push(
    db: Session,
    *,
    artboard: dict[str, Any],
    data_source_id: UUID,
    sql: str,
    channel_ids: list[UUID],
    params: dict[str, Any] | None = None,
    max_rows: int = 200,
    push_job_id: UUID | None = None,
) -> dict[str, Any]:
    """编译画板消息并按渠道循环发送（可选写入 JobRun 审计）。"""
    from datetime import datetime, timezone

    from sqlalchemy import select

    from app.common.crypto import decrypt_dict
    from app.db.models import (
        Channel,
        Delivery,
        DeliveryStatus,
        JobRun,
        JobRunStatus,
        PushJob,
    )
    from app.plugins.registry import plugin_registry

    doc = ensure_artboard_doc(artboard, data_source_id=str(data_source_id), sql=sql)
    ctx, _params_by_ds = resolve_data_context(
        db,
        doc,
        fallback_data_source_id=data_source_id,
        fallback_sql=sql,
        params=params,
        max_rows=max_rows,
    )
    compiled = compile_artboard(doc, ctx, want_image=True)
    message = compiled.message

    channels = editor_service._ensure_channels(db, channel_ids)  # noqa: SLF001

    job_run: JobRun | None = None
    if push_job_id is not None:
        job = db.get(PushJob, push_job_id)
        if job is None:
            raise HTTPException(status_code=400, detail="push_job_id not found")
        job_run = JobRun(
            push_job_id=job.id,
            status=JobRunStatus.RUNNING,
            trigger_type="editor_test",
            params=params,
            config_snapshot={
                "source": "studio_test",
                "artboard": doc,
                "data_source_id": str(data_source_id),
                "query_sql": sql,
                "channel_ids": [str(c) for c in channel_ids],
            },
            started_at=datetime.now(timezone.utc),
        )
        db.add(job_run)
        db.flush()

    deliveries_out: list[ChannelSendResult] = []
    successes = 0
    failures = 0
    now = datetime.now(timezone.utc)

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
                    delivery_row.finished_at = now
                deliveries_out.append(
                    ChannelSendResult(channel_id=channel.id, success=True, provider_msg_id=dr.provider_msg_id)
                )
            else:
                failures += 1
                if delivery_row is not None:
                    delivery_row.status = DeliveryStatus.FAILED
                    delivery_row.error_message = dr.error or "failed"
                    delivery_row.finished_at = now
                deliveries_out.append(
                    ChannelSendResult(channel_id=channel.id, success=False, error=dr.error)
                )
        except Exception as exc:  # noqa: BLE001
            failures += 1
            if delivery_row is not None:
                delivery_row.status = DeliveryStatus.FAILED
                delivery_row.error_message = str(exc)
                delivery_row.finished_at = now
            deliveries_out.append(
                ChannelSendResult(channel_id=channel.id, success=False, error=str(exc))
            )

    if job_run is not None:
        if failures == 0:
            job_run.status = JobRunStatus.SUCCEEDED
        elif successes == 0:
            job_run.status = JobRunStatus.FAILED
            job_run.error_message = "all channels failed"
        else:
            job_run.status = JobRunStatus.PARTIAL
            job_run.error_message = f"{failures} channel(s) failed"
        job_run.finished_at = now

    db.commit()
    return {
        "row_count": compiled.row_count,
        "markdown_text": compiled.markdown,
        "image_base64": compiled.image_base64,
        "deliveries": [d.model_dump() if hasattr(d, "model_dump") else d for d in deliveries_out],
        "job_run_id": str(job_run.id) if job_run else None,
        "success": failures == 0,
    }


def save_job_with_artboard(
    db: Session,
    *,
    job_id: UUID | None,
    name: str,
    data_source_id: UUID,
    sql: str,
    artboard: dict[str, Any],
    channel_ids: list[UUID],
    skip_if_empty: bool = False,
    enabled: bool = True,
    schedule_cron: str | None = None,
    schedule_enabled: bool = False,
) -> Any:
    """持久化推送任务，将完整 artboard 写入 ``render_spec.artboard_doc``。

    先走 editor ``save_job`` 建/改行，再覆盖 render_spec：
    保留精简 design 兼容字段，并标记 ``parts`` 为 studio_artboard 占位，
    真正渲染由 pipeline 识别 artboard 后调用 compile。
    """
    doc = ensure_artboard_doc(artboard, data_source_id=str(data_source_id), sql=sql)
    # 派生精简 design，兼容只读 design 的旧路径
    design_compat = {
        "output_mode": "image"
        if str((doc.get("compose") or {}).get("mode") or "").startswith("image")
        else "markdown",
        "theme_color": ((doc.get("artboard") or {}).get("theme") or {}).get("color"),
        "studio": True,
    }
    payload = SaveJobRequest(
        id=job_id,
        name=name,
        data_source_id=data_source_id,
        query_sql=sql,
        design=design_compat,
        channel_ids=channel_ids,
        skip_if_empty=skip_if_empty,
        enabled=enabled,
        schedule_cron=schedule_cron,
        schedule_enabled=schedule_enabled,
    )
    # 底层保存后再用完整 artboard 覆盖 render_spec
    row = editor_service.save_job(db, payload)
    row.render_spec = {
        "version": 3,
        "kind": "artboard",
        "artboard_doc": doc,
        "design": design_compat,
        "parts": [{"type": "studio_artboard", "config": {"compose": doc.get("compose")}}],
    }
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
