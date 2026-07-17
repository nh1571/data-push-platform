"""编辑器 / Studio 工作台 API：预览、试推、保存、模板与画板编译。"""

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
    StudioTemplateCreateRequest,
    StudioTemplateResponse,
    StudioTemplateUpdateRequest,
    StudioTestPushRequest,
    TestPushRequest,
    TestPushResponse,
)
from app.modules.studio import service as studio_service
from app.modules.studio import templates_repo
from app.modules.studio.sql_params import list_auto_kinds, preview_resolved_params
from app.modules.studio.themes import list_table_styles, list_theme_packs

router = APIRouter()


def _job_to_out(row: PushJob) -> PushJobOut:
    """将 PushJob 数据库行转为 PushJobOut 响应模型。"""
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
    """执行 SQL 预览（含参数解析）。"""
    return editor_service.query_preview(
        db,
        body.data_source_id,
        body.sql,
        body.params,
        max_rows=body.max_rows,
        param_defs=body.param_defs,
    )


@router.post("/message-preview", response_model=MessagePreviewResponse)
def message_preview(
    body: MessagePreviewRequest,
    db: Session = Depends(get_db),
) -> MessagePreviewResponse:
    """design 模式消息预览。"""
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
    """design 模式图片预览。"""
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
    """design 模式试推到指定渠道。"""
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
    """从编辑器保存（创建/更新）推送任务。"""
    row = editor_service.save_job(db, body)
    return _job_to_out(row)


@router.get("/studio/templates", response_model=list[StudioTemplateResponse])
def studio_templates(db: Session = Depends(get_db)) -> list[StudioTemplateResponse]:
    """列出 Studio 模板。"""
    rows = templates_repo.list_templates(db)
    return [StudioTemplateResponse(**templates_repo.to_out(r)) for r in rows]


@router.post("/studio/templates", response_model=StudioTemplateResponse)
def studio_template_create(
    body: StudioTemplateCreateRequest,
    db: Session = Depends(get_db),
) -> StudioTemplateResponse:
    """创建用户 Studio 模板。"""
    row = templates_repo.create_template(
        db,
        name=body.name,
        artboard=body.artboard,
        description=body.description,
        scene_id=body.scene_id,
        is_system=False,
    )
    return StudioTemplateResponse(**templates_repo.to_out(row))


@router.put("/studio/templates/{template_id}", response_model=StudioTemplateResponse)
def studio_template_update(
    template_id: UUID,
    body: StudioTemplateUpdateRequest,
    db: Session = Depends(get_db),
) -> StudioTemplateResponse:
    """更新 Studio 模板。"""
    row = templates_repo.update_template(
        db,
        template_id,
        name=body.name,
        description=body.description,
        artboard=body.artboard,
        enabled=body.enabled,
    )
    return StudioTemplateResponse(**templates_repo.to_out(row))


@router.delete("/studio/templates/{template_id}", status_code=204)
def studio_template_delete(
    template_id: UUID,
    db: Session = Depends(get_db),
) -> None:
    """删除非系统 Studio 模板。"""
    templates_repo.delete_template(db, template_id)


@router.get("/studio/meta")
def studio_meta() -> dict:
    """设计器元数据：主题包、表格样式、组件类型、可见性预设等。"""
    return {
        "theme_packs": list_theme_packs(),
        "table_styles": list_table_styles(),
        "chart_types": [
            {"id": "bar", "label": "柱状图"},
            {"id": "line", "label": "折线图"},
            {"id": "pie", "label": "饼图"},
        ],
        "sql_auto_params": list_auto_kinds(),
        "visible_when_presets": [
            {"id": "always", "label": "始终显示"},
            {"id": "row_count>0", "label": "有数据时"},
            {"id": "row_count==0", "label": "无数据时"},
            {"id": "never", "label": "始终隐藏"},
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


@router.post("/studio/resolve-params")
def studio_resolve_params(body: dict) -> dict:
    """预览 SQL 参数解析结果（auto 日期等），不执行 SQL。"""
    sql = str(body.get("sql") or "")
    param_defs = body.get("param_defs") if isinstance(body.get("param_defs"), list) else []
    overrides = body.get("params") if isinstance(body.get("params"), dict) else {}
    return preview_resolved_params(sql, param_defs=param_defs, overrides=overrides)


@router.post("/studio/compile", response_model=StudioCompileResponse)
def studio_compile(
    body: StudioCompileRequest,
    db: Session = Depends(get_db),
) -> StudioCompileResponse:
    """编译画板并返回 HTML/MD/图预览。"""
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
    """以 artboard 保存推送任务。"""
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
    """Studio 画板试推。"""
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
