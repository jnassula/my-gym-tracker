import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import Double, ForeignKey, Index, String, true
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, CreatedAt, UUIDPrimaryKey, enum_check, str_enum


class HealthSampleType(StrEnum):
    HEART_RATE = "heart_rate"  # bpm, at one instant
    CALORIES = "calories"  # active kcal, over an interval that starts at recorded_at
    # Unused: the Shortcuts app can't read Apple Watch workouts. Kept so the CHECK stays as is.
    DURATION = "duration"


class HealthSample(UUIDPrimaryKey, Base):
    __tablename__ = "health_samples"
    __table_args__ = (
        enum_check("type", HealthSampleType),
        # A shortcut run re-sends what overlaps the last one: one row per instant and type.
        Index("uq_health_samples_user_type_time", "user_id", "type", "recorded_at", unique=True),
        Index("ix_health_samples_user_time", "user_id", "recorded_at"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # The session whose time window holds the sample. Only samples inside a session are kept.
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("workout_sessions.id", ondelete="SET NULL"), index=True
    )
    type: Mapped[HealthSampleType] = mapped_column(str_enum(HealthSampleType))
    value: Mapped[float] = mapped_column(Double)
    recorded_at: Mapped[datetime]


class HealthConnection(CreatedAt, Base):
    """Apple Health for one user: the iPhone shortcut's token and what the app keeps.

    There is no HealthKit on the web, so a shortcut on the iPhone reads the Health app and posts
    the samples with this token. No row = not connected.
    """

    __tablename__ = "health_connections"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    # SHA-256 of the token (it is random, so a fast hash is enough, as for refresh tokens).
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    last_sync_at: Mapped[datetime | None]
    heart_rate: Mapped[bool] = mapped_column(default=True, server_default=true())
    calories: Mapped[bool] = mapped_column(default=True, server_default=true())
