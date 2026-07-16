from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+psycopg://push:push@localhost:5432/push"
    redis_url: str = "redis://localhost:6379/0"
    secret_key: str = "change-me-in-production"
    token_fernet_key: str = "change-me-fernet-key-32bytes-base64!!"
    storage_root: str = "./storage"
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Bootstrap admin (created on startup when operators table is empty)
    admin_username: str = "admin"
    admin_password: str = "admin123"

    # JWT access tokens for operators
    access_token_expire_minutes: int = 60 * 24


settings = Settings()
