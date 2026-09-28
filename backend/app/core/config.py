from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration. Every value comes from environment variables (see .env.example)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    database_url: str = Field(description="SQLAlchemy async URL, e.g. postgresql+asyncpg://...")
    cors_origins: list[str] = Field(default_factory=list)
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()
