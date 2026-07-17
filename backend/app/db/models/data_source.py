"""外部数据源配置模型：连接信息加密存于 config_enc。"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DataSource(Base):
    """已配置的外部数据源（MySQL / Doris / SQLite / SQL Server 等）。

    - ``type``: 对应 DataSourcePlugin 注册名（如 ``mysql``、``sqlite``）
    - ``config_enc``: Fernet 加密 JSON（host/user/password 或 sqlite path 等）
    """

    __tablename__ = "data_sources"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    config_enc: Mapped[str] = mapped_column(Text, nullable=False)
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
