"""Local-profile bootstrap: dirs, secrets, schema, demo business DB + meta seed.

Called on API startup when ``APP_ENV`` is local/dev. Production should use
Alembic + real MySQL and must NOT depend on this module for secrets.
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

_DEMO_BIZ_REL = "data/demo_biz.db"
_FERNET_FILE = "data/.fernet_key"


def ensure_local_runtime() -> None:
    """Prepare filesystem + secrets for local profile (idempotent)."""
    data_dir = _BACKEND_ROOT / "data"
    storage = Path(settings.storage_root)
    data_dir.mkdir(parents=True, exist_ok=True)
    storage.mkdir(parents=True, exist_ok=True)

    _ensure_fernet_key_file()
    if settings.is_sqlite:
        # Ensure parent of sqlite file exists
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
    """If TOKEN_FERNET_KEY empty/invalid, load or create ``data/.fernet_key``."""
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
    """Create tables (local) or run alembic when configured.

    Local SQLite: ``create_all`` is enough for collaborators (no MySQL required).
    Production: prefer ``alembic upgrade head`` in entrypoint; this is a safety net.
    """
    if not settings.auto_migrate:
        return

    if settings.is_sqlite or settings.is_local_profile:
        import app.db.models  # noqa: F401

        Base.metadata.create_all(bind=engine)
        logger.info("Schema ensured via create_all (%s)", settings.profile_label)
        return

    # External MySQL: try alembic
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
    """Create demo_biz.db with sample hospital metrics if missing."""
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
    """Register a sqlite demo DataSource when none exist (local only)."""
    if not settings.seed_demo_data or not settings.is_local_profile:
        return

    from app.db.models.data_source import DataSource

    n = db.query(DataSource).count()
    if n > 0:
        return

    demo_path = ensure_demo_business_db()
    # Store path relative to backend CWD for portability
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
    logger.info(
        "Data Push Platform profile=%s database=%s execution_sync=%s",
        settings.profile_label,
        settings.database_url.split("@")[-1] if "@" in settings.database_url else settings.database_url,
        settings.execution_sync,
    )


def health_deps() -> dict:
    """Lightweight dependency status for /health?detail=1."""
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
