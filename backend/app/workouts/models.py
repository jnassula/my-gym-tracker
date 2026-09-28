import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Index, SmallInteger, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, CreatedAt, UUIDPrimaryKey


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
    # Object key in MinIO; null for plans created by hand.
    source_file_key: Mapped[str | None] = mapped_column(String(512))
    is_active: Mapped[bool] = mapped_column(default=False, server_default="false")


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
