"""渠道 CRUD 与配置校验测试端点（鉴权由路由 dependencies 注入）。"""


from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.common.crypto import decrypt_dict, encrypt_dict
from app.db.models import Channel
from app.db.session import get_db
from app.modules.config_svc.masking import mask_config
from app.modules.config_svc.schemas import (
    ChannelCreate,
    ChannelOut,
    ChannelUpdate,
    TestConnectionResult,
)
from app.plugins.registry import plugin_registry

router = APIRouter()


def _to_out(row: Channel) -> ChannelOut:
    """Channel ORM → 脱敏后的 ChannelOut。"""
    plain = decrypt_dict(row.config_enc)
    return ChannelOut(
        id=row.id,
        name=row.name,
        type=row.type,
        config=mask_config(plain),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _get_or_404(db: Session, channel_id: UUID) -> Channel:
    """按 id 取渠道，不存在 404。"""
    row = db.get(Channel, channel_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="channel not found")
    return row


@router.get("", response_model=list[ChannelOut])
def list_channels(db: Session = Depends(get_db)) -> list[ChannelOut]:
    """列出全部渠道。"""
    rows = db.scalars(select(Channel).order_by(Channel.created_at.desc())).all()
    return [_to_out(r) for r in rows]


@router.post("", response_model=ChannelOut, status_code=status.HTTP_201_CREATED)
def create_channel(body: ChannelCreate, db: Session = Depends(get_db)) -> ChannelOut:
    """创建渠道（config 加密存储）。"""
    row = Channel(
        name=body.name,
        type=body.type,
        config_enc=encrypt_dict(body.config),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.get("/{channel_id}", response_model=ChannelOut)
def get_channel(channel_id: UUID, db: Session = Depends(get_db)) -> ChannelOut:
    """获取单个渠道。"""
    return _to_out(_get_or_404(db, channel_id))


@router.put("/{channel_id}", response_model=ChannelOut)
def update_channel(
    channel_id: UUID,
    body: ChannelUpdate,
    db: Session = Depends(get_db),
) -> ChannelOut:
    """更新渠道名称/类型/配置。"""
    row = _get_or_404(db, channel_id)
    data = body.model_dump(exclude_unset=True)
    if "name" in data:
        row.name = data["name"]
    if "type" in data:
        row.type = data["type"]
    if "config" in data and data["config"] is not None:
        row.config_enc = encrypt_dict(data["config"])
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.delete("/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_channel(channel_id: UUID, db: Session = Depends(get_db)) -> None:
    """删除渠道。"""
    row = _get_or_404(db, channel_id)
    db.delete(row)
    db.commit()


@router.post("/{channel_id}/test", response_model=TestConnectionResult)
def test_channel(channel_id: UUID, db: Session = Depends(get_db)) -> TestConnectionResult:
    """解密配置并执行插件 ``validate_config``。"""
    row = _get_or_404(db, channel_id)
    try:
        plugin = plugin_registry.get("channel", row.type)
    except KeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"unknown channel type: {row.type!r}",
        ) from exc

    try:
        config = decrypt_dict(row.config_enc)
        plugin.validate_config(config)
    except Exception as exc:  # noqa: BLE001 — surface plugin validation errors
        return TestConnectionResult(ok=False, message=str(exc))

    return TestConnectionResult(ok=True, message="config valid")
