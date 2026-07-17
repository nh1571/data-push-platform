"""投递通道配置模型：钉钉/Webhook 等，敏感字段加密存于 config_enc。"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Channel(Base):
    """推送通道定义（webhook、工作通知、OpenAPI 机器人等）。

    - ``type``: 对应 ChannelPlugin 注册名（如 ``dingtalk.webhook_robot``）
    - ``config_enc``: Fernet 加密后的 JSON 配置（密钥、token、userid 等）
    """

    __tablename__ = "channels"

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
