"""收件人组 CRUD 端点（鉴权由路由 dependencies 注入）。"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.identity import RecipientGroup, RecipientGroupMember
from app.db.session import get_db
from app.modules.address_book.group_schemas import (
    RecipientGroupCreate,
    RecipientGroupOut,
    RecipientGroupUpdate,
)

router = APIRouter()


def _to_out(row: RecipientGroup, db: Session) -> RecipientGroupOut:
    members = db.scalars(
        select(RecipientGroupMember).where(RecipientGroupMember.group_id == row.id)
    ).all()
    member_ids = [m.identity_id for m in members]
    return RecipientGroupOut(
        id=row.id,
        name=row.name,
        channel_type=row.channel_type,
        member_ids=member_ids,
        member_count=len(member_ids),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _get_or_404(db: Session, group_id: UUID) -> RecipientGroup:
    row = db.get(RecipientGroup, group_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="recipient group not found")
    return row


def _sync_members(db: Session, group_id: UUID, member_ids: list[UUID] | None) -> None:
    """同步组成员：先删旧的再插新的。"""
    if member_ids is None:
        return
    db.query(RecipientGroupMember).where(
        RecipientGroupMember.group_id == group_id
    ).delete()
    for mid in member_ids:
        db.add(RecipientGroupMember(group_id=group_id, identity_id=mid))


@router.get("", response_model=list[RecipientGroupOut])
def list_recipient_groups(
    channel_type: str | None = None,
    db: Session = Depends(get_db),
) -> list[RecipientGroupOut]:
    """列出全部收件人组，可按 channel_type 筛选。"""
    stmt = select(RecipientGroup).order_by(RecipientGroup.created_at.desc())
    if channel_type:
        stmt = stmt.where(RecipientGroup.channel_type == channel_type)
    rows = db.scalars(stmt).all()
    return [_to_out(r, db) for r in rows]


@router.post("", response_model=RecipientGroupOut, status_code=status.HTTP_201_CREATED)
def create_recipient_group(
    body: RecipientGroupCreate, db: Session = Depends(get_db)
) -> RecipientGroupOut:
    """创建收件人组。"""
    row = RecipientGroup(name=body.name, channel_type=body.channel_type)
    db.add(row)
    db.flush()
    _sync_members(db, row.id, body.member_ids)
    db.commit()
    db.refresh(row)
    return _to_out(row, db)


@router.get("/{group_id}", response_model=RecipientGroupOut)
def get_recipient_group(group_id: UUID, db: Session = Depends(get_db)) -> RecipientGroupOut:
    """获取单个收件人组。"""
    return _to_out(_get_or_404(db, group_id), db)


@router.put("/{group_id}", response_model=RecipientGroupOut)
def update_recipient_group(
    group_id: UUID,
    body: RecipientGroupUpdate,
    db: Session = Depends(get_db),
) -> RecipientGroupOut:
    """更新收件人组。"""
    row = _get_or_404(db, group_id)
    if body.name is not None:
        row.name = body.name
    db.flush()
    _sync_members(db, group_id, body.member_ids)
    db.commit()
    db.refresh(row)
    return _to_out(row, db)


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recipient_group(group_id: UUID, db: Session = Depends(get_db)) -> None:
    """删除收件人组（级联删除成员关联）。"""
    row = _get_or_404(db, group_id)
    db.delete(row)
    db.commit()
