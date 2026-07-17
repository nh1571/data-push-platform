"""推送任务 CRUD 与手动触发运行端点（鉴权由路由 dependencies 注入）。"""


from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import Channel, DataSource, JobRun, JobRunStatus, PushJob
from app.db.session import get_db
from app.modules.config_svc.schemas import (
    PushJobCreate,
    PushJobDraftCreate,
    PushJobOut,
    PushJobUpdate,
)
from app.modules.execution.pipeline import run_job_run
from app.modules.execution.schemas import JobRunOut, PushJobRunRequest

router = APIRouter()

DEFAULT_DRAFT_SQL = "-- 在编辑器中编写 SQL\nSELECT 1 AS demo"

DEFAULT_DRAFT_RENDER_SPEC: dict[str, Any] = {
    "design": {
        "output_mode": "image",
        "template_id": "report_v1",
        "include_markdown_table": True,
        "show_table": True,
        "color_ratios": True,
        "header_text": "",
        "footer_text": "",
        "title": "",
        "theme_color": "#1677ff",
        "render_engine": "auto",
    }
}


def _channel_ids_as_str(ids: list[UUID] | list[str]) -> list[str]:
    """渠道 ID 列表转字符串。"""
    return [str(i) for i in ids]


def _to_out(
    row: PushJob,
    *,
    last_run: JobRun | None = None,
) -> PushJobOut:
    """PushJob ORM → PushJobOut（可选附带最近运行）。"""
    raw_ids = row.channel_ids or []
    return PushJobOut(
        id=row.id,
        name=row.name,
        enabled=row.enabled,
        skip_if_empty=row.skip_if_empty,
        data_source_id=row.data_source_id,
        query_sql=row.query_sql,
        render_spec=row.render_spec,
        channel_ids=_channel_ids_as_str(raw_ids),
        schedule_cron=row.schedule_cron,
        schedule_enabled=row.schedule_enabled,
        created_at=row.created_at,
        updated_at=row.updated_at,
        last_run_id=last_run.id if last_run else None,
        last_run_status=last_run.status if last_run else None,
        last_run_at=last_run.started_at if last_run else None,
    )


def _get_or_404(db: Session, job_id: UUID) -> PushJob:
    """按 id 取任务，不存在 404。"""
    row = db.get(PushJob, job_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="push job not found")
    return row


def _ensure_data_source(db: Session, data_source_id: UUID) -> None:
    """校验 data_source_id 存在。"""
    if db.get(DataSource, data_source_id) is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"data_source_id not found: {data_source_id}",
        )


def _ensure_channels(db: Session, channel_ids: list[UUID]) -> None:
    """校验渠道 ID（可为空，支持草稿任务）。"""
    if not channel_ids:
        return
    found = set(
        db.scalars(select(Channel.id).where(Channel.id.in_(channel_ids))).all()
    )
    missing = [str(cid) for cid in channel_ids if cid not in found]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"channel_ids not found: {missing}",
        )


@router.get("", response_model=list[PushJobOut])
def list_push_jobs(db: Session = Depends(get_db)) -> list[PushJobOut]:
    """列出推送任务（附带各任务最近一次运行摘要）。"""
    rows = list(db.scalars(select(PushJob).order_by(PushJob.created_at.desc())).all())
    if not rows:
        return []
    job_ids = [r.id for r in rows]
    runs = list(
        db.scalars(
            select(JobRun)
            .where(JobRun.push_job_id.in_(job_ids))
            .order_by(JobRun.started_at.desc())
        ).all()
    )
    latest: dict[UUID, JobRun] = {}
    for run in runs:
        if run.push_job_id not in latest:
            latest[run.push_job_id] = run
    return [_to_out(r, last_run=latest.get(r.id)) for r in rows]


@router.post("/draft", response_model=PushJobOut, status_code=status.HTTP_201_CREATED)
def create_draft_push_job(
    body: PushJobDraftCreate,
    db: Session = Depends(get_db),
) -> PushJobOut:
    """用默认 SQL/design 创建草稿任务，内容在推送编辑器中完善。"""
    _ensure_data_source(db, body.data_source_id)

    row = PushJob(
        name=body.name,
        enabled=body.enabled,
        skip_if_empty=False,
        data_source_id=body.data_source_id,
        query_sql=DEFAULT_DRAFT_SQL,
        render_spec=dict(DEFAULT_DRAFT_RENDER_SPEC),
        channel_ids=[],
        schedule_cron=None,
        schedule_enabled=False,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.post("", response_model=PushJobOut, status_code=status.HTTP_201_CREATED)
def create_push_job(body: PushJobCreate, db: Session = Depends(get_db)) -> PushJobOut:
    """完整创建推送任务。"""
    _ensure_data_source(db, body.data_source_id)
    _ensure_channels(db, body.channel_ids)

    row = PushJob(
        name=body.name,
        enabled=body.enabled,
        skip_if_empty=body.skip_if_empty,
        data_source_id=body.data_source_id,
        query_sql=body.query_sql,
        render_spec=body.render_spec,
        channel_ids=_channel_ids_as_str(body.channel_ids),
        schedule_cron=body.schedule_cron,
        schedule_enabled=body.schedule_enabled,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.get("/{job_id}", response_model=PushJobOut)
def get_push_job(job_id: UUID, db: Session = Depends(get_db)) -> PushJobOut:
    """获取单个推送任务。"""
    return _to_out(_get_or_404(db, job_id))


@router.put("/{job_id}", response_model=PushJobOut)
def update_push_job(
    job_id: UUID,
    body: PushJobUpdate,
    db: Session = Depends(get_db),
) -> PushJobOut:
    """部分更新推送任务字段。"""
    row = _get_or_404(db, job_id)
    data = body.model_dump(exclude_unset=True)

    if "data_source_id" in data and data["data_source_id"] is not None:
        _ensure_data_source(db, data["data_source_id"])
        row.data_source_id = data["data_source_id"]
    if "channel_ids" in data and data["channel_ids"] is not None:
        _ensure_channels(db, data["channel_ids"])
        row.channel_ids = _channel_ids_as_str(data["channel_ids"])

    for field in (
        "name",
        "enabled",
        "skip_if_empty",
        "query_sql",
        "render_spec",
        "schedule_cron",
        "schedule_enabled",
    ):
        if field in data:
            setattr(row, field, data[field])

    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_push_job(job_id: UUID, db: Session = Depends(get_db)) -> None:
    """删除推送任务。"""
    row = _get_or_404(db, job_id)
    db.delete(row)
    db.commit()


@router.post("/{job_id}/run", response_model=JobRunOut, status_code=status.HTTP_201_CREATED)
def run_push_job(
    job_id: UUID,
    body: PushJobRunRequest | None = None,
    db: Session = Depends(get_db),
) -> JobRunOut:
    """创建 JobRun 并同步执行或经 Celery 入队。

    ``settings.execution_sync=True``（默认）时在响应前进程内跑管线；
    否则入队 Celery，响应中状态为初始 ``pending``。
    """
    job = _get_or_404(db, job_id)
    req = body or PushJobRunRequest()
    params: dict[str, Any] | None = req.params
    trigger_type = req.trigger_type or "manual"

    run = JobRun(
        push_job_id=job.id,
        status=JobRunStatus.PENDING,
        trigger_type=trigger_type,
        params=params,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    if settings.execution_sync:
        run_job_run(db, run.id)
        db.refresh(run)
    else:
        # Lazy import so API tests without Celery broker stay lightweight.
        from app.worker.tasks import run_job_run_task

        run_job_run_task.delay(str(run.id))

    return JobRunOut.model_validate(run)
