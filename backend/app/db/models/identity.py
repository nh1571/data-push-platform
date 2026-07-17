"""通讯录身份模型：统一管理各通道上的用户与群标识。

每个身份对应某个通道（钉钉/企微等）上的一个人或一个群，
通过 :class:`ChannelRecipient` 关联到具体通道配置。
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Uuid, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Identity(Base):
    """通讯录身份——通道上的一个人或一个群。

    - ``kind``: ``person`` | ``group``
    - ``channel_type``: 通道命名空间（``dingtalk``、``wecom`` 等）
    - ``external_id``: 该通道上的唯一标识（钉钉 userId、群 open_conversation_id 等）
    """

    __tablename__ = "identities"
    __table_args__ = (
        UniqueConstraint("channel_type", "kind", "external_id", name="uq_identity_channel_ext"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    channel_type: Mapped[str] = mapped_column(String(64), nullable=False)
    external_id: Mapped[str] = mapped_column(String(255), nullable=False)
    external_name: Mapped[str | None] = mapped_column(String(128), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<Identity {self.id} {self.name} {self.channel_type}/{self.kind}>"


class ChannelRecipient(Base):
    """通道-身份关联：一个通道配置可以向哪些身份推送。

    取代原来写死在 ``channels.config_enc`` 里的 ``user_ids`` / ``userid_list`` /
    ``open_conversation_id`` 字符串。
    """

    __tablename__ = "channel_recipients"
    __table_args__ = (
        UniqueConstraint("channel_id", "identity_id", name="uq_channel_recipient"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    channel_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("channels.id", ondelete="CASCADE"), nullable=False
    )
    identity_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("identities.id", ondelete="CASCADE"), nullable=False
    )

    # 方便 join 查询
    identity: Mapped[Identity] = relationship("Identity", lazy="joined")

    def __repr__(self) -> str:
        return f"<ChannelRecipient ch={self.channel_id} → {self.identity_id}>"
