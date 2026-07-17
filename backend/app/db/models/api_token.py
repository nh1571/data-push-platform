"""机器/集成用 API Token 模型（落库仅存哈希，不存明文）。"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ApiToken(Base):
    """对外集成 API Token：名称 + 哈希 + 吊销时间。

    明文 Token 仅在创建时返回一次；校验时对比 ``token_hash``。
    ``revoked_at`` 非空表示已吊销，不可再鉴权。
    """

    __tablename__ = "api_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
