import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import CheckConstraint, ForeignKey, Index, Numeric, SmallInteger
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, CreatedAt, UUIDPrimaryKey, enum_check, str_enum

# What a body weight in kg may be (also the request's bounds).
WEIGHT_KG = (10, 300)


class MeasurementSource(StrEnum):
    MANUAL = "manual"  # typed in
    SCALE = "scale"  # read from a smart scale over Bluetooth, in the browser
    # Sent by a data source's bridge (``health.HealthProvider``, same values): the scale's own
    # app wrote the weighing into the phone's health app.
    APPLE_HEALTH = "apple_health"
    HEALTH_CONNECT = "health_connect"


class BodyMeasurement(UUIDPrimaryKey, CreatedAt, Base):
    """One weighing. Kept as it was read: the body composition is worked out when it is shown
    (``composition``), from the user's height, age and sex at that moment, so correcting the
    profile corrects every past weighing."""

    __tablename__ = "body_measurements"
    __table_args__ = (
        enum_check("source", MeasurementSource),
        CheckConstraint(f"weight BETWEEN {WEIGHT_KG[0]} AND {WEIGHT_KG[1]}", name="weight_range"),
        # Saving the same weighing again replaces it.
        Index(
            "uq_body_measurements_user_source_time",
            "user_id",
            "source",
            "measured_at",
            unique=True,
        ),
        Index("ix_body_measurements_user_time", "user_id", "measured_at"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    measured_at: Mapped[datetime]
    source: Mapped[MeasurementSource] = mapped_column(str_enum(MeasurementSource))
    # Always kg, like the lifted weights; `users.unit` is display-only.
    weight: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    # Ohms, from a scale that measures it (bare feet on its electrodes).
    impedance: Mapped[int | None] = mapped_column(SmallInteger)
    # Typed in with a manual entry, for someone whose scale shows it, or as a data source's
    # bridge reported it.
    body_fat_pct: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    # A weighing from a bridge that the user deleted: the row stays, hidden, so that the bridge
    # sending it again (the shortcut re-sends its last days on every run) doesn't bring it back.
    deleted_at: Mapped[datetime | None]
