"""推送目标 API — 独立管理推送目标（通道能力 + 目的身份的组合实体）。

PushTarget 是独立于推送编辑器配置的一等实体。
用户在此创建/编辑/删除 PushTarget，编辑器只负责选用。
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.channel import Channel
from app.db.models.identity import Identity
from app.db.models.push_target import PushTarget
from app.db.session import get_db

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────
class PushTargetIdentity(BaseModel):
    """PushTarget 内嵌的身份摘要。"""
    id: str
    name: str
    kind: str
    external_id: str


class PushTargetOut(BaseModel):
    """PushTarget 响应模型。"""
    id: str
    name: str
    channel_id: str
    kind: str
    channel_type: str
    identities: list[PushTargetIdentity] = []
    created_at: str
    updated_at: str

    model_config = {"from_attributes": False}


class PushTargetCreate(BaseModel):
    """创建 PushTarget：选择通道 + 身份列表，名称自动生成。"""
    channel_id: UUID
    identity_ids: list[UUID] = Field(..., min_length=1)


class PushTargetUpdate(BaseModel):
    """更新 PushTarget：可修改通道或身份列表。"""
    channel_id: UUID | None = None
    identity_ids: list[UUID] | None = None


# ── Helpers ───────────────────────────────────────────────────────────
def _derive_kind(channel_type: str) -> str:
    """从通道类型派生 PushTarget.kind。"""
    kind_map: dict[str, str] = {
        "dingtalk.work_notice": "oto",
        "dingtalk.openapi_oto_robot": "oto",
        "dingtalk.openapi_group_robot": "group",
        "dingtalk.webhook_robot": "webhook",
    }
    return kind_map.get(channel_type, channel_type)


def _build_name(db: Session, channel_id: UUID, identity_ids: list[UUID]) -> str:
    """生成 PushTarget 名称："{通道名} → {身份名1}, {身份名2}..."。"""
    channel = db.get(Channel, channel_id)
    ch_name = channel.name if channel else str(channel_id)[:8]
    id_rows = db.scalars(
        select(Identity).where(Identity.id.in_(identity_ids))
    ).all()
    id_names = ", ".join(i.name for i in id_rows) if id_rows else "—"
    return f"{ch_name} → {id_names}"


def _enrich(db: Session, pt: PushTarget) -> PushTargetOut:
    """将 PushTarget 行转为含身份详情的响应。"""
    identity_ids = [UUID(iid) for iid in (pt.identity_ids or [])]
    identities: list[PushTargetIdentity] = []
    if identity_ids:
        rows = db.scalars(
            select(Identity).where(Identity.id.in_(identity_ids))
        ).all()
        identities = [
            PushTargetIdentity(
                id=str(i.id),
                name=i.name,
                kind=i.kind,
                external_id=i.external_id,
            )
            for i in rows
        ]

    return PushTargetOut(
        id=str(pt.id),
        name=pt.name,
        channel_id=str(pt.channel_id),
        kind=pt.kind,
        channel_type=pt.channel_type,
        identities=identities,
        created_at=pt.created_at.isoformat() if pt.created_at else "",
        updated_at=pt.updated_at.isoformat() if pt.updated_at else "",
    )


def _get_or_404(db: Session, target_id: UUID) -> PushTarget:
    """按 id 取 PushTarget，不存在则 404。"""
    row = db.get(PushTarget, target_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="push target not found",
        )
    return row


# ── Routes ────────────────────────────────────────────────────────────
@router.get("", response_model=list[PushTargetOut])
def list_push_targets(db: Session = Depends(get_db)) -> list[PushTargetOut]:
    """列出全部推送目标（含身份详情）。"""
    rows = db.scalars(
        select(PushTarget).order_by(PushTarget.created_at.desc())
    ).all()
    return [_enrich(db, r) for r in rows]


@router.get("/{target_id}", response_model=PushTargetOut)
def get_push_target(target_id: UUID, db: Session = Depends(get_db)) -> PushTargetOut:
    """按 ID 获取推送目标详情。"""
    return _enrich(_get_or_404(db, target_id))


@router.post("", response_model=PushTargetOut, status_code=status.HTTP_201_CREATED)
def create_push_target(
    body: PushTargetCreate,
    db: Session = Depends(get_db),
) -> PushTargetOut:
    """创建推送目标（名称自动生成）。"""
    # 验证通道存在
    channel = db.get(Channel, body.channel_id)
    if channel is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"channel not found: {body.channel_id}",
        )
    # 验证身份存在
    id_rows = db.scalars(
        select(Identity).where(Identity.id.in_(body.identity_ids))
    ).all()
    if len(id_rows) != len(body.identity_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="one or more identity_ids not found",
        )

    name = _build_name(db, body.channel_id, body.identity_ids)
    identity_id_strs = [str(iid) for iid in body.identity_ids]

    row = PushTarget(
        name=name,
        channel_id=body.channel_id,
        identity_ids=identity_id_strs,
        kind=_derive_kind(channel.type),
        channel_type=channel.type,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _enrich(db, row)


@router.put("/{target_id}", response_model=PushTargetOut)
def update_push_target(
    target_id: UUID,
    body: PushTargetUpdate,
    db: Session = Depends(get_db),
) -> PushTargetOut:
    """更新推送目标的通道或身份列表（名称自动更新）。"""
    row = _get_or_404(db, target_id)

    channel_id = body.channel_id or row.channel_id
    identity_ids = body.identity_ids or [UUID(iid) for iid in row.identity_ids]

    if body.channel_id is not None:
        channel = db.get(Channel, body.channel_id)
        if channel is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"channel not found: {body.channel_id}",
            )
        row.channel_id = body.channel_id
        row.kind = _derive_kind(channel.type)
        row.channel_type = channel.type

    if body.identity_ids is not None:
        id_rows = db.scalars(
            select(Identity).where(Identity.id.in_(body.identity_ids))
        ).all()
        if len(id_rows) != len(body.identity_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="one or more identity_ids not found",
            )
        row.identity_ids = [str(iid) for iid in body.identity_ids]

    row.name = _build_name(db, row.channel_id, identity_ids)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _enrich(db, row)


@router.delete("/{target_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_push_target(target_id: UUID, db: Session = Depends(get_db)) -> None:
    """删除推送目标。"""
    row = _get_or_404(db, target_id)
    db.delete(row)
    db.commit()
