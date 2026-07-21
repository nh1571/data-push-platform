"""推送目标模型：推送能力（通道）+ 目的实体（身份列表）的组合。

每个有绑定身份的通道自动生成一个 PushTarget，作为推送内容的一等投递目标。
PushTarget 是只读的——由通道管理页间接维护（channel_recipients 变更时同步更新）。
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PushTarget(Base):
    """推送目标 = 通道（推送能力）+ 其绑定的身份列表（目的实体）。

    - ``name``: 自动生成，格式 "{通道名} → {身份名1}, {身份名2}..."
    - ``identity_ids``: UUID 数组，与 channel_recipients 表保持同步
    - ``kind``: 从通道类型派生（oto | group | webhook）
    - 有绑定身份的通道才会生成 PushTarget；无绑定的通道不生成
    """

    __tablename__ = "push_targets"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    channel_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("channels.id", ondelete="CASCADE"),
        nullable=False,
    )
    identity_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    channel_type: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<PushTarget {self.id} {self.name} ch={self.channel_id}>"
