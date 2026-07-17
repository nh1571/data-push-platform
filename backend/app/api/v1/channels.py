"""渠道 CRUD 与配置校验测试端点（鉴权由路由 dependencies 注入）。"""


from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.common.crypto import decrypt_dict, encrypt_dict
from app.db.models import Channel
from app.db.models.identity import ChannelRecipient
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


def _load_recipient_ids(db: Session, channel_id: UUID) -> list[str]:
    """查询某通道关联的所有身份 ID（用于返回给前端预填 Select）。"""
    rows = db.scalars(
        select(ChannelRecipient).where(ChannelRecipient.channel_id == channel_id)
    ).all()
    return [str(cr.identity_id) for cr in rows]


def _sync_recipients(db: Session, channel_id: UUID, identity_ids: list[str] | None) -> None:
    """同步 channel_recipients 表：先删后插。"""
    if identity_ids is None:
        return
    # 删除旧的
    db.query(ChannelRecipient).where(ChannelRecipient.channel_id == channel_id).delete()
    # 插入新的
    for iid in identity_ids:
        db.add(ChannelRecipient(channel_id=channel_id, identity_id=UUID(iid)))


def _to_out(row: Channel, recipient_ids: list[str] | None = None) -> ChannelOut:
    """将 Channel 行转为脱敏后的 ChannelOut，包含关联的收件人身份 ID。"""
    plain = decrypt_dict(row.config_enc)
    masked = mask_config(plain)
    if recipient_ids:
        masked["recipient_identity_ids"] = recipient_ids
    return ChannelOut(
        id=row.id,
        name=row.name,
        type=row.type,
        config=masked,
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
    """创建渠道（config 加密存储，recipient_identity_ids 同步到关联表）。"""
    # 从 config 中提取 recipient_identity_ids，不存入加密 config
    config = dict(body.config)
    recipient_ids: list[str] | None = config.pop("recipient_identity_ids", None)  # type: ignore[arg-type]

    row = Channel(
        name=body.name,
        type=body.type,
        config_enc=encrypt_dict(config),
    )
    db.add(row)
    db.flush()  # 获得 row.id

    _sync_recipients(db, row.id, recipient_ids)
    db.commit()
    db.refresh(row)

    result_ids = _load_recipient_ids(db, row.id)
    return _to_out(row, recipient_ids=result_ids)


@router.get("/{channel_id}", response_model=ChannelOut)
def get_channel(channel_id: UUID, db: Session = Depends(get_db)) -> ChannelOut:
    """获取单个渠道（含关联的收件人身份 ID）。"""
    row = _get_or_404(db, channel_id)
    recipient_ids = _load_recipient_ids(db, channel_id)
    return _to_out(row, recipient_ids=recipient_ids)


@router.put("/{channel_id}", response_model=ChannelOut)
def update_channel(
    channel_id: UUID,
    body: ChannelUpdate,
    db: Session = Depends(get_db),
) -> ChannelOut:
    """更新渠道名称/类型/配置（recipient_identity_ids 同步到关联表）。"""
    row = _get_or_404(db, channel_id)
    data = body.model_dump(exclude_unset=True)
    if "name" in data:
        row.name = data["name"]
    if "type" in data:
        row.type = data["type"]
    if "config" in data and data["config"] is not None:
        config = dict(data["config"])
        recipient_ids: list[str] | None = config.pop("recipient_identity_ids", None)  # type: ignore[arg-type]
        row.config_enc = encrypt_dict(config)
        _sync_recipients(db, channel_id, recipient_ids)
    db.add(row)
    db.commit()
    db.refresh(row)

    result_ids = _load_recipient_ids(db, channel_id)
    return _to_out(row, recipient_ids=result_ids)


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
