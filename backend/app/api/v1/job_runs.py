"""JobRun list / detail / rerun endpoints (auth via router dependencies)."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import Delivery, JobRun, JobRunLog, JobRunStatus, PushJob, TriggerType
from app.db.session import get_db
from app.modules.execution.pipeline import run_job_run
from app.modules.execution.schemas import (
    DeliveryOut,
    JobRunDetailOut,
    JobRunLogOut,
    JobRunOut,
)

router = APIRouter()


def _to_out(row: JobRun) -> JobRunOut:
    return JobRunOut.model_validate(row)


def _to_detail(row: JobRun, deliveries: list[Delivery], logs: list[JobRunLog]) -> JobRunDetailOut:
    base = JobRunOut.model_validate(row)
    return JobRunDetailOut(
        **base.model_dump(),
        deliveries=[DeliveryOut.model_validate(d) for d in deliveries],
        logs=[JobRunLogOut.model_validate(lg) for lg in logs],
    )


@router.get("", response_model=list[JobRunOut])
def list_job_runs(
    status_filter: str | None = Query(default=None, alias="status"),
    push_job_id: UUID | None = None,
    trigger_type: str | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[JobRunOut]:
    """List job runs with optional filters (status, push_job_id, trigger_type)."""
    stmt = select(JobRun).order_by(JobRun.created_at.desc())
    if status_filter is not None:
        stmt = stmt.where(JobRun.status == status_filter)
    if push_job_id is not None:
        stmt = stmt.where(JobRun.push_job_id == push_job_id)
    if trigger_type is not None:
        stmt = stmt.where(JobRun.trigger_type == trigger_type)
    stmt = stmt.limit(limit).offset(offset)
    rows = db.scalars(stmt).all()
    return [_to_out(r) for r in rows]


@router.get("/{run_id}", response_model=JobRunDetailOut)
def get_job_run(run_id: UUID, db: Session = Depends(get_db)) -> JobRunDetailOut:
    """Return a single job run including deliveries and logs."""
    row = db.get(JobRun, run_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job run not found")

    deliveries = list(
        db.scalars(
            select(Delivery)
            .where(Delivery.job_run_id == run_id)
            .order_by(Delivery.started_at.asc())
        ).all()
    )
    logs = list(
        db.scalars(
            select(JobRunLog)
            .where(JobRunLog.job_run_id == run_id)
            .order_by(JobRunLog.created_at.asc())
        ).all()
    )
    return _to_detail(row, deliveries, logs)


@router.post("/{run_id}/rerun", response_model=JobRunOut, status_code=status.HTTP_201_CREATED)
def rerun_job_run(run_id: UUID, db: Session = Depends(get_db)) -> JobRunOut:
    """Create a NEW JobRun linked via ``parent_run_id`` with ``trigger_type=rerun``.

    Execution uses the **latest** PushJob config (pipeline loads the current
    job by ``push_job_id``), not the parent run's ``config_snapshot``.
    Parent ``params`` are copied onto the new run.
    """
    parent = db.get(JobRun, run_id)
    if parent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job run not found")

    # Ensure the push job still exists (pipeline would fail otherwise).
    job = db.get(PushJob, parent.push_job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="push job for this run no longer exists",
        )

    params: dict[str, Any] | None = parent.params
    new_run = JobRun(
        push_job_id=parent.push_job_id,
        status=JobRunStatus.PENDING,
        trigger_type=TriggerType.RERUN,
        params=params,
        parent_run_id=parent.id,
        trigger_meta={"parent_run_id": str(parent.id)},
    )
    db.add(new_run)
    db.commit()
    db.refresh(new_run)

    if settings.execution_sync:
        run_job_run(db, new_run.id)
        db.refresh(new_run)
    else:
        from app.worker.tasks import run_job_run_task

        run_job_run_task.delay(str(new_run.id))

    return _to_out(new_run)
