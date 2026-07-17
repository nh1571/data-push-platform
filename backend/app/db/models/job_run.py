"""任务运行实例模型：一次 PushJob 的完整执行记录。"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class JobRun(Base):
    """推送任务的单次执行实例。

    流水线（query → render → deliver）全程围绕 JobRun 落库：
    - ``status`` / ``error_message``: 整体结果
    - ``trigger_type`` / ``trigger_meta``: 手动、定时、API 等触发上下文
    - ``params``: 运行参数（如 biz_date），用于 SQL 占位符替换
    - ``config_snapshot``: 运行时冻结的任务配置快照，便于事后审计与重跑
    - ``parent_run_id``: 重试/重跑时指向父运行
    """

    __tablename__ = "job_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    push_job_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("push_jobs.id"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    trigger_type: Mapped[str] = mapped_column(String(32), nullable=False)
    trigger_meta: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    params: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    config_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    parent_run_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("job_runs.id"),
        nullable=True,
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
