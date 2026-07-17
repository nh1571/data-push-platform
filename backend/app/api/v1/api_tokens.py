"""机器 API Token 管理（创建 / 列表 / 撤销）。"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import ApiToken
from app.db.session import get_db
from app.modules.identity.schemas import ApiTokenCreate, ApiTokenCreated, ApiTokenOut
from app.modules.identity.security import hash_api_token

router = APIRouter()


@router.post("", response_model=ApiTokenCreated, status_code=status.HTTP_201_CREATED)
def create_api_token(
    body: ApiTokenCreate,
    db: Session = Depends(get_db),
) -> ApiTokenCreated:
    """创建机器 Token；明文 ``token`` 仅此响应返回一次。"""
    plaintext = secrets.token_urlsafe(32)
    row = ApiToken(
        name=body.name,
        token_hash=hash_api_token(plaintext),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return ApiTokenCreated(id=row.id, name=row.name, token=plaintext)


@router.get("", response_model=list[ApiTokenOut])
def list_api_tokens(db: Session = Depends(get_db)) -> list[ApiTokenOut]:
    """列出全部 API Token（新→旧）。"""
    rows = db.scalars(select(ApiToken).order_by(ApiToken.created_at.desc())).all()
    return [ApiTokenOut.model_validate(r) for r in rows]


@router.delete("/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_api_token(token_id: UUID, db: Session = Depends(get_db)) -> None:
    """设置 ``revoked_at`` 撤销 Token（已撤销则幂等）。"""
    row = db.get(ApiToken, token_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="api token not found")
    if row.revoked_at is None:
        row.revoked_at = datetime.now(timezone.utc)
        db.add(row)
        db.commit()
