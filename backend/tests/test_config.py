from typing import Any

import pytest
from pydantic import ValidationError

from app.core.config import Settings

SAFE_PRODUCTION: dict[str, Any] = {
    "environment": "production",
    "database_url": "postgresql+asyncpg://gym:a-real-password@db:5432/mygymtracker",
    "jwt_secret": "p" * 48,
    "s3_access_key": "gym-storage",
    "s3_secret_key": "a-real-storage-key",
    "cookie_secure": True,
    "frontend_url": "https://gym.example.com",
}


def test_production_starts_with_real_secrets_and_https() -> None:
    settings = Settings(**SAFE_PRODUCTION)

    assert settings.environment == "production"


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("jwt_secret", "change-me-to-a-long-random-string-of-at-least-32-chars", "JWT_SECRET"),
        ("database_url", "postgresql+asyncpg://gym:change-me-postgres@db/gym", "DATABASE_URL"),
        ("s3_secret_key", "change-me-s3", "S3_SECRET_KEY"),
        ("cookie_secure", False, "COOKIE_SECURE"),
        ("frontend_url", "http://localhost:5173", "FRONTEND_URL"),
        ("rate_limit_enabled", False, "RATE_LIMIT_ENABLED"),
        ("cors_origins", ["*"], "CORS_ORIGINS"),
        ("s3_access_key", "", "S3_ACCESS_KEY"),
        ("s3_secret_key", "", "S3_SECRET_KEY"),
    ],
)
def test_production_refuses_development_defaults(field: str, value: object, message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        Settings(**{**SAFE_PRODUCTION, field: value})


def test_development_keeps_the_example_values() -> None:
    settings = Settings(
        **{
            **SAFE_PRODUCTION,
            "environment": "development",
            "jwt_secret": "change-me-to-a-long-random-string-of-at-least-32-chars",
            "cookie_secure": False,
            "frontend_url": "http://localhost:5173",
        }
    )

    assert not settings.cookie_secure
