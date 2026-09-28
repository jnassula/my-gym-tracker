import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    ARRAY,
    CheckConstraint,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, UUIDPrimaryKey, utcnow


class WorkoutSession(UUIDPrimaryKey, Base):
    """One day of the plan trained on one date. Starts with its first logged set (or check).

    Groups sets for "per session" progress and Apple Health matching.
    """

    __tablename__ = "workout_sessions"
    __table_args__ = (
        # One session per plan day and date: logging again the same day continues it.
        Index("uq_workout_sessions_user_day_date", "user_id", "day_id", "local_date", unique=True),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    day_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("workout_days.id", ondelete="SET NULL"), index=True
    )
    # The calendar date in the user's time zone when the session started ("today" at the gym).
    local_date: Mapped[date]
    started_at: Mapped[datetime] = mapped_column(default=utcnow, server_default=func.now())
    # Set by "Terminar treino"; logging another set afterwards reopens the session.
    ended_at: Mapped[datetime | None]
    # Exercises ticked off by hand (a treadmill warm-up, a skipped machine) without their sets.
    done_exercise_ids: Mapped[list[uuid.UUID]] = mapped_column(
        ARRAY(Uuid), default=list, server_default=text("'{}'")
    )


class ExerciseLog(UUIDPrimaryKey, Base):
    """One set: weight and reps. ``set_number`` counts from 1 per exercise within a session."""

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
    performed_at: Mapped[datetime] = mapped_column(default=utcnow, server_default=func.now())
    # Always kilograms; converted to the user's unit only for display.
    weight: Mapped[Decimal] = mapped_column(Numeric(6, 2))
    reps: Mapped[int] = mapped_column(SmallInteger)
    set_number: Mapped[int] = mapped_column(SmallInteger)
