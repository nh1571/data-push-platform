"""投递记录模型：某次 JobRun 对单个通道的一次发送尝试。"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Delivery(Base):
    """JobRun 内按通道维度的投递结果。

    - ``status``: 见 DeliveryStatus（pending/running/success/failed/skipped）
    - ``provider_msg_id``: 上游（如钉钉 task_id / processQueryKey）回执 id
    - ``channel_id`` 可空：通道被删除后仍保留历史投递记录
    """

    __tablename__ = "deliveries"

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
    channel_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("channels.id"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    provider_msg_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
