import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import Double, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, UUIDPrimaryKey, enum_check, str_enum


class HealthSampleType(StrEnum):
    HEART_RATE = "heart_rate"  # bpm
    CALORIES = "calories"  # kcal
    DURATION = "duration"  # seconds


class HealthSample(UUIDPrimaryKey, Base):
    __tablename__ = "health_samples"
    __table_args__ = (
        enum_check("type", HealthSampleType),
        Index("ix_health_samples_user_time", "user_id", "recorded_at"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # Matched to a session by timestamp; stays null when no session overlaps.
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("workout_sessions.id", ondelete="SET NULL"), index=True
    )
    type: Mapped[HealthSampleType] = mapped_column(str_enum(HealthSampleType))
    value: Mapped[float] = mapped_column(Double)
    recorded_at: Mapped[datetime]
