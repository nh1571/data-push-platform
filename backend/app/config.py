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


settings = Settings()
