"""登录与 API Token 端点的 Pydantic schema。"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    """登录请求：用户名 + 密码。"""
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    """登录成功响应：access_token + token_type。"""
    access_token: str
    token_type: Literal["bearer"] = "bearer"


class Principal(BaseModel):
    """已认证调用方：操作员（JWT）或机器（API Token）。"""

    kind: Literal["user", "machine"]
    operator_id: UUID | None = None
    username: str | None = None
    api_token_id: UUID | None = None
    api_token_name: str | None = None


class ApiTokenCreate(BaseModel):
    """创建机器 Token 请求（仅名称）。"""
    name: str = Field(..., min_length=1, max_length=128)


class ApiTokenCreated(BaseModel):
    """仅创建时返回，含明文 token（仅此一次）。"""

    id: UUID
    name: str
    token: str


class ApiTokenOut(BaseModel):
    """Token 列表项（不含明文）。"""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    created_at: datetime
    revoked_at: datetime | None = None
