"""Cron 滴答：触发 schedule_enabled 且 cron 命中当前分钟的推送任务。

防双触发：写入 ``PushJob.last_schedule_slot``（UTC 分钟串，如 2024-01-01T12:00）。
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
    """返回 *when* 的 UTC 分钟槽键（如 ``2024-01-01T12:00``）。"""
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    else:
        when = when.astimezone(timezone.utc)
    when = when.replace(second=0, microsecond=0)
    return when.strftime("%Y-%m-%dT%H:%M")


def _cron_matches(expr: str, when: datetime) -> bool:
    """*expr*（5 段 cron）是否在 *when* 所在分钟触发。"""
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
    """为 *job* 创建 scheduled JobRun 并同步执行或入队。

    执行前先写 ``last_schedule_slot``，即使管线较慢，同分钟二次 tick 也不会重触。
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
    """扫描开启调度的任务，触发 cron 命中当前分钟者。

    Parameters
    ----------
    db:
        SQLAlchemy 会话。
    now:
        可注入时钟（测试）；默认 UTC 当前时间。

    Returns
    -------
    list[UUID]
        本轮创建的 JobRun id 列表。
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

        # 仅 schedule_enabled 不够：enabled=false 的任务仍跳过
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
    """便捷包装：返回简要状态 dict（供日志/CLI）。"""
    run_ids = tick(db, now=now)
    return {
        "fired": len(run_ids),
        "run_ids": [str(r) for r in run_ids],
        "slot": slot_for(now or datetime.now(timezone.utc)),
    }
