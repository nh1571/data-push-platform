"""通讯录 Pydantic 校验模型。"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class IdentityCreate(BaseModel):
    """创建身份请求。"""

    name: str = Field(..., min_length=1, max_length=128)
    kind: str = Field(..., pattern=r"^(person|group|webhook)$")
    channel_type: str = Field(..., min_length=1, max_length=64)
    external_id: str = Field(..., min_length=1, max_length=1024)
    external_extra: str | None = Field(None, max_length=255)
    external_name: str | None = Field(None, max_length=128)


class IdentityUpdate(BaseModel):
    """更新身份请求。"""

    name: str | None = Field(None, min_length=1, max_length=128)
    kind: str | None = Field(None, pattern=r"^(person|group|webhook)$")
    channel_type: str | None = Field(None, min_length=1, max_length=64)
    external_id: str | None = Field(None, min_length=1, max_length=1024)
    external_extra: str | None = Field(None, max_length=255)
    external_name: str | None = Field(None, max_length=128)


class IdentityOut(BaseModel):
    """身份响应。"""

    id: UUID
    name: str
    kind: str
    channel_type: str
    external_id: str
    external_extra: str | None = None
    external_name: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
