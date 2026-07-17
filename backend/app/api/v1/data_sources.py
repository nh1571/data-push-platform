"""数据源 CRUD 与连通性测试端点（鉴权由路由 dependencies 注入）。"""


from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.common.crypto import decrypt_dict, encrypt_dict
from app.db.models import DataSource
from app.db.session import get_db
from app.modules.config_svc.masking import mask_config
from app.modules.config_svc.schemas import (
    DataSourceCreate,
    DataSourceOut,
    DataSourceUpdate,
    TestConnectionResult,
)
from app.plugins.registry import plugin_registry

router = APIRouter()


def _to_out(row: DataSource) -> DataSourceOut:
    """DataSource ORM → 脱敏后的 DataSourceOut。"""
    plain = decrypt_dict(row.config_enc)
    return DataSourceOut(
        id=row.id,
        name=row.name,
        type=row.type,
        config=mask_config(plain),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _get_or_404(db: Session, source_id: UUID) -> DataSource:
    """按 id 取数据源，不存在 404。"""
    row = db.get(DataSource, source_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="data source not found")
    return row


@router.get("", response_model=list[DataSourceOut])
def list_data_sources(db: Session = Depends(get_db)) -> list[DataSourceOut]:
    """列出全部数据源。"""
    rows = db.scalars(select(DataSource).order_by(DataSource.created_at.desc())).all()
    return [_to_out(r) for r in rows]


@router.post("", response_model=DataSourceOut, status_code=status.HTTP_201_CREATED)
def create_data_source(
    body: DataSourceCreate,
    db: Session = Depends(get_db),
) -> DataSourceOut:
    """创建数据源（config 加密存储）。"""
    row = DataSource(
        name=body.name,
        type=body.type,
        config_enc=encrypt_dict(body.config),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.get("/{source_id}", response_model=DataSourceOut)
def get_data_source(source_id: UUID, db: Session = Depends(get_db)) -> DataSourceOut:
    """获取单个数据源。"""
    return _to_out(_get_or_404(db, source_id))


@router.put("/{source_id}", response_model=DataSourceOut)
def update_data_source(
    source_id: UUID,
    body: DataSourceUpdate,
    db: Session = Depends(get_db),
) -> DataSourceOut:
    """更新数据源名称/类型/配置。"""
    row = _get_or_404(db, source_id)
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


@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_data_source(source_id: UUID, db: Session = Depends(get_db)) -> None:
    """删除数据源。"""
    row = _get_or_404(db, source_id)
    db.delete(row)
    db.commit()


@router.post("/{source_id}/test", response_model=TestConnectionResult)
def test_data_source(source_id: UUID, db: Session = Depends(get_db)) -> TestConnectionResult:
    """解密配置、插件校验，并执行 ``SELECT 1`` 探活。"""
    row = _get_or_404(db, source_id)
    try:
        plugin = plugin_registry.get("datasource", row.type)
    except KeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"unknown data source type: {row.type!r}",
        ) from exc

    try:
        config = decrypt_dict(row.config_enc)
        plugin.validate_config(config)
        result = plugin.execute(config, "SELECT 1", {})
    except Exception as exc:  # noqa: BLE001 — surface any plugin/connection error
        return TestConnectionResult(ok=False, message=str(exc))

    return TestConnectionResult(
        ok=True,
        message="connection ok",
        detail={"columns": result.columns, "rows": result.rows},
    )
