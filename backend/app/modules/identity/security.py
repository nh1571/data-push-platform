"""Password hashing and JWT helpers for operator auth."""

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
    return pwd_context.hash(password)


def verify_password(plain: str, password_hash: str) -> bool:
    return pwd_context.verify(plain, password_hash)


def create_access_token(
    *,
    subject: str | UUID,
    expires_delta: timedelta | None = None,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """Issue a JWT access token for an operator (``type=user``, ``sub`` = operator id)."""
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
    """Decode and validate a JWT; raise ``JWTError`` on failure."""
    return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])


def hash_api_token(plaintext: str) -> str:
    """SHA-256 hex digest of a machine API token (stored at rest)."""
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
