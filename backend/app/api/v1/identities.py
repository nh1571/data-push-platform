"""身份/通讯录 CRUD 端点（鉴权由路由 dependencies 注入）。"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Identity
from app.db.session import get_db
from app.modules.address_book.schemas import IdentityCreate, IdentityOut, IdentityUpdate

router = APIRouter()


def _to_out(row: Identity) -> IdentityOut:
    return IdentityOut.model_validate(row)


def _get_or_404(db: Session, identity_id: UUID) -> Identity:
    row = db.get(Identity, identity_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="identity not found")
    return row


@router.get("", response_model=list[IdentityOut])
def list_identities(
    kind: str | None = Query(None, pattern=r"^(person|group)$"),
    channel_type: str | None = Query(None),
    db: Session = Depends(get_db),
) -> list[IdentityOut]:
    """列出全部身份，可按 kind / channel_type 筛选。"""
    stmt = select(Identity).order_by(Identity.created_at.desc())
    if kind:
        stmt = stmt.where(Identity.kind == kind)
    if channel_type:
        stmt = stmt.where(Identity.channel_type == channel_type)
    rows = db.scalars(stmt).all()
    return [_to_out(r) for r in rows]


@router.post("", response_model=IdentityOut, status_code=status.HTTP_201_CREATED)
def create_identity(body: IdentityCreate, db: Session = Depends(get_db)) -> IdentityOut:
    """创建身份。"""
    row = Identity(
        name=body.name,
        kind=body.kind,
        channel_type=body.channel_type,
        external_id=body.external_id,
        external_name=body.external_name,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.get("/{identity_id}", response_model=IdentityOut)
def get_identity(identity_id: UUID, db: Session = Depends(get_db)) -> IdentityOut:
    """获取单个身份。"""
    return _to_out(_get_or_404(db, identity_id))


@router.put("/{identity_id}", response_model=IdentityOut)
def update_identity(
    identity_id: UUID,
    body: IdentityUpdate,
    db: Session = Depends(get_db),
) -> IdentityOut:
    """更新身份。"""
    row = _get_or_404(db, identity_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.delete("/{identity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_identity(identity_id: UUID, db: Session = Depends(get_db)) -> None:
    """删除身份（级联删除关联的 channel_recipients）。"""
    row = _get_or_404(db, identity_id)
    db.delete(row)
    db.commit()
