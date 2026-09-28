import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, CreatedAt, UUIDPrimaryKey


class RefreshToken(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # SHA-256 hex of the opaque token; the raw token only ever lives in the httpOnly cookie.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    # All tokens produced by rotating one login share a family. Presenting an already
    # revoked token signals theft, so the whole family is revoked at once.
    family_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    expires_at: Mapped[datetime]
    revoked: Mapped[bool] = mapped_column(default=False, server_default="false")
