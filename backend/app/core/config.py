from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration. Every value comes from environment variables (see .env.example)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    database_url: str = Field(description="SQLAlchemy async URL, e.g. postgresql+asyncpg://...")
    cors_origins: list[str] = Field(default_factory=list)
    log_level: str = "INFO"

    # --- auth ---
    jwt_secret: SecretStr = Field(min_length=32)
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 7
    password_reset_ttl_minutes: int = 30
    # Browsers only send Secure cookies over HTTPS (Safari included, even on localhost).
    cookie_secure: bool = True
    rate_limit_enabled: bool = True

    # --- email (password recovery) ---
    frontend_url: str = "http://localhost:5173"
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_starttls: bool = False
    email_from: str = "myGymTracker <no-reply@mygymtracker.local>"


@lru_cache
def get_settings() -> Settings:
    return Settings()
