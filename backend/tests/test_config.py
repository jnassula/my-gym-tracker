from typing import Any

import pytest
from pydantic import ValidationError

from app.core.config import Settings

SAFE_PRODUCTION: dict[str, Any] = {
    "environment": "production",
    "database_url": "postgresql+asyncpg://gym:a-real-password@db:5432/mygymtracker",
    "jwt_secret": "p" * 48,
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


def test_administrators_are_listed_by_email() -> None:
    settings = Settings(
        **{**SAFE_PRODUCTION, "admin_emails": " Dona@Example.pt ,outra@example.pt,"}
    )

    assert settings.is_admin("dona@example.pt")
    assert settings.is_admin("OUTRA@example.pt")
    assert not settings.is_admin("atleta@example.pt")
    assert not settings.is_admin("")


def test_nobody_is_an_administrator_by_default() -> None:
    assert not Settings(**SAFE_PRODUCTION).is_admin("dona@example.pt")
