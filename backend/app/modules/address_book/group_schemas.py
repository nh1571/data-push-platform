"""收件人组 Pydantic 校验模型。"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class RecipientGroupCreate(BaseModel):
    """创建收件人组请求。"""

    name: str = Field(..., min_length=1, max_length=128)
    channel_type: str = Field(..., min_length=1, max_length=64)
    member_ids: list[UUID] = Field(default_factory=list)


class RecipientGroupUpdate(BaseModel):
    """更新收件人组请求。"""

    name: str | None = Field(None, min_length=1, max_length=128)
    member_ids: list[UUID] | None = None


class RecipientGroupOut(BaseModel):
    """收件人组响应。"""

    id: UUID
    name: str
    channel_type: str
    member_ids: list[UUID]
    member_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
