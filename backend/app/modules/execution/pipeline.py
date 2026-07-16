"""Push-job execution pipeline: query → render → deliver.

``render_spec`` formats (pick any; empty defaults to ``text_md``)::

    # Single renderer as dict
    {"type": "text_md", "config": {"title": "日报"}}

    # List of renderer parts
    [{"type": "text_md", "config": {}}, {"type": "text_md", "config": {"title": "B"}}]

    # Explicit parts wrapper
    {"parts": [{"type": "text_md", "config": {}}]}

JobRun status lifecycle::

    pending → running → succeeded | failed | partial
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
from app.plugins.base import Message, MessagePart, QueryResult
from app.plugins.registry import plugin_registry

logger = logging.getLogger(__name__)

SessionFactory = Callable[[], Session]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_uuid(value: UUID | str) -> UUID:
    return value if isinstance(value, UUID) else UUID(str(value))


def _log(
    db: Session,
    job_run_id: UUID,
    step: str,
    message: str,
    *,
    level: str = LogLevel.INFO,
) -> None:
    db.add(
        JobRunLog(
            job_run_id=job_run_id,
            step=step,
            level=level,
            message=message,
        )
    )


def build_config_snapshot(job: PushJob) -> dict[str, Any]:
    """Snapshot job definition fields at run start (no secrets)."""
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
    """Normalize ``render_spec`` into a list of ``{type, config}`` parts.

    Defaults to a single ``text_md`` part when empty / missing.
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
                # Allow flat keys next to type (e.g. {"type":"text_md","title":"x"})
                cfg = {k: v for k, v in item.items() if k not in ("type", "config")}
            parts.append({"type": str(rtype), "config": dict(cfg or {})})
        return parts or [{"type": "text_md", "config": {}}]

    if isinstance(render_spec, dict):
        if "parts" in render_spec and isinstance(render_spec["parts"], list):
            return normalize_render_parts(render_spec["parts"])
        rtype = render_spec.get("type") or "text_md"
        cfg = render_spec.get("config")
        if cfg is None:
            cfg = {k: v for k, v in render_spec.items() if k not in ("type", "config", "parts")}
        return [{"type": str(rtype), "config": dict(cfg or {})}]

    raise ValueError(f"unsupported render_spec type: {type(render_spec)!r}")


def render_message(
    result: QueryResult,
    render_spec: Any,
    params: dict[str, Any],
) -> Message:
    """Apply renderers from *render_spec* and return a composed :class:`Message`."""
    parts_out: list[MessagePart] = []
    for part_spec in normalize_render_parts(render_spec):
        renderer = plugin_registry.get("renderer", part_spec["type"])
        rendered = renderer.render(result, part_spec.get("config") or {}, params)
        parts_out.extend(rendered)
    return Message(parts=parts_out)


def _resolve_session(
    db_or_factory: Session | SessionFactory,
) -> tuple[Session, bool]:
    """Return ``(session, owns_session)``."""
    if isinstance(db_or_factory, Session):
        return db_or_factory, False
    if callable(db_or_factory):
        return db_or_factory(), True
    raise TypeError("db_session_factory must be a Session or a callable returning Session")


def run_job_run(
    db_session_factory: Session | SessionFactory,
    job_run_id: UUID | str,
) -> None:
    """Execute a pending (or re-entrant) job run end-to-end.

    Parameters
    ----------
    db_session_factory:
        Either a SQLAlchemy :class:`~sqlalchemy.orm.Session` (tests / sync API)
        or a zero-arg callable that returns a new Session (Celery worker).
    job_run_id:
        Primary key of the :class:`~app.db.models.job_run.JobRun` to execute.

    Status transitions: ``pending → running → succeeded | failed | partial``.
    Parallel runs are allowed (no job-level lock).
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

    # --- start ---
    run.status = JobRunStatus.RUNNING
    run.started_at = run.started_at or _utcnow()
    run.config_snapshot = build_config_snapshot(job)
    run.error_message = None
    _log(db, job_run_id, "start", f"job run started for push_job={job.name!r}")
    db.commit()

    params: dict[str, Any] = dict(run.params or {})

    try:
        # --- query ---
        ds = db.get(DataSource, job.data_source_id)
        if ds is None:
            raise RuntimeError(f"data_source not found: {job.data_source_id}")

        ds_plugin = plugin_registry.get("datasource", ds.type)
        ds_config = decrypt_dict(ds.config_enc)
        _log(db, job_run_id, "query", f"executing SQL via datasource type={ds.type!r}")
        db.commit()

        result: QueryResult = ds_plugin.execute(ds_config, job.query_sql, params)
        row_count = len(result.rows or [])
        _log(
            db,
            job_run_id,
            "query",
            f"query returned {row_count} row(s), {len(result.columns or [])} column(s)",
        )
        db.commit()

        # --- skip_if_empty ---
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

        # --- render ---
        _log(db, job_run_id, "render", "rendering message from query result")
        message = render_message(result, job.render_spec, params)
        _log(
            db,
            job_run_id,
            "render",
            f"rendered {len(message.parts)} message part(s)",
        )
        db.commit()

        # --- deliver to each channel ---
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
            except Exception as exc:  # noqa: BLE001 — per-channel isolation
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

        # --- final status ---
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
