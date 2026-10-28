from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", env_prefix="FSP_", extra="ignore")

    database_url: str = f"sqlite:///{(BASE_DIR / 'fsp.db').as_posix()}"
    jwt_secret: str = "dev-only-secret-change-me-in-production-0123456789"
    jwt_ttl_minutes: int = 60 * 12
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    storage_dir: Path = BASE_DIR / "storage"
    public_base_url: str = "http://localhost:5173"
    issuer: str = "http://localhost:8000"

    telegram_bot_token: str | None = None


settings = Settings()
