import uuid
from enum import StrEnum

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, CreatedAt, UUIDPrimaryKey, enum_check, str_enum


class FileKind(StrEnum):
    WORKOUT_PDF = "workout_pdf"
    HEALTH_EXPORT = "health_export"


class StoredFile(UUIDPrimaryKey, CreatedAt, Base):
    """An upload kept in object storage. Exists before the plan it produces (preview step)."""

    __tablename__ = "files"
    __table_args__ = (enum_check("kind", FileKind),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[FileKind] = mapped_column(str_enum(FileKind))
    object_key: Mapped[str] = mapped_column(String(512), unique=True)
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
