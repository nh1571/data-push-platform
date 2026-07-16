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
    ImagePreviewRequest,
    ImagePreviewResponse,
    MessagePreviewRequest,
    MessagePreviewResponse,
    QueryPreviewRequest,
    QueryPreviewResponse,
    SaveJobRequest,
    SaveJobResponse,
    StudioCompileRequest,
    StudioCompileResponse,
    StudioSaveJobRequest,
    StudioTemplateResponse,
    StudioTestPushRequest,
    TestPushRequest,
    TestPushResponse,
)
from app.modules.studio import service as studio_service
from app.modules.studio.defaults import (
    default_alert_artboard,
    default_daily_artboard,
    empty_artboard,
)
from app.modules.studio.themes import list_table_styles, list_theme_packs

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


@router.post("/image-preview", response_model=ImagePreviewResponse)
def image_preview(
    body: ImagePreviewRequest,
    db: Session = Depends(get_db),
) -> ImagePreviewResponse:
    return editor_service.image_preview(
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


@router.get("/studio/templates", response_model=list[StudioTemplateResponse])
def studio_templates() -> list[StudioTemplateResponse]:
    return [
        StudioTemplateResponse(
            id="daily_report",
            name="院区/业务日报",
            artboard=default_daily_artboard(),
        ),
        StudioTemplateResponse(
            id="alert",
            name="指标告警",
            artboard=default_alert_artboard(),
        ),
        StudioTemplateResponse(
            id="blank",
            name="空白画板",
            artboard=empty_artboard(),
        ),
    ]


@router.get("/studio/meta")
def studio_meta() -> dict:
    """Theme packs, table styles, component types for the designer."""
    return {
        "theme_packs": list_theme_packs(),
        "table_styles": list_table_styles(),
        "chart_types": [
            {"id": "bar", "label": "柱状图"},
            {"id": "line", "label": "折线图"},
            {"id": "pie", "label": "饼图"},
        ],
        "components": [
            {"type": "Text", "label": "文本"},
            {"type": "Kpi", "label": "KPI"},
            {"type": "Table", "label": "数据表"},
            {"type": "Chart", "label": "图表"},
            {"type": "Alert", "label": "告警条"},
            {"type": "Container", "label": "容器"},
            {"type": "Divider", "label": "分隔线"},
        ],
    }


@router.post("/studio/compile", response_model=StudioCompileResponse)
def studio_compile(
    body: StudioCompileRequest,
    db: Session = Depends(get_db),
) -> StudioCompileResponse:
    data = studio_service.studio_compile(
        db,
        artboard=body.artboard,
        data_source_id=body.data_source_id,
        sql=body.sql,
        params=body.params,
        max_rows=body.max_rows,
        want_image=body.want_image,
    )
    return StudioCompileResponse(**data)


@router.post("/studio/save-job", response_model=SaveJobResponse)
def studio_save_job(
    body: StudioSaveJobRequest,
    db: Session = Depends(get_db),
) -> PushJobOut:
    row = studio_service.save_job_with_artboard(
        db,
        job_id=body.id,
        name=body.name,
        data_source_id=body.data_source_id,
        sql=body.query_sql,
        artboard=body.artboard,
        channel_ids=body.channel_ids,
        skip_if_empty=body.skip_if_empty,
        enabled=body.enabled,
        schedule_cron=body.schedule_cron,
        schedule_enabled=body.schedule_enabled,
    )
    return _job_to_out(row)


@router.post("/studio/test-push")
def studio_test_push(
    body: StudioTestPushRequest,
    db: Session = Depends(get_db),
) -> dict:
    return studio_service.studio_test_push(
        db,
        artboard=body.artboard,
        data_source_id=body.data_source_id,
        sql=body.sql,
        channel_ids=body.channel_ids,
        params=body.params,
        max_rows=body.max_rows,
        push_job_id=body.push_job_id,
    )
