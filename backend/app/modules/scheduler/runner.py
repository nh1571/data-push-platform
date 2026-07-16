"""Cron tick: fire schedule-enabled push jobs whose cron matches the current minute.

Double-fire protection uses ``PushJob.last_schedule_slot`` (UTC minute string).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from croniter import croniter
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import JobRun, JobRunStatus, PushJob, TriggerType
from app.modules.execution.pipeline import run_job_run

logger = logging.getLogger(__name__)


def slot_for(when: datetime) -> str:
    """Return the UTC minute slot key for *when* (e.g. ``2024-01-01T12:00``)."""
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    else:
        when = when.astimezone(timezone.utc)
    when = when.replace(second=0, microsecond=0)
    return when.strftime("%Y-%m-%dT%H:%M")


def _cron_matches(expr: str, when: datetime) -> bool:
    """True if *expr* (5-field cron) fires at the minute of *when*."""
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    else:
        when = when.astimezone(timezone.utc)
    when = when.replace(second=0, microsecond=0)
    try:
        return bool(croniter.match(expr, when))
    except (ValueError, KeyError, TypeError) as exc:
        logger.warning("invalid cron expression %r: %s", expr, exc)
        return False


def _fire_job(db: Session, job: PushJob, *, slot: str, now: datetime) -> UUID | None:
    """Create a scheduled JobRun for *job* and execute/enqueue it.

    Updates ``last_schedule_slot`` before execution so a second tick in the
    same minute will not re-fire even if the pipeline is slow.
    """
    job.last_schedule_slot = slot
    run = JobRun(
        push_job_id=job.id,
        status=JobRunStatus.PENDING,
        trigger_type=TriggerType.SCHEDULE,
        trigger_meta={"slot": slot, "cron": job.schedule_cron},
        params=None,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    logger.info(
        "scheduler fired job_id=%s run_id=%s slot=%s",
        job.id,
        run.id,
        slot,
    )

    if settings.execution_sync:
        run_job_run(db, run.id)
    else:
        # Lazy import so the scheduler process can start without a broker.
        from app.worker.tasks import run_job_run_task

        run_job_run_task.delay(str(run.id))

    return run.id


def tick(
    db: Session,
    *,
    now: datetime | None = None,
) -> list[UUID]:
    """Scan schedule-enabled jobs and fire those matching the current minute.

    Parameters
    ----------
    db:
        SQLAlchemy session.
    now:
        Clock override for tests; defaults to UTC now.

    Returns
    -------
    list[UUID]
        Ids of JobRun rows created during this tick.
    """
    if now is None:
        now = datetime.now(timezone.utc)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    slot = slot_for(now)
    created: list[UUID] = []

    jobs = db.scalars(
        select(PushJob).where(
            PushJob.schedule_enabled.is_(True),
            PushJob.schedule_cron.is_not(None),
        )
    ).all()

    for job in jobs:
        cron_expr = (job.schedule_cron or "").strip()
        if not cron_expr:
            continue
        if job.last_schedule_slot == slot:
            continue
        if not _cron_matches(cron_expr, now):
            continue

        # Optionally skip disabled jobs (schedule_enabled alone is not enough).
        if not job.enabled:
            logger.debug("skip disabled job_id=%s despite schedule_enabled", job.id)
            continue

        try:
            run_id = _fire_job(db, job, slot=slot, now=now)
            if run_id is not None:
                created.append(run_id)
        except Exception:  # noqa: BLE001 — keep tick loop alive for other jobs
            logger.exception("scheduler failed to fire job_id=%s", job.id)
            db.rollback()

    return created


def tick_summary(db: Session, *, now: datetime | None = None) -> dict[str, Any]:
    """Convenience wrapper returning a small status dict (for logging/CLI)."""
    run_ids = tick(db, now=now)
    return {
        "fired": len(run_ids),
        "run_ids": [str(r) for r in run_ids],
        "slot": slot_for(now or datetime.now(timezone.utc)),
    }
