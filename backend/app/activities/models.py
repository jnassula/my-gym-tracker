import uuid
from datetime import date, datetime

from sqlalchemy import (
    ARRAY,
    CheckConstraint,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    false,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, CreatedAt, UUIDPrimaryKey


class Activity(UUIDPrimaryKey, CreatedAt, Base):
    """Something the user does besides the gym (footvolley, surf): a name, the weekdays it is
    always on (none: marked by hand) and the regions of the body it shouldn't share a day with.
    See ``activities.rules``."""

    __tablename__ = "activities"
    __table_args__ = (
        CheckConstraint("weekdays <@ ARRAY[0,1,2,3,4,5,6]::smallint[]", name="weekdays_valid"),
        CheckConstraint("avoid <@ ARRAY['upper','lower','core']::varchar[]", name="avoid_valid"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(40))
    # 0 = Monday. Empty: no fixed day.
    weekdays: Mapped[list[int]] = mapped_column(
        ARRAY(SmallInteger), default=list, server_default=text("'{}'")
    )
    # The fixed days hold from this date (the day they were last chosen): before it, the days
    # the activity was on are rows of their own, so changing the weekdays moves no past day.
    weekdays_since: Mapped[date | None]
    avoid: Mapped[list[str]] = mapped_column(
        ARRAY(String(8)), default=list, server_default=text("'{}'")
    )
    # Archived: off the lists and off the days to come, its past days kept.
    deleted_at: Mapped[datetime | None]


class ActivityDay(UUIDPrimaryKey, Base):
    """What was said outright of an activity on a date: it was on (marked by hand, or a fixed
    day kept as history), or ``skipped`` ("não fui" on a fixed day)."""

    __tablename__ = "activity_days"
    __table_args__ = (
        Index("uq_activity_days_activity_date", "activity_id", "local_date", unique=True),
        Index("ix_activity_days_user_date", "user_id", "local_date"),
    )

    activity_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("activities.id", ondelete="CASCADE"))
    # Denormalised from the activity so every query can filter by user directly.
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    local_date: Mapped[date]
    skipped: Mapped[bool] = mapped_column(default=False, server_default=false())
