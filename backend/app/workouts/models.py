import uuid
from datetime import date

from sqlalchemy import CheckConstraint, ForeignKey, Index, SmallInteger, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, CreatedAt, UUIDPrimaryKey
from app.exercises.models import Exercise


class WorkoutPlan(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "workout_plans"
    __table_args__ = (
        # At most one active plan per user, enforced by the database.
        Index(
            "uq_workout_plans_one_active_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("is_active"),
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    # The PDF it was imported from; null for plans created by hand or whose PDF was deleted.
    source_file_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("files.id", ondelete="SET NULL"), index=True
    )
    # "Trocar até": when the trainer expects the plan to be replaced.
    valid_until: Mapped[date | None]
    is_active: Mapped[bool] = mapped_column(default=False, server_default="false")

    # lazy="raise": async code must load collections explicitly (selectinload).
    days: Mapped[list["WorkoutDay"]] = relationship(
        order_by="WorkoutDay.position", cascade="all, delete-orphan", lazy="raise"
    )


class WorkoutDay(UUIDPrimaryKey, Base):
    __tablename__ = "workout_days"
    __table_args__ = (CheckConstraint("weekday BETWEEN 0 AND 6", name="weekday_range"),)

    plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workout_plans.id", ondelete="CASCADE"), index=True
    )
    # 0 = Monday. Null when the plan uses rotating days ("Treino A/B/C") instead of weekdays.
    weekday: Mapped[int | None] = mapped_column(SmallInteger)
    label: Mapped[str] = mapped_column(String(120))
    position: Mapped[int] = mapped_column(SmallInteger)

    exercises: Mapped[list[Exercise]] = relationship(
        order_by=Exercise.position, cascade="all, delete-orphan", lazy="raise"
    )
