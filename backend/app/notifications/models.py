import uuid
from datetime import datetime, time
from enum import StrEnum

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint, false, text, true
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, CreatedAt, UUIDPrimaryKey, enum_check, str_enum, utcnow


class NotificationKind(StrEnum):
    TRAINING_REMINDER = "reminder"
    WEEKLY_SUMMARY = "weekly_summary"
    PLAN_EXPIRING = "plan_expiring"
    REST_END = "rest_end"
    TEST = "test"


class PushSubscription(UUIDPrimaryKey, CreatedAt, Base):
    """One browser or installed app that accepted notifications (a Web Push endpoint)."""

    __tablename__ = "push_subscriptions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # The push service URL; a browser signing in as someone else moves it to them.
    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    p256dh: Mapped[str] = mapped_column(String(255))
    auth: Mapped[str] = mapped_column(String(255))


class NotificationSettings(Base):
    """The Notificações screen. Missing row = the defaults (the design's on/off states)."""

    __tablename__ = "notification_settings"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    training_reminder: Mapped[bool] = mapped_column(default=True, server_default=true())
    # Local time (users.timezone) on the plan's training days.
    reminder_time: Mapped[time] = mapped_column(
        default=time(17, 30), server_default=text("'17:30'")
    )
    rest_end: Mapped[bool] = mapped_column(default=True, server_default=true())
    weekly_summary: Mapped[bool] = mapped_column(default=False, server_default=false())
    new_record: Mapped[bool] = mapped_column(default=True, server_default=true())
    plan_expiring: Mapped[bool] = mapped_column(default=True, server_default=true())


class NotificationDelivery(UUIDPrimaryKey, Base):
    """What was already sent, so the scheduler sends each reminder once (``key``: its date,
    ISO week or plan)."""

    __tablename__ = "notification_deliveries"
    __table_args__ = (
        UniqueConstraint("user_id", "kind", "key"),
        enum_check("kind", NotificationKind),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[NotificationKind] = mapped_column(str_enum(NotificationKind))
    key: Mapped[str] = mapped_column(String(64))
    sent_at: Mapped[datetime] = mapped_column(default=utcnow)
