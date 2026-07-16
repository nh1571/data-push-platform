"""Editor APIs: query-preview, message-preview, test-push, save-job."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.models import PushJob
from app.db.session import get_db
from app.modules.config_svc.schemas import PushJobOut
from app.modules.editor import service as editor_service
from app.modules.editor.schemas import (
    MessagePreviewRequest,
    MessagePreviewResponse,
    QueryPreviewRequest,
    QueryPreviewResponse,
    SaveJobRequest,
    SaveJobResponse,
    TestPushRequest,
    TestPushResponse,
)

router = APIRouter()


def _job_to_out(row: PushJob) -> PushJobOut:
    raw_ids = row.channel_ids or []
    return PushJobOut(
        id=row.id,
        name=row.name,
        enabled=row.enabled,
        skip_if_empty=row.skip_if_empty,
        data_source_id=row.data_source_id,
        query_sql=row.query_sql,
        render_spec=row.render_spec,
        channel_ids=[str(i) for i in raw_ids],
        schedule_cron=row.schedule_cron,
        schedule_enabled=row.schedule_enabled,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.post("/query-preview", response_model=QueryPreviewResponse)
def query_preview(
    body: QueryPreviewRequest,
    db: Session = Depends(get_db),
) -> QueryPreviewResponse:
    return editor_service.query_preview(
        db,
        body.data_source_id,
        body.sql,
        body.params,
        max_rows=body.max_rows,
    )


@router.post("/message-preview", response_model=MessagePreviewResponse)
def message_preview(
    body: MessagePreviewRequest,
    db: Session = Depends(get_db),
) -> MessagePreviewResponse:
    return editor_service.message_preview(
        db,
        body.data_source_id,
        body.sql,
        body.design,
        body.params,
        max_rows=body.max_rows,
    )


@router.post("/test-push", response_model=TestPushResponse)
def test_push(
    body: TestPushRequest,
    db: Session = Depends(get_db),
) -> TestPushResponse:
    return editor_service.test_push(
        db,
        data_source_id=body.data_source_id,
        sql=body.sql,
        design=body.design,
        channel_ids=body.channel_ids,
        params=body.params,
        max_rows=body.max_rows,
        push_job_id=body.push_job_id,
    )


@router.post("/save-job", response_model=SaveJobResponse)
def save_job(
    body: SaveJobRequest,
    db: Session = Depends(get_db),
) -> PushJobOut:
    row = editor_service.save_job(db, body)
    return _job_to_out(row)
