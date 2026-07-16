"""JobRun read endpoints (auth via router dependencies)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.models import JobRun
from app.db.session import get_db
from app.modules.execution.schemas import JobRunOut

router = APIRouter()


def _to_out(row: JobRun) -> JobRunOut:
    return JobRunOut.model_validate(row)


@router.get("/{run_id}", response_model=JobRunOut)
def get_job_run(run_id: UUID, db: Session = Depends(get_db)) -> JobRunOut:
    """Return a single job run by id (minimal verification endpoint)."""
    row = db.get(JobRun, run_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job run not found")
    return _to_out(row)
