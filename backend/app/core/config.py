from functools import lru_cache
from typing import Literal, Self

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Every placeholder value in .env.example contains it.
PLACEHOLDER_MARKER = "change-me"


class Settings(BaseSettings):
    """Runtime configuration. Every value comes from environment variables (see .env.example)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    database_url: str = Field(description="SQLAlchemy async URL, e.g. postgresql+asyncpg://...")
    cors_origins: list[str] = Field(default_factory=list)
    log_level: str = "INFO"
    # The deployed build (the commit) and its version, baked into the production image by CI and
    # shown in /health. The version is worked out from the git history (deploy/version.sh).
    app_release: str = "dev"
    app_version: str = "dev"

    # --- auth ---
    jwt_secret: SecretStr = Field(min_length=32)
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 7
    # A session ends this long after its sign-in, however often it was refreshed.
    session_max_days: int = Field(default=90, ge=1)
    password_reset_ttl_minutes: int = 30
    # Browsers only send Secure cookies over HTTPS (Safari included, even on localhost).
    cookie_secure: bool = True
    rate_limit_enabled: bool = True

    # --- object storage (RustFS in development, any S3-compatible) ---
    s3_endpoint: str = "localhost:9000"  # host:port, no scheme
    s3_access_key: str = ""
    s3_secret_key: SecretStr = SecretStr("")
    s3_bucket: str = "mygymtracker"
    s3_secure: bool = False  # HTTPS to the storage endpoint
    s3_region: str | None = None

    # --- LLM that reads imported workout PDFs (any OpenAI-compatible API) ---
    llm_api_key: SecretStr = SecretStr("")
    llm_base_url: str = "https://api.deepseek.com"
    llm_model: str = "deepseek-flash"
    llm_timeout_seconds: float = 120.0
    # Each import is a paid call: at most this many a day, all accounts together (0: no ceiling).
    llm_daily_imports: int = Field(default=500, ge=0)

    # --- Exercise animations (ExerciseDB's free dataset, see app/demos/source.py) ---
    # A server without them fetches them by itself when it starts, once (half an hour).
    demos_auto_copy: bool = True

    # --- Web Push (VAPID). Empty key: notifications are off. `python -m app.notifications.keys`
    vapid_private_key: SecretStr = SecretStr("")
    vapid_subject: str = "mailto:admin@mygymtracker.local"

    # --- email (welcome, password recovery) ---
    frontend_url: str = "http://localhost:5173"
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_starttls: bool = False
    email_from: str = "myGymTracker <no-reply@mygymtracker.local>"

    @model_validator(mode="after")
    def _safe_for_production(self) -> Self:
        """Production refuses to start with the development defaults of .env.example."""
        if self.environment != "production":
            return self
        problems = [
            f"{name} still has the example value"
            for name, value in (
                ("JWT_SECRET", self.jwt_secret.get_secret_value()),
                ("DATABASE_URL", self.database_url),
                ("S3_SECRET_KEY", self.s3_secret_key.get_secret_value()),
            )
            if PLACEHOLDER_MARKER in value
        ]
        if not self.cookie_secure:
            problems.append("COOKIE_SECURE must be true (the site is served over HTTPS)")
        if not self.frontend_url.startswith("https://"):
            problems.append("FRONTEND_URL must be the site's https:// address")
        if not self.rate_limit_enabled:
            problems.append("RATE_LIMIT_ENABLED must be true")
        if "*" in self.cors_origins:
            problems.append("CORS_ORIGINS must name each origin (requests carry credentials)")
        if not self.s3_access_key or not self.s3_secret_key.get_secret_value():
            problems.append("S3_ACCESS_KEY and S3_SECRET_KEY must be set")
        if self.smtp_username and self.smtp_password and not self.smtp_starttls:
            problems.append("SMTP_STARTTLS must be true (the SMTP password goes over it)")
        if problems:
            raise ValueError("Unsafe production settings: " + "; ".join(problems))
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
