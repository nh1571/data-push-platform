"""任务运行结构化日志模型：流水线各步骤的可读日志行。"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class JobRunLog(Base):
    """JobRun 执行过程中产生的一条结构化日志。

    - ``step``: 流水线步骤名（如 query / render / deliver）
    - ``level``: debug/info/warning/error
    - ``message``: 人类可读说明（含错误摘要、行数统计等）
    """

    __tablename__ = "job_run_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    job_run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("job_runs.id"),
        nullable=False,
    )
    step: Mapped[str] = mapped_column(String(64), nullable=False)
    level: Mapped[str] = mapped_column(String(16), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
