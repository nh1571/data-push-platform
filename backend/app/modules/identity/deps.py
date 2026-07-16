"""FastAPI dependencies for operator JWT and machine API tokens."""

from __future__ import annotations

from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import ApiToken, Operator
from app.db.session import get_db
from app.modules.identity.schemas import Principal
from app.modules.identity.security import decode_access_token, hash_api_token

# auto_error=False so we can return a consistent 401 for missing/invalid credentials
_bearer = HTTPBearer(auto_error=False)


def get_current_principal(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Principal:
    """Accept Authorization Bearer JWT (operator) **or** machine API token.

    JWT claims: ``sub`` = operator id, ``type`` = ``user``.
    Machine tokens are looked up by SHA-256 hash of the bearer value.
    """
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 1) Try JWT (operator)
    try:
        payload = decode_access_token(token)
    except JWTError:
        payload = None

    if payload is not None and payload.get("type") == "user":
        sub = payload.get("sub")
        if not sub:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        try:
            operator_id = UUID(str(sub))
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc

        operator = db.get(Operator, operator_id)
        if operator is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return Principal(
            kind="user",
            operator_id=operator.id,
            username=operator.username,
        )

    # 2) Machine API token (SHA-256 hash lookup)
    token_hash = hash_api_token(token)
    api_token = db.scalar(
        select(ApiToken).where(
            ApiToken.token_hash == token_hash,
            ApiToken.revoked_at.is_(None),
        )
    )
    if api_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Principal(
        kind="machine",
        api_token_id=api_token.id,
        api_token_name=api_token.name,
    )
