import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Index, Numeric, SmallInteger, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, UUIDPrimaryKey


class WorkoutSession(UUIDPrimaryKey, Base):
    """One visit to the gym. Groups sets for "per session" progress and Apple Health matching."""

    __tablename__ = "workout_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    day_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("workout_days.id", ondelete="SET NULL"), index=True
    )
    started_at: Mapped[datetime] = mapped_column(server_default=func.now())
    ended_at: Mapped[datetime | None]


class ExerciseLog(UUIDPrimaryKey, Base):
    __tablename__ = "exercise_logs"
    __table_args__ = (
        CheckConstraint("weight >= 0", name="weight_non_negative"),
        CheckConstraint("reps > 0", name="reps_positive"),
        CheckConstraint("set_number > 0", name="set_number_positive"),
        # Exercise history and progress charts read by (user, exercise) ordered by time.
        Index("ix_exercise_logs_user_exercise_time", "user_id", "exercise_id", "performed_at"),
    )

    exercise_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exercises.id", ondelete="CASCADE"), index=True
    )
    # Denormalised from exercise -> day -> plan so every query can filter by user directly.
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workout_sessions.id", ondelete="CASCADE"), index=True
    )
    performed_at: Mapped[datetime] = mapped_column(server_default=func.now())
    # Always kilograms; converted to the user's unit only for display.
    weight: Mapped[Decimal] = mapped_column(Numeric(6, 2))
    reps: Mapped[int] = mapped_column(SmallInteger)
    set_number: Mapped[int] = mapped_column(SmallInteger)
