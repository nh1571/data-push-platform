"""应用配置：本地优先（local-first）与生产环境两套 profile。

**本地默认** — 零外部依赖即可上手开发::

    APP_ENV=local
    # 默认：SQLite 元数据库 + EXECUTION_SYNC=true（无需 Redis/MySQL）

**生产** — 通过环境变量或 ``.env`` 接入外部 MySQL / Redis::

    APP_ENV=production
    DATABASE_URL=mysql+pymysql://user:pass@host:3306/push
    REDIS_URL=redis://host:6379/0
    EXECUTION_SYNC=false
    TOKEN_FERNET_KEY=...
    SECRET_KEY=...

配置由 pydantic-settings 从环境变量与 ``.env`` / ``.env.local`` 加载；
空 ``database_url`` / ``storage_root`` 会在校验后按 profile 填入默认值。
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# config.py 位于 app/ → 上级目录为 backend 根
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
_DEFAULT_DATA_DIR = _BACKEND_ROOT / "data"
_DEFAULT_SQLITE_URL = f"sqlite:///{(_DEFAULT_DATA_DIR / 'meta.db').as_posix()}"
_DEFAULT_MYSQL_URL = "mysql+pymysql://push:push@localhost:3306/push"


class Settings(BaseSettings):
    """进程级应用设置，通过环境变量覆盖字段。

    字段说明概览：
    - ``app_env``: 运行环境标签，影响 local profile 判定与默认 DB
    - ``database_url`` / ``redis_url``: 元数据与任务队列依赖
    - ``secret_key``: JWT 等签名密钥
    - ``token_fernet_key``: 敏感配置字段对称加密（Fernet）
    - ``storage_root``: 导出文件等本地存储根目录
    - ``execution_sync``: True 时任务在 API 进程内同步执行（无需 Celery/Redis）
    - ``auto_migrate`` / ``seed_demo_data``: 启动时建表与演示数据开关
    """

    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
        # 接受 APP_ENV、DATABASE_URL 等大小写不敏感的环境变量名
        case_sensitive=False,
    )

    # local | production | docker | test | dev …
    app_env: str = "local"

    # 空字符串 → 由 profile 默认值填充（local→sqlite / production→mysql）
    database_url: str = ""
    redis_url: str = "redis://localhost:6379/0"
    secret_key: str = "dev-secret-key-change-in-production"
    token_fernet_key: str = ""
    storage_root: str = ""
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
    )

    admin_username: str = "admin"
    admin_password: str = "admin123"
    access_token_expire_minutes: int = 60 * 24

    # 本地默认 True；docker worker 等 profile 会设为 false
    execution_sync: bool = True

    auto_migrate: bool = True
    seed_demo_data: bool = True

    @field_validator("execution_sync", "auto_migrate", "seed_demo_data", mode="before")
    @classmethod
    def _parse_bool(cls, v: object) -> object:
        """将环境变量中的字符串布尔值（1/true/yes/on）规范为 bool。"""
        if isinstance(v, str):
            return v.strip().lower() in ("1", "true", "yes", "on")
        return v

    @model_validator(mode="after")
    def _apply_profile_defaults(self) -> Settings:
        """按 profile 填充空的 database_url 与 storage_root。"""
        env = (self.app_env or "local").strip().lower()
        object.__setattr__(self, "app_env", env)

        if not (self.database_url or "").strip():
            if self.is_local_profile:
                object.__setattr__(self, "database_url", _DEFAULT_SQLITE_URL)
            else:
                object.__setattr__(self, "database_url", _DEFAULT_MYSQL_URL)

        if not (self.storage_root or "").strip():
            object.__setattr__(self, "storage_root", str(_BACKEND_ROOT / "storage"))

        return self

    @property
    def is_local_profile(self) -> bool:
        """是否视为本地/开发类环境（影响默认 DB、演示种子等）。"""
        return self.app_env in ("local", "development", "dev", "test")

    @property
    def is_sqlite(self) -> bool:
        """元数据库 URL 是否为 SQLite 方言。"""
        return (self.database_url or "").startswith("sqlite")

    @property
    def profile_label(self) -> str:
        """用于日志的人类可读 profile 标签。"""
        if self.is_local_profile and self.is_sqlite:
            return "local (sqlite + sync)"
        if self.is_local_profile:
            dialect = self.database_url.split("://", 1)[0]
            return f"local ({dialect})"
        return f"{self.app_env} (external deps)"


@lru_cache
def get_settings() -> Settings:
    """返回进程内缓存的 Settings 单例。"""
    return Settings()


# 模块导入时即实例化，供全应用 ``from app.config import settings`` 使用
settings = get_settings()
