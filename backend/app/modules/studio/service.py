"""Studio service: resolve datasets, compile artboard, save job."""

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
from app.modules.studio.sql_params import resolve_sql_params
from app.plugins.base import QueryResult


def ensure_artboard_doc(
    raw: Any,
    *,
    data_source_id: str | None = None,
    sql: str | None = None,
) -> dict[str, Any]:
    """Normalize incoming payload to artboard v3 document."""
    if isinstance(raw, dict) and is_artboard_spec(raw) and "tree" in raw:
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

    # Sync primary dataset slots
    datasets = list(doc.get("datasets") or [])
    if not datasets:
        datasets = [{"id": "main", "name": "主查询", "data_source_id": data_source_id, "sql": sql or "SELECT 1"}]
        doc["datasets"] = datasets
    main = datasets[0]
    if data_source_id:
        main["data_source_id"] = data_source_id
    if sql is not None:
        main["sql"] = sql
    doc["version"] = 3
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
) -> dict[str, QueryResult]:
    """Execute all datasets on the artboard (S1: typically one main)."""
    ctx: dict[str, QueryResult] = {}
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
        # main SQL always prefers explicit fallback_sql from job/editor
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
        # Merge request params + dataset param defs (auto yesterday/today/…)
        param_defs = ds.get("params") if isinstance(ds.get("params"), list) else []
        # per-dataset overrides: ds.param_values or global params
        ds_overrides = dict(params or {})
        if isinstance(ds.get("param_values"), dict):
            ds_overrides.update({str(k): v for k, v in ds["param_values"].items()})
        _sql, resolved = resolve_sql_params(
            sql, param_defs=param_defs, overrides=ds_overrides
        )
        try:
            ctx[ds_id] = editor_service.execute_query(
                db, source_uuid, sql, resolved, max_rows=max_rows
            )
        except HTTPException:
            if ds_id == "main":
                raise
            # Secondary datasets optional at compile time
            continue

    if not ctx:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="artboard has no executable dataset (need data_source_id + sql)",
        )
    return ctx


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
    doc = ensure_artboard_doc(
        artboard,
        data_source_id=str(data_source_id) if data_source_id else None,
        sql=sql,
    )
    ctx = resolve_data_context(
        db,
        doc,
        fallback_data_source_id=data_source_id,
        fallback_sql=sql,
        params=params,
        max_rows=max_rows,
    )
    result = compile_artboard(doc, ctx, want_image=want_image)
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
    """Compile artboard message and deliver via existing test_push channel loop."""
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
    ctx = resolve_data_context(
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
    """Persist job with artboard in render_spec."""
    doc = ensure_artboard_doc(artboard, data_source_id=str(data_source_id), sql=sql)
    # Keep a derived design for partial backward compatibility
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
    # Use low-level save then overwrite render_spec with full artboard
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
