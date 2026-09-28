from datetime import datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, CreatedAt, UUIDPrimaryKey, enum_check, str_enum


class Language(StrEnum):
    PT = "pt"
    EN = "en"
    ES = "es"


class WeightUnit(StrEnum):
    KG = "kg"
    LB = "lb"


class User(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "users"
    __table_args__ = (
        enum_check("language", Language),
        enum_check("unit", WeightUnit),
        CheckConstraint("email = lower(email)", name="email_lowercase"),
    )

    # Always lower-cased (enforced by a CHECK), so the unique constraint is case-insensitive.
    email: Mapped[str] = mapped_column(String(320), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    # Access tokens issued before this instant are rejected (password change/reset).
    password_changed_at: Mapped[datetime | None]
    name: Mapped[str] = mapped_column(String(100))
    language: Mapped[Language] = mapped_column(
        str_enum(Language), default=Language.PT, server_default=Language.PT.value
    )
    timezone: Mapped[str] = mapped_column(
        String(64), default="Europe/Lisbon", server_default="Europe/Lisbon"
    )
    # Display preference only: weights are always stored in kg (see ExerciseLog.weight).
    unit: Mapped[WeightUnit] = mapped_column(
        str_enum(WeightUnit), default=WeightUnit.KG, server_default=WeightUnit.KG.value
    )
