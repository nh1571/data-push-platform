"""Application settings with local-first vs production profiles.

**Local (default)** — zero external services for onboarding::

    APP_ENV=local
    # defaults: sqlite meta DB + EXECUTION_SYNC=true (no Redis/MySQL required)

**Production** — external MySQL / Redis via env or ``.env``::

    APP_ENV=production
    DATABASE_URL=mysql+pymysql://user:pass@host:3306/push
    REDIS_URL=redis://host:6379/0
    EXECUTION_SYNC=false
    TOKEN_FERNET_KEY=...
    SECRET_KEY=...
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# config.py lives in app/ → backend root is parent
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
_DEFAULT_DATA_DIR = _BACKEND_ROOT / "data"
_DEFAULT_SQLITE_URL = f"sqlite:///{(_DEFAULT_DATA_DIR / 'meta.db').as_posix()}"
_DEFAULT_MYSQL_URL = "mysql+pymysql://push:push@localhost:3306/push"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
        # Accept APP_ENV, DATABASE_URL, etc.
        case_sensitive=False,
    )

    # local | production | docker | test | dev …
    app_env: str = "local"

    # Empty → filled by profile default (sqlite local / mysql production)
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

    # Local default True; docker worker profile sets false
    execution_sync: bool = True

    auto_migrate: bool = True
    seed_demo_data: bool = True

    @field_validator("execution_sync", "auto_migrate", "seed_demo_data", mode="before")
    @classmethod
    def _parse_bool(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip().lower() in ("1", "true", "yes", "on")
        return v

    @model_validator(mode="after")
    def _apply_profile_defaults(self) -> Settings:
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
        return self.app_env in ("local", "development", "dev", "test")

    @property
    def is_sqlite(self) -> bool:
        return (self.database_url or "").startswith("sqlite")

    @property
    def profile_label(self) -> str:
        if self.is_local_profile and self.is_sqlite:
            return "local (sqlite + sync)"
        if self.is_local_profile:
            dialect = self.database_url.split("://", 1)[0]
            return f"local ({dialect})"
        return f"{self.app_env} (external deps)"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
