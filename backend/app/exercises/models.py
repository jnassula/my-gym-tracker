import uuid
from enum import StrEnum

from sqlalchemy import CheckConstraint, ForeignKey, SmallInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, UUIDPrimaryKey, enum_check, str_enum


class MuscleGroup(StrEnum):
    """Stable keys; the UI translates them (PDF wording varies, charts need one vocabulary)."""

    WARMUP = "warmup"
    CHEST = "chest"
    BACK = "back"
    SHOULDERS = "shoulders"
    BICEPS = "biceps"
    TRICEPS = "triceps"
    FOREARMS = "forearms"
    ABS = "abs"
    QUADS = "quads"
    HAMSTRINGS = "hamstrings"
    GLUTES = "glutes"
    ADDUCTORS = "adductors"
    CALVES = "calves"
    CARDIO = "cardio"
    OTHER = "other"


class Exercise(UUIDPrimaryKey, Base):
    __tablename__ = "exercises"
    __table_args__ = (
        CheckConstraint("sets > 0", name="sets_positive"),
        CheckConstraint("rest_seconds >= 0", name="rest_non_negative"),
        CheckConstraint("rest_max_seconds >= rest_seconds", name="rest_range"),
        enum_check("muscle_group", MuscleGroup),
    )

    day_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workout_days.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    muscle_group: Mapped[MuscleGroup | None] = mapped_column(str_enum(MuscleGroup))
    # Nullable: imported PDFs do not always state them; the user fills them in on preview.
    sets: Mapped[int | None] = mapped_column(SmallInteger)
    # Text, not int: plans prescribe schemes such as "8-12", "15/12/10" or "falha".
    reps: Mapped[str | None] = mapped_column(String(32))
    # Rest between sets; a range ("entre 1 a 2 minutos") fills both bounds.
    rest_seconds: Mapped[int | None] = mapped_column(SmallInteger)
    rest_max_seconds: Mapped[int | None] = mapped_column(SmallInteger)
    position: Mapped[int] = mapped_column(SmallInteger)
    # The full prescription as written (techniques, cadence, alternatives).
    notes: Mapped[str | None] = mapped_column(Text)
