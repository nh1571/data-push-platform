"""内容工作台画板模板：用户/系统模板存储于元数据库。"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, String, Text, Uuid, false, func, true
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class StudioTemplate(Base):
    """可复用的画板（artboard）文档，供内容工作室 / 模板库使用。

    - ``artboard``: 前端画板 JSON 文档（节点、样式、数据绑定等）
    - ``scene_id``: 可选场景分类标识
    - ``is_system``: 系统内置模板（通常不可删除）
    - ``enabled``: 是否对用户可见/可选
    """

    __tablename__ = "studio_templates"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(String(512), nullable=True)
    scene_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    artboard: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    is_system: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=false(),
    )
    enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=true(),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
