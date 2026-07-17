"""Studio 模板表 CRUD，并在列表时种子化系统内置模板。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.studio_template import StudioTemplate
from app.modules.studio.defaults import (
    default_alert_artboard,
    default_daily_artboard,
    empty_artboard,
)


def seed_system_templates(db: Session) -> int:
    """按 scene_id 幂等插入内置模板；返回本次插入条数。"""
    builtins = [
        ("daily_report", "院区/业务日报", "KPI + 表 + 柱状/折线", default_daily_artboard()),
        ("alert", "指标告警", "告警条 + 异常表", default_alert_artboard()),
        ("blank", "空白画板", "从零拼装", empty_artboard()),
    ]
    inserted = 0
    for scene_id, name, desc, artboard in builtins:
        exists = db.scalars(
            select(StudioTemplate).where(
                StudioTemplate.scene_id == scene_id,
                StudioTemplate.is_system.is_(True),
            )
        ).first()
        if exists:
            continue
        db.add(
            StudioTemplate(
                name=name,
                description=desc,
                scene_id=scene_id,
                artboard=artboard,
                is_system=True,
                enabled=True,
            )
        )
        inserted += 1
    if inserted:
        db.commit()
    return inserted


def list_templates(db: Session, *, include_disabled: bool = False) -> list[StudioTemplate]:
    """列出模板（先种子化系统模板）；默认不含禁用项。"""
    seed_system_templates(db)
    q = select(StudioTemplate).order_by(
        StudioTemplate.is_system.desc(),
        StudioTemplate.name.asc(),
    )
    if not include_disabled:
        q = q.where(StudioTemplate.enabled.is_(True))
    return list(db.scalars(q).all())


def get_template(db: Session, template_id: UUID) -> StudioTemplate:
    """按 id 取模板；不存在 404。"""
    row = db.get(StudioTemplate, template_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="template not found")
    return row


def create_template(
    db: Session,
    *,
    name: str,
    artboard: dict[str, Any],
    description: str | None = None,
    scene_id: str | None = None,
    is_system: bool = False,
) -> StudioTemplate:
    """创建用户（或系统）模板。"""
    row = StudioTemplate(
        name=name.strip(),
        description=description,
        scene_id=scene_id,
        artboard=artboard,
        is_system=is_system,
        enabled=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_template(
    db: Session,
    template_id: UUID,
    *,
    name: str | None = None,
    description: str | None = None,
    artboard: dict[str, Any] | None = None,
    enabled: bool | None = None,
) -> StudioTemplate:
    """更新模板字段；系统模板也可改 artboard。"""
    row = get_template(db, template_id)
    if row.is_system and artboard is not None:
        # 系统模板允许改名/描述；运维可覆盖 artboard
        pass
    if name is not None:
        row.name = name.strip()
    if description is not None:
        row.description = description
    if artboard is not None:
        row.artboard = artboard
    if enabled is not None:
        row.enabled = enabled
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def delete_template(db: Session, template_id: UUID) -> None:
    """删除非系统模板；系统模板请禁用。"""
    row = get_template(db, template_id)
    if row.is_system:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="cannot delete system template; disable it instead",
        )
    db.delete(row)
    db.commit()


def to_out(row: StudioTemplate) -> dict[str, Any]:
    """ORM 行 → API 字典（id 字符串化，时间 ISO）。"""
    return {
        "id": str(row.id),
        "name": row.name,
        "description": row.description,
        "scene_id": row.scene_id,
        "artboard": row.artboard,
        "is_system": row.is_system,
        "enabled": row.enabled,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }
