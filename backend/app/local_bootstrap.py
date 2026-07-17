"""本地 profile 引导：目录、密钥、Schema、演示业务库与元数据种子。

在 API 启动且 ``APP_ENV`` 为 local/dev 时调用。生产环境应使用
Alembic + 真实 MySQL，**不得**依赖本模块生成密钥或演示数据。

主要职责：
- 创建 ``data/``、``storage/`` 等本地目录
- 确保 Fernet 密钥可用（环境变量或 ``data/.fernet_key``）
- ``create_all`` / Alembic 建表
- 可选创建 ``demo_biz.db`` 并注册演示 DataSource
"""

from __future__ import annotations

import logging
import sqlite3
from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.common.crypto import encrypt_dict, generate_fernet_key
from app.config import settings
from app.db.base import Base
from app.db.session import engine

_BACKEND_ROOT = Path(__file__).resolve().parents[1]

logger = logging.getLogger(__name__)

# 演示业务库相对 backend 根的路径；Fernet 密钥落盘路径
_DEMO_BIZ_REL = "data/demo_biz.db"
_FERNET_FILE = "data/.fernet_key"


def ensure_local_runtime() -> None:
    """准备本地文件系统与密钥（幂等，可重复调用）。

    创建 data/、storage 根目录；必要时初始化 Fernet 密钥文件；
    SQLite 模式下确保库文件父目录存在；若开启演示数据则创建 demo 业务库。
    """
    data_dir = _BACKEND_ROOT / "data"
    storage = Path(settings.storage_root)
    data_dir.mkdir(parents=True, exist_ok=True)
    storage.mkdir(parents=True, exist_ok=True)

    _ensure_fernet_key_file()
    if settings.is_sqlite:
        # 确保 sqlite 库文件父目录存在
        url = settings.database_url
        if ":///" in url:
            path_part = url.split("sqlite:///", 1)[1]
            if path_part and not path_part.startswith(":"):
                p = Path(path_part)
                if not p.is_absolute():
                    p = _BACKEND_ROOT / p
                p.parent.mkdir(parents=True, exist_ok=True)

    if settings.seed_demo_data:
        ensure_demo_business_db()


def _ensure_fernet_key_file() -> None:
    """若 TOKEN_FERNET_KEY 为空或非法，则从 ``data/.fernet_key`` 加载或新建。

    通过 ``object.__setattr__`` 写回 settings，绕过 pydantic 模型冻结/校验限制，
    使后续 ``encrypt_dict`` 等能读到有效密钥。
    """
    from cryptography.fernet import Fernet

    key = (settings.token_fernet_key or "").strip()
    if key:
        try:
            Fernet(key.encode("ascii") if isinstance(key, str) else key)
            return
        except Exception:
            logger.warning("TOKEN_FERNET_KEY invalid; will use/create local key file")

    key_path = _BACKEND_ROOT / _FERNET_FILE
    if key_path.is_file():
        loaded = key_path.read_text(encoding="utf-8").strip()
        try:
            Fernet(loaded.encode("ascii"))
            object.__setattr__(settings, "token_fernet_key", loaded)
            logger.info("Loaded Fernet key from %s", key_path)
            return
        except Exception:
            pass

    new_key = generate_fernet_key()
    key_path.parent.mkdir(parents=True, exist_ok=True)
    key_path.write_text(new_key + "\n", encoding="utf-8")
    object.__setattr__(settings, "token_fernet_key", new_key)
    logger.info("Generated local Fernet key → %s (do not use in production)", key_path)


def ensure_schema() -> None:
    """创建表结构（本地）或在已配置时运行 alembic。

    - 本地 SQLite：``create_all`` 即可，协作者无需 MySQL
    - 生产：优先入口脚本执行 ``alembic upgrade head``；此处为安全兜底
    - ``auto_migrate=False`` 时直接返回，不改动 schema
    """
    if not settings.auto_migrate:
        return

    if settings.is_sqlite or settings.is_local_profile:
        import app.db.models  # noqa: F401

        Base.metadata.create_all(bind=engine)
        logger.info("Schema ensured via create_all (%s)", settings.profile_label)
        return

    # 外部 MySQL：尝试 alembic 升级到 head
    try:
        from alembic import command
        from alembic.config import Config

        ini = _BACKEND_ROOT / "alembic.ini"
        if ini.is_file():
            cfg = Config(str(ini))
            cfg.set_main_option("sqlalchemy.url", settings.database_url)
            command.upgrade(cfg, "head")
            logger.info("Alembic upgrade head completed")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Alembic failed (%s); falling back to create_all", exc)
        import app.db.models  # noqa: F401

        Base.metadata.create_all(bind=engine)


def ensure_demo_business_db() -> Path:
    """若不存在则创建带医院运营演示指标的 ``demo_biz.db``。

    含 ``daily_ops``（院区门诊/住院）与 ``trend``（周趋势）样例表，
    供本地数据源插件与前端预览使用。已存在非空文件则原样返回路径。
    """
    path = _BACKEND_ROOT / _DEMO_BIZ_REL
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_file() and path.stat().st_size > 0:
        return path

    conn = sqlite3.connect(str(path))
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS daily_ops (
              院区 TEXT NOT NULL,
              门诊量 INTEGER,
              住院 INTEGER,
              同比 TEXT
            );
            DELETE FROM daily_ops;
            INSERT INTO daily_ops (院区, 门诊量, 住院, 同比) VALUES
              ('演示院区', 1200, 80, '12.5%'),
              ('对照院区', 980, 72, '-3.2%'),
              ('东院', 1560, 95, '5.1%');

            CREATE TABLE IF NOT EXISTS trend (
              日 TEXT NOT NULL,
              量 INTEGER
            );
            DELETE FROM trend;
            INSERT INTO trend (日, 量) VALUES
              ('周一', 100), ('周二', 120), ('周三', 90),
              ('周四', 140), ('周五', 130), ('周六', 80), ('周日', 70);
            """
        )
        conn.commit()
        logger.info("Created demo business SQLite DB at %s", path)
    finally:
        conn.close()
    return path


def seed_demo_datasource_if_empty(db: Session) -> None:
    """本地且开启演示数据时，若尚无 DataSource 则注册一条 sqlite 演示源。

    配置经 Fernet 加密写入 ``config_enc``；路径使用相对 backend CWD 的
    ``data/demo_biz.db``，便于跨机器克隆仓库后仍可相对定位。
    """
    if not settings.seed_demo_data or not settings.is_local_profile:
        return

    from app.db.models.data_source import DataSource

    n = db.query(DataSource).count()
    if n > 0:
        return

    demo_path = ensure_demo_business_db()
    # 存相对路径，提升可移植性
    rel = "data/demo_biz.db"
    try:
        config_enc = encrypt_dict({"path": rel, "max_rows": 10000})
    except Exception as exc:  # noqa: BLE001
        logger.warning("Cannot seed demo datasource (crypto): %s", exc)
        return

    ds = DataSource(
        name="本地演示库 (SQLite)",
        type="sqlite",
        config_enc=config_enc,
    )
    db.add(ds)
    db.commit()
    logger.info("Seeded demo DataSource → %s", demo_path)


def log_runtime_banner() -> None:
    """启动时打印 profile、数据库摘要与是否同步执行的一行 INFO 日志。"""
    logger.info(
        "Data Push Platform profile=%s database=%s execution_sync=%s",
        settings.profile_label,
        settings.database_url.split("@")[-1] if "@" in settings.database_url else settings.database_url,
        settings.execution_sync,
    )


def health_deps() -> dict:
    """为 ``/health?detail=1`` 提供轻量依赖状态字典。

    探测元数据库 ``SELECT 1``，并检查 Playwright 是否可导入（截图类渲染可选依赖）。
    """
    out: dict = {
        "app_env": settings.app_env,
        "profile": settings.profile_label,
        "database": "sqlite" if settings.is_sqlite else "external",
        "execution_sync": settings.execution_sync,
        "redis_required": not settings.execution_sync,
    }
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        out["database_ok"] = True
    except Exception as exc:  # noqa: BLE001
        out["database_ok"] = False
        out["database_error"] = str(exc)
    try:
        from playwright.sync_api import sync_playwright  # noqa: F401

        out["playwright"] = "installed"
    except Exception:
        out["playwright"] = "optional-missing (HTML preview still works)"
    return out
