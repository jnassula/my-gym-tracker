import uuid
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, ForeignKey, SmallInteger, String, false, func, true
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, CreatedAt, UUIDPrimaryKey, enum_check, str_enum


class Language(StrEnum):
    PT = "pt"
    EN = "en"
    ES = "es"


class WeightUnit(StrEnum):
    KG = "kg"
    LB = "lb"


class Sex(StrEnum):
    """What the body composition formulas ask for (they know no other value)."""

    MALE = "male"
    FEMALE = "female"


# What a height in centimetres may be (also the request's bounds).
HEIGHT_CM = (50, 260)


class User(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "users"
    __table_args__ = (
        enum_check("language", Language),
        enum_check("unit", WeightUnit),
        enum_check("sex", Sex),
        CheckConstraint("email = lower(email)", name="email_lowercase"),
        CheckConstraint(
            f"height_cm BETWEEN {HEIGHT_CM[0]} AND {HEIGHT_CM[1]}", name="height_cm_range"
        ),
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
    # "Descanso automático": logging a set starts the rest timer.
    auto_rest: Mapped[bool] = mapped_column(default=True, server_default=true())
    # May open the backoffice. Never set through the API: `python -m app.admin.grant` on the
    # server, so being an administrator belongs to an account, not to whoever holds an address.
    is_admin: Mapped[bool] = mapped_column(default=False, server_default=false())
    # Set by an administrator (backoffice): the account can't sign in, its data stays.
    deactivated_at: Mapped[datetime | None]
    # When the address was shown to be its owner's (the link in the confirmation email, or a
    # password reset). Null: signed up, not confirmed yet, can't sign in. The server default is
    # for a release from before the column, which may still run after a rollback: what it
    # creates counts as confirmed, as every account did. New code writes the null itself.
    email_verified_at: Mapped[datetime | None] = mapped_column(server_default=func.now())
    # The profile photo, a `files` row of kind "avatar". `files` points back at the user, so
    # the constraint is added on its own (use_alter): neither table has to come first.
    avatar_file_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("files.id", ondelete="SET NULL", use_alter=True)
    )
    # Optional, and only for the body composition a scale's impedance is turned into
    # (``body.composition``): without all three, a weighing shows the weight alone.
    height_cm: Mapped[int | None] = mapped_column(SmallInteger)
    birth_date: Mapped[date | None]
    sex: Mapped[Sex | None] = mapped_column(str_enum(Sex))
