"""操作员认证：密码哈希与 JWT 签发/校验；机器 Token 哈希。"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """bcrypt 哈希明文密码。"""
    return pwd_context.hash(password)


def verify_password(plain: str, password_hash: str) -> bool:
    """校验明文密码与哈希是否匹配。"""
    return pwd_context.verify(plain, password_hash)


def create_access_token(
    *,
    subject: str | UUID,
    expires_delta: timedelta | None = None,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """为操作员签发 JWT（``type=user``，``sub`` = operator id）。"""
    expire = datetime.now(timezone.utc) + (
        expires_delta
        if expires_delta is not None
        else timedelta(minutes=settings.access_token_expire_minutes)
    )
    payload: dict[str, Any] = {
        "sub": str(subject),
        "type": "user",
        "exp": expire,
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """解码并校验 JWT；失败抛 ``JWTError``。"""
    return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])


def hash_api_token(plaintext: str) -> str:
    """机器 API Token 的 SHA-256 十六进制摘要（落库存证，不存明文）。"""
    return hashlib.sha256(plaintext.encode("utf-8")).hexdigest()


__all__ = [
    "ALGORITHM",
    "JWTError",
    "create_access_token",
    "decode_access_token",
    "hash_api_token",
    "hash_password",
    "pwd_context",
    "verify_password",
]
