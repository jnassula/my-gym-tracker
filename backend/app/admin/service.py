"""Business logic for the backoffice: read-only counts over every account.

The only place that reads across users, so it stays with counts and account data (name, email,
dates): no plans, PDFs, weights or health samples. Days, weeks and months are the administrator's
(``users.timezone``) for sign-ups; a workout counts on its own user's date (``local_date``).
The buckets' arithmetic lives in ``metrics``.
"""

import uuid
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import ColumnElement, Date, DateTime, cast, distinct, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.admin.metrics import Unit, bucket_starts, growth
from app.admin.schemas import (
    AdminOverview,
    AdminUser,
    AdminUsers,
    Adoption,
    Change,
    Funnel,
    Growth,
    GrowthPoint,
    LanguageCount,
    Range,
)
from app.health.models import HealthConnection
from app.logs import service as logs
from app.logs.models import WorkoutSession
from app.notifications.models import PushSubscription
from app.users.models import User
from app.workouts.models import WorkoutPlan

RANGES: dict[Range, tuple[Unit, int]] = {
    "30d": ("day", 30),
    "12w": ("week", 12),
    "12m": ("month", 12),
}
WEEK = timedelta(days=7)
MONTH = timedelta(days=30)


async def _count(session: AsyncSession, column: InstrumentedAttribute[uuid.UUID]) -> int:
    """How many accounts a table mentions."""
    return await session.scalar(select(func.count(distinct(column)))) or 0


async def overview(session: AsyncSession) -> AdminOverview:
    at = logs.now()

    def during(
        column: InstrumentedAttribute[datetime], period: timedelta
    ) -> tuple[ColumnElement[bool], ...]:
        """The last ``period`` and the one before it, as two FILTER conditions."""
        return column >= at - period, (column >= at - 2 * period) & (column < at - period)

    joined, trained = User.created_at, WorkoutSession.started_at
    athletes = func.count(distinct(WorkoutSession.user_id))
    users = (
        await session.execute(
            select(
                func.count(),
                *(func.count().filter(when) for when in during(joined, WEEK)),
                *(func.count().filter(when) for when in during(joined, MONTH)),
            ).select_from(User)
        )
    ).one()
    workouts = (
        await session.execute(
            select(
                func.count(),
                *(func.count().filter(when) for when in during(trained, WEEK)),
                athletes,
                *(athletes.filter(when) for when in during(trained, WEEK)),
                *(athletes.filter(when) for when in during(trained, MONTH)),
            ).select_from(WorkoutSession)
        )
    ).one()
    languages = await session.execute(
        select(User.language, func.count().label("users"))
        .group_by(User.language)
        .order_by(func.count().desc(), User.language)
    )

    return AdminOverview(
        total_users=users[0],
        new_users_7d=Change(current=users[1], previous=users[2]),
        new_users_30d=Change(current=users[3], previous=users[4]),
        active_users_7d=Change(current=workouts[4], previous=workouts[5]),
        active_users_30d=Change(current=workouts[6], previous=workouts[7]),
        workouts_total=workouts[0],
        workouts_7d=Change(current=workouts[1], previous=workouts[2]),
        funnel=Funnel(
            registered=users[0],
            with_plan=await _count(session, WorkoutPlan.user_id),
            trained=workouts[3],
            active_30d=workouts[6],
        ),
        adoption=Adoption(
            apple_health=await _count(session, HealthConnection.user_id),
            notifications=await _count(session, PushSubscription.user_id),
        ),
        languages=[LanguageCount(language=row[0], users=row[1]) for row in languages],
    )


async def _by_bucket(
    session: AsyncSession, unit: Unit, moment: ColumnElement[Any], counted: ColumnElement[Any]
) -> dict[date, int]:
    """``counted`` per day, week or month of ``moment`` (a timestamp without time zone)."""
    bucket = cast(func.date_trunc(unit, moment), Date).label("bucket")
    # Grouped by the label: repeating the expression would bind its parameters twice, and
    # Postgres wouldn't recognise the two as the same.
    rows = await session.execute(select(bucket, counted).group_by("bucket"))
    return {row[0]: row[1] for row in rows}


async def growth_series(session: AsyncSession, admin: User, range_: Range) -> Growth:
    unit, count = RANGES[range_]
    starts = bucket_starts(logs.local_today(admin), unit, count)
    joined = func.timezone(admin.timezone, User.created_at)

    new_users = await _by_bucket(
        session, unit, joined, func.count().filter(joined >= starts[0]).label("users")
    )
    active_users = await _by_bucket(
        session,
        unit,
        cast(WorkoutSession.local_date, DateTime()),
        func.count(distinct(WorkoutSession.user_id))
        .filter(WorkoutSession.local_date >= starts[0])
        .label("users"),
    )
    users_before = await session.scalar(
        select(func.count()).select_from(User).where(joined < starts[0])
    )
    points = growth(starts, new_users, active_users, users_before or 0)
    return Growth(
        range=range_, unit=unit, points=[GrowthPoint.model_validate(point) for point in points]
    )


async def list_users(session: AsyncSession, search: str, limit: int, offset: int) -> AdminUsers:
    """Accounts, newest first, with how much each one uses the app (counts only)."""
    mine = WorkoutSession.user_id == User.id
    plans = (
        select(func.count())
        .select_from(WorkoutPlan)
        .where(WorkoutPlan.user_id == User.id, WorkoutPlan.deleted_at.is_(None))
        .scalar_subquery()
    )
    workouts = select(func.count()).select_from(WorkoutSession).where(mine).scalar_subquery()
    last_workout = select(func.max(WorkoutSession.local_date)).where(mine).scalar_subquery()

    matching = (
        or_(
            User.email.icontains(search, autoescape=True),
            User.name.icontains(search, autoescape=True),
        )
        if search
        else None
    )
    total = select(func.count()).select_from(User)
    page = select(
        User.id,
        User.name,
        User.email,
        User.language,
        User.created_at,
        plans.label("plans"),
        workouts.label("workouts"),
        last_workout.label("last_workout_date"),
    )
    if matching is not None:
        total, page = total.where(matching), page.where(matching)
    rows = await session.execute(
        page.order_by(User.created_at.desc(), User.id).limit(limit).offset(offset)
    )
    return AdminUsers(
        total=await session.scalar(total) or 0,
        items=[AdminUser.model_validate(row) for row in rows],
    )
