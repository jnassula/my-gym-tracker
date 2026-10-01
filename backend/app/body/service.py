"""Business logic for body measurements. Routers only map HTTP to these functions."""

import uuid
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.body.composition import age_on, bmi, compose
from app.body.errors import MeasurementDateError, MeasurementNotFoundError
from app.body.metrics import Reading, change, daily, weekly
from app.body.models import BodyMeasurement
from app.body.schemas import BodyOverview, BodyPoint, MeasurementCreate, MeasurementRead
from app.core.db import utcnow
from app.progress.schemas import Range
from app.progress.service import RANGE_DAYS
from app.users.models import User

# A manual entry for an earlier day has no time of its own.
NOON = time(12, 0)
EARLIEST_DAY = date(2000, 1, 1)


def now() -> datetime:
    """The clock (tests move it)."""
    return utcnow()


def _zone(user: User) -> ZoneInfo:
    return ZoneInfo(user.timezone)


def _local_day(user: User, instant: datetime) -> date:
    return instant.astimezone(_zone(user)).date()


def _profile_complete(user: User) -> bool:
    return None not in (user.height_cm, user.birth_date, user.sex)


def _read(user: User, row: BodyMeasurement) -> MeasurementRead:
    """The weighing with what the profile lets it show."""
    weight = float(row.weight)
    composition = None
    if row.impedance is not None and user.height_cm and user.birth_date and user.sex:
        age = age_on(user.birth_date, _local_day(user, row.measured_at))
        composition = compose(weight, row.impedance, user.height_cm, age, user.sex)
    typed_fat = float(row.body_fat_pct) if row.body_fat_pct is not None else None
    return MeasurementRead(
        id=row.id,
        measured_at=row.measured_at,
        source=row.source,
        weight=row.weight,
        bmi=bmi(weight, user.height_cm) if user.height_cm else None,
        body_fat_pct=composition.body_fat_pct if composition else typed_fat,
        water_pct=composition.water_pct if composition else None,
        muscle_kg=composition.muscle_kg if composition else None,
        bone_kg=composition.bone_kg if composition else None,
        visceral_fat=composition.visceral_fat if composition else None,
        bmr_kcal=composition.bmr_kcal if composition else None,
    )


async def overview(session: AsyncSession, user: User, range_: Range) -> BodyOverview:
    since = _local_day(user, now()) - timedelta(days=RANGE_DAYS[range_] - 1)
    rows = list(
        await session.scalars(
            select(BodyMeasurement)
            .where(
                BodyMeasurement.user_id == user.id,
                BodyMeasurement.measured_at >= datetime.combine(since, time.min, _zone(user)),
            )
            .order_by(BodyMeasurement.measured_at)
        )
    )
    latest = (
        rows[-1]
        if rows
        else await session.scalar(
            select(BodyMeasurement)
            .where(BodyMeasurement.user_id == user.id)
            .order_by(BodyMeasurement.measured_at.desc())
            .limit(1)
        )
    )
    measurements = [_read(user, row) for row in rows]
    readings = [
        Reading(_local_day(user, m.measured_at), row.weight, m.body_fat_pct)
        for row, m in zip(rows, measurements, strict=True)
    ]
    points = weekly(readings) if range_ == "1y" else daily(readings)
    return BodyOverview(
        latest=_read(user, latest) if latest else None,
        range=range_,
        points=[
            BodyPoint(date=p.day, weight=p.weight, body_fat_pct=p.body_fat_pct) for p in points
        ],
        change=change(points),
        measurements=measurements[::-1],
        profile_complete=_profile_complete(user),
    )


def _instant(user: User, data: MeasurementCreate) -> datetime:
    """When the weighing happened: now, or noon of an earlier day typed in."""
    today = _local_day(user, now())
    if data.day is None or data.day == today:
        return now()
    if not EARLIEST_DAY <= data.day < today:
        raise MeasurementDateError
    return datetime.combine(data.day, NOON, _zone(user)).astimezone(UTC)


async def add(session: AsyncSession, user: User, data: MeasurementCreate) -> MeasurementRead:
    """Store a weighing. One typed in for a day that already has one typed in replaces it."""
    values = {
        "user_id": user.id,
        "measured_at": _instant(user, data),
        "source": data.source,
        "weight": data.weight,
        "impedance": data.impedance,
        "body_fat_pct": data.body_fat_pct,
    }
    statement = insert(BodyMeasurement).values(id=uuid.uuid4(), **values)
    row = await session.scalar(
        statement.on_conflict_do_update(
            index_elements=["user_id", "source", "measured_at"],
            set_={key: statement.excluded[key] for key in ("weight", "impedance", "body_fat_pct")},
        ).returning(BodyMeasurement),
        execution_options={"populate_existing": True},
    )
    await session.commit()
    assert row is not None  # noqa: S101  # an upsert always returns its row
    return _read(user, row)


async def remove(session: AsyncSession, user: User, measurement_id: uuid.UUID) -> None:
    deleted = await session.scalar(
        delete(BodyMeasurement)
        .where(BodyMeasurement.id == measurement_id, BodyMeasurement.user_id == user.id)
        .returning(BodyMeasurement.id)
    )
    if deleted is None:
        raise MeasurementNotFoundError
    await session.commit()
