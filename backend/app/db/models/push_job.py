"""推送任务定义模型：数据源 + SQL + 渲染规格 + 通道 + 可选 Cron。"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text, Uuid, false, func, true
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PushJob(Base):
    """定时或按需的推送任务定义。

    核心字段：
    - ``data_source_id`` / ``query_sql``: 取数
    - ``render_spec``: 渲染插件类型与配置（JSON）
    - ``channel_ids``: 目标通道 UUID 列表（JSON）
    - ``schedule_cron`` / ``schedule_enabled``: 是否纳入调度器
    - ``skip_if_empty``: 查询无行时是否跳过投递
    - ``last_schedule_slot``: 调度器防重入的分钟槽标记
    """

    __tablename__ = "push_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=true(),
    )
    skip_if_empty: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=false(),
    )
    data_source_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("data_sources.id"),
        nullable=False,
    )
    query_sql: Mapped[str] = mapped_column(Text, nullable=False)
    render_spec: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    channel_ids: Mapped[list[Any]] = mapped_column(JSON, nullable=False)
    push_target_ids: Mapped[list[Any]] = mapped_column(JSON, nullable=False)
    schedule_cron: Mapped[str | None] = mapped_column(String(128), nullable=True)
    schedule_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=false(),
    )
    # 调度器上次触发的分钟槽，例如 "2024-01-01T12:00"（UTC）。
    # 防止 tick 循环同一分钟内重复开火。
    last_schedule_slot: Mapped[str | None] = mapped_column(String(32), nullable=True)
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
