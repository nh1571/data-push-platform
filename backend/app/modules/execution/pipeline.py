"""推送任务执行管线：查询 → 渲染 → 投递。

架构意图
--------
本模块是**正式推送**（手动/定时/重跑）的唯一执行核心，与编辑器试推路径分离：

1. **query**：按 PushJob 主 SQL + artboard 多数据集取数，解析 SQL 参数
2. **skip_if_empty**：0 行且任务开启跳过时直接 SUCCEEDED
3. **render**：``render_spec`` → :class:`Message`（artboard / design / 插件 renderer）
4. **deliver**：按 channel_ids 逐渠道发送，隔离失败（PARTIAL 状态）

``render_spec`` 兼容多种形态（空则默认 ``text_md``）::

    # 单一渲染器
    {"type": "text_md", "config": {"title": "日报"}}

    # 多 part 列表
    [{"type": "text_md", "config": {}}, …]

    # 显式 parts 包装 / 含 design / 含 artboard_doc（Studio v3）
    {"parts": […]}  |  {"design": {…}}  |  {"artboard_doc": {…}}

JobRun 状态机::

    pending → running → succeeded | failed | partial

会话模型
--------
:func:`run_job_run` 接受已有 Session（同步 API）或 Session 工厂（Celery worker），
后者自行 commit/rollback/close。
"""

from __future__ import annotations

import logging
import traceback
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.common.crypto import decrypt_dict
from app.db.models import (
    Channel,
    DataSource,
    Delivery,
    DeliveryStatus,
    JobRun,
    JobRunLog,
    JobRunStatus,
    LogLevel,
    PushJob,
)
from app.modules.address_book.resolver import resolve_recipient_ids
from app.plugins.base import Message, MessagePart, QueryResult
from app.plugins.registry import plugin_registry

logger = logging.getLogger(__name__)

SessionFactory = Callable[[], Session]


def _utcnow() -> datetime:
    """UTC 当前时间（写入 started_at / finished_at）。"""
    return datetime.now(timezone.utc)


def _as_uuid(value: UUID | str) -> UUID:
    """UUID 或字符串 → UUID。"""
    return value if isinstance(value, UUID) else UUID(str(value))


def _log(
    db: Session,
    job_run_id: UUID,
    step: str,
    message: str,
    *,
    level: str = LogLevel.INFO,
) -> None:
    """追加一条结构化 JobRunLog（不单独 commit，由调用方控制事务）。"""
    db.add(
        JobRunLog(
            job_run_id=job_run_id,
            step=step,
            level=level,
            message=message,
        )
    )


def build_config_snapshot(job: PushJob) -> dict[str, Any]:
    """运行开始时快照任务定义字段（不含密钥）。"""
    return {
        "name": job.name,
        "enabled": job.enabled,
        "skip_if_empty": job.skip_if_empty,
        "data_source_id": str(job.data_source_id),
        "query_sql": job.query_sql,
        "render_spec": job.render_spec,
        "channel_ids": list(job.channel_ids or []),
        "schedule_cron": job.schedule_cron,
        "schedule_enabled": job.schedule_enabled,
    }


def normalize_render_parts(render_spec: Any) -> list[dict[str, Any]]:
    """将 ``render_spec`` 归一为 ``{type, config}`` part 列表。

    空/缺失时默认单个 ``text_md``。若仅含 editor ``design`` 而无 ``parts``，
    则通过 :func:`~app.modules.editor.design.design_to_parts` 转换。
    """
    if render_spec is None or render_spec == {} or render_spec == []:
        return [{"type": "text_md", "config": {}}]

    if isinstance(render_spec, list):
        parts: list[dict[str, Any]] = []
        for item in render_spec:
            if not isinstance(item, dict):
                raise ValueError(f"render_spec list items must be objects, got {type(item)!r}")
            rtype = item.get("type") or "text_md"
            cfg = item.get("config")
            if cfg is None:
                # 允许 type 旁扁平配置键，如 {"type":"text_md","title":"x"}
                cfg = {k: v for k, v in item.items() if k not in ("type", "config")}
            parts.append({"type": str(rtype), "config": dict(cfg or {})})
        return parts or [{"type": "text_md", "config": {}}]

    if isinstance(render_spec, dict):
        # 无显式 parts 时，editor design 决定 part 列表
        if "design" in render_spec and "parts" not in render_spec:
            from app.modules.editor.design import design_to_parts

            return design_to_parts(render_spec["design"] or {})
        if "parts" in render_spec and isinstance(render_spec["parts"], list):
            return normalize_render_parts(render_spec["parts"])
        # design + parts：优先显式 parts（上面分支已处理 list）
        if "design" in render_spec:
            from app.modules.editor.design import design_to_parts

            return design_to_parts(render_spec["design"] or {})
        rtype = render_spec.get("type") or "text_md"
        cfg = render_spec.get("config")
        if cfg is None:
            cfg = {
                k: v
                for k, v in render_spec.items()
                if k not in ("type", "config", "parts", "design")
            }
        return [{"type": str(rtype), "config": dict(cfg or {})}]

    raise ValueError(f"unsupported render_spec type: {type(render_spec)!r}")


def render_message(
    result: QueryResult,
    render_spec: Any,
    params: dict[str, Any],
    *,
    data_ctx: dict[str, QueryResult] | None = None,
) -> Message:
    """按 *render_spec* 渲染并合成 :class:`Message`。

    分支优先级：

    1. **Studio artboard v3** → :func:`~app.modules.studio.compile.artboard_to_message`
    2. **Editor design** → :func:`~app.modules.editor.design.build_message_from_design`
    3. **插件 renderer 链** → 归一 parts 后逐个 ``plugin.render``

    *data_ctx* 为多数据集 artboard 的 dataset_id → QueryResult。
    """
    if isinstance(render_spec, dict):
        from app.modules.studio.migrate import extract_artboard, is_artboard_spec

        doc = extract_artboard(render_spec)
        if doc is None and is_artboard_spec(render_spec) and isinstance(render_spec.get("tree"), dict):
            doc = render_spec
        if doc is not None:
            from app.modules.studio.compile import artboard_to_message

            ctx = dict(data_ctx) if data_ctx else {"main": result}
            if "main" not in ctx:
                ctx["main"] = result
            return artboard_to_message(doc, ctx, with_image=True)

        if render_spec.get("design") is not None:
            from app.modules.editor.design import build_message_from_design

            return build_message_from_design(
                result,
                render_spec["design"] or {},
                params=params,
            )

    parts_out: list[MessagePart] = []
    for part_spec in normalize_render_parts(render_spec):
        # studio_artboard 不是插件渲染器 — artboard 路径已在上方处理
        if part_spec.get("type") == "studio_artboard":
            continue
        renderer = plugin_registry.get("renderer", part_spec["type"])
        rendered = renderer.render(result, part_spec.get("config") or {}, params)
        parts_out.extend(rendered)
    if not parts_out:
        return Message(parts=[MessagePart(kind="text", content="（空消息）")])
    return Message(parts=parts_out)


def _resolve_session(
    db_or_factory: Session | SessionFactory,
) -> tuple[Session, bool]:
    """返回 ``(session, owns_session)``；owns 时由调用方负责 commit/close。"""
    if isinstance(db_or_factory, Session):
        return db_or_factory, False
    if callable(db_or_factory):
        return db_or_factory(), True
    raise TypeError("db_session_factory must be a Session or a callable returning Session")


def run_job_run(
    db_session_factory: Session | SessionFactory,
    job_run_id: UUID | str,
) -> None:
    """端到端执行一次 JobRun（pending 或可重入）。

    参数
    ----------
    db_session_factory:
        SQLAlchemy Session（测试/同步 API）或零参工厂（Celery worker）。
    job_run_id:
        待执行 JobRun 主键。

    状态流转：``pending → running → succeeded | failed | partial``。
    不做任务级互斥锁，允许并行多次运行。
    """
    job_run_id = _as_uuid(job_run_id)
    db, owns = _resolve_session(db_session_factory)
    try:
        _run_pipeline(db, job_run_id)
        if owns:
            db.commit()
    except Exception:
        if owns:
            db.rollback()
        raise
    finally:
        if owns:
            db.close()


def _run_pipeline(db: Session, job_run_id: UUID) -> None:
    """管线主体：load → start → query → [skip] → render → deliver → finish。

    顶层异常捕获后将 JobRun 标 FAILED 并写 error 日志；渠道级异常不中断循环。
    """
    run = db.get(JobRun, job_run_id)
    if run is None:
        raise ValueError(f"job_run not found: {job_run_id}")

    job = db.get(PushJob, run.push_job_id)
    if job is None:
        run.status = JobRunStatus.FAILED
        run.error_message = f"push_job not found: {run.push_job_id}"
        run.finished_at = _utcnow()
        _log(db, job_run_id, "load", run.error_message, level=LogLevel.ERROR)
        db.commit()
        return

    # --- 启动 ---
    run.status = JobRunStatus.RUNNING
    run.started_at = run.started_at or _utcnow()
    run.config_snapshot = build_config_snapshot(job)
    run.error_message = None
    _log(db, job_run_id, "start", f"job run started for push_job={job.name!r}")
    db.commit()

    params: dict[str, Any] = dict(run.params or {})

    try:
        # --- 查询 ---
        ds = db.get(DataSource, job.data_source_id)
        if ds is None:
            raise RuntimeError(f"data_source not found: {job.data_source_id}")

        ds_plugin = plugin_registry.get("datasource", ds.type)
        ds_config = decrypt_dict(ds.config_enc)
        _log(db, job_run_id, "query", f"executing SQL via datasource type={ds.type!r}")
        db.commit()

        from app.modules.studio.migrate import extract_artboard, is_artboard_spec
        from app.modules.studio.sql_params import resolve_sql_params

        artboard_doc = extract_artboard(job.render_spec)
        if artboard_doc is None and isinstance(job.render_spec, dict) and is_artboard_spec(
            job.render_spec
        ):
            artboard_doc = job.render_spec

        # 主数据集：任务 SQL + artboard main 槽的 param 定义
        main_defs: list = []
        if isinstance(artboard_doc, dict):
            for ds_def in artboard_doc.get("datasets") or []:
                if isinstance(ds_def, dict) and str(ds_def.get("id") or "main") == "main":
                    if isinstance(ds_def.get("params"), list):
                        main_defs = ds_def["params"]
                    break
        _sql, main_resolved = resolve_sql_params(
            job.query_sql, param_defs=main_defs, overrides=params
        )
        result: QueryResult = ds_plugin.execute(ds_config, job.query_sql, main_resolved)
        row_count = len(result.rows or [])
        _log(
            db,
            job_run_id,
            "query",
            f"query returned {row_count} row(s), {len(result.columns or [])} column(s); "
            f"params={{{', '.join(f'{k}={v}' for k, v in list(main_resolved.items())[:8])}}}",
        )
        db.commit()

        # 多数据集 artboard：执行非 main 槽
        data_ctx: dict[str, QueryResult] = {"main": result}
        if isinstance(artboard_doc, dict):
            for ds_def in artboard_doc.get("datasets") or []:
                if not isinstance(ds_def, dict):
                    continue
                slot = str(ds_def.get("id") or "main")
                if slot == "main":
                    continue
                raw_ds = ds_def.get("data_source_id") or job.data_source_id
                sql_extra = str(ds_def.get("sql") or "").strip()
                if not sql_extra:
                    continue
                try:
                    extra_ds = db.get(DataSource, _as_uuid(raw_ds))
                    if extra_ds is None:
                        continue
                    extra_plugin = plugin_registry.get("datasource", extra_ds.type)
                    extra_cfg = decrypt_dict(extra_ds.config_enc)
                    pdefs = ds_def.get("params") if isinstance(ds_def.get("params"), list) else []
                    ov = dict(params)
                    if isinstance(ds_def.get("param_values"), dict):
                        ov.update(ds_def["param_values"])
                    _s, resolved = resolve_sql_params(
                        sql_extra, param_defs=pdefs, overrides=ov
                    )
                    data_ctx[slot] = extra_plugin.execute(extra_cfg, sql_extra, resolved)
                    _log(
                        db,
                        job_run_id,
                        "query",
                        f"dataset {slot!r}: {len(data_ctx[slot].rows or [])} row(s)",
                    )
                except Exception as exc:  # noqa: BLE001
                    _log(
                        db,
                        job_run_id,
                        "query",
                        f"dataset {slot!r} failed: {exc}",
                        level=LogLevel.ERROR,
                    )
            db.commit()

        # --- 空结果跳过 ---
        if row_count == 0 and job.skip_if_empty:
            _log(
                db,
                job_run_id,
                "skip",
                "skip_if_empty=true and query returned 0 rows; marking succeeded",
            )
            run.status = JobRunStatus.SUCCEEDED
            run.finished_at = _utcnow()
            db.commit()
            return

        # --- 渲染 ---
        _log(db, job_run_id, "render", "rendering message from query result")
        message = render_message(result, job.render_spec, params, data_ctx=data_ctx)
        _log(
            db,
            job_run_id,
            "render",
            f"rendered {len(message.parts)} message part(s)",
        )
        db.commit()

        # --- 逐渠道投递 ---
        channel_ids = [_as_uuid(cid) for cid in (job.channel_ids or [])]
        if not channel_ids:
            raise RuntimeError("push job has no channel_ids")

        successes = 0
        failures = 0

        for cid in channel_ids:
            delivery = Delivery(
                job_run_id=job_run_id,
                channel_id=cid,
                status=DeliveryStatus.RUNNING,
            )
            db.add(delivery)
            db.flush()

            channel = db.get(Channel, cid)
            if channel is None:
                delivery.status = DeliveryStatus.FAILED
                delivery.error_message = f"channel not found: {cid}"
                delivery.finished_at = _utcnow()
                failures += 1
                _log(
                    db,
                    job_run_id,
                    "deliver",
                    delivery.error_message,
                    level=LogLevel.ERROR,
                )
                db.commit()
                continue

            try:
                ch_plugin = plugin_registry.get("channel", channel.type)
                ch_config = decrypt_dict(channel.config_enc)
                ch_config = resolve_recipient_ids(db, cid, channel.type, ch_config)
                _log(
                    db,
                    job_run_id,
                    "deliver",
                    f"sending to channel id={cid} type={channel.type!r} name={channel.name!r}",
                )
                db.commit()

                dr = ch_plugin.send(ch_config, message)
                delivery.finished_at = _utcnow()
                if dr.success:
                    delivery.status = DeliveryStatus.SUCCESS
                    delivery.provider_msg_id = dr.provider_msg_id
                    successes += 1
                    _log(
                        db,
                        job_run_id,
                        "deliver",
                        f"channel {cid} succeeded provider_msg_id={dr.provider_msg_id!r}",
                    )
                else:
                    delivery.status = DeliveryStatus.FAILED
                    delivery.error_message = dr.error or "channel send failed"
                    failures += 1
                    _log(
                        db,
                        job_run_id,
                        "deliver",
                        f"channel {cid} failed: {delivery.error_message}",
                        level=LogLevel.ERROR,
                    )
            except Exception as exc:  # noqa: BLE001 — 单渠道隔离
                delivery.status = DeliveryStatus.FAILED
                delivery.error_message = str(exc)
                delivery.finished_at = _utcnow()
                failures += 1
                _log(
                    db,
                    job_run_id,
                    "deliver",
                    f"channel {cid} exception: {exc}",
                    level=LogLevel.ERROR,
                )
            db.commit()

        # --- 终态 ---
        if failures == 0:
            run.status = JobRunStatus.SUCCEEDED
            run.error_message = None
        elif successes == 0:
            run.status = JobRunStatus.FAILED
            run.error_message = f"all {failures} channel delivery(ies) failed"
        else:
            run.status = JobRunStatus.PARTIAL
            run.error_message = f"{failures} of {successes + failures} channel delivery(ies) failed"

        run.finished_at = _utcnow()
        _log(
            db,
            job_run_id,
            "finish",
            f"job run finished with status={run.status}",
            level=LogLevel.INFO if run.status == JobRunStatus.SUCCEEDED else LogLevel.WARNING,
        )
        db.commit()

    except Exception as exc:
        logger.exception("job_run %s failed", job_run_id)
        run.status = JobRunStatus.FAILED
        run.error_message = str(exc)
        run.finished_at = _utcnow()
        _log(
            db,
            job_run_id,
            "error",
            f"{exc}\n{traceback.format_exc()}",
            level=LogLevel.ERROR,
        )
        db.commit()
