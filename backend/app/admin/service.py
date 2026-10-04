"""Business logic for the backoffice: counts over every account, and closing accounts.

The only place that reads across users, so it stays with counts and account data (name, email,
dates): no plans, PDFs, weights or health samples. Days, weeks and months are the administrator's
(``users.timezone``) for sign-ups; a workout counts on its own user's date (``local_date``).
The buckets' arithmetic lives in ``metrics``.
"""

import logging
import uuid
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import (
    ColumnElement,
    Date,
    DateTime,
    Select,
    cast,
    distinct,
    func,
    or_,
    select,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.admin.errors import AdminProtectedError, UserNotFoundError
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
from app.auth.service import revoke_all_sessions
from app.core.storage import Storage
from app.health.models import HealthConnection, HealthProvider
from app.logs import service as logs
from app.logs.models import WorkoutSession
from app.notifications.models import PushSubscription
from app.notifications.service import cancel_rest_end
from app.users import service as users
from app.users.models import User
from app.workouts.models import WorkoutPlan

RANGES: dict[Range, tuple[Unit, int]] = {
    "30d": ("day", 30),
    "12w": ("week", 12),
    "12m": ("month", 12),
}
WEEK = timedelta(days=7)
MONTH = timedelta(days=30)

logger = logging.getLogger(__name__)


async def _count(
    session: AsyncSession, column: InstrumentedAttribute[uuid.UUID], *where: ColumnElement[bool]
) -> int:
    """How many accounts a table mentions (in the rows that match)."""
    return await session.scalar(select(func.count(distinct(column))).where(*where)) or 0


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
                func.count().filter(User.deactivated_at.is_not(None)),
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
        deactivated_users=users[5],
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
            apple_health=await _count(
                session,
                HealthConnection.user_id,
                HealthConnection.provider == HealthProvider.APPLE_HEALTH,
            ),
            health_connect=await _count(
                session,
                HealthConnection.user_id,
                HealthConnection.provider == HealthProvider.HEALTH_CONNECT,
            ),
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


def _accounts() -> Select[Any]:
    """Accounts with how much each one uses the app (counts only)."""
    mine = WorkoutSession.user_id == User.id
    plans = (
        select(func.count())
        .select_from(WorkoutPlan)
        .where(WorkoutPlan.user_id == User.id, WorkoutPlan.deleted_at.is_(None))
        .scalar_subquery()
    )
    workouts = select(func.count()).select_from(WorkoutSession).where(mine).scalar_subquery()
    last_workout = select(func.max(WorkoutSession.local_date)).where(mine).scalar_subquery()
    return select(
        User.id,
        User.name,
        User.email,
        User.language,
        User.created_at,
        User.deactivated_at,
        User.is_admin,
        plans.label("plans"),
        workouts.label("workouts"),
        last_workout.label("last_workout_date"),
    )


async def list_users(session: AsyncSession, search: str, limit: int, offset: int) -> AdminUsers:
    """Accounts, newest first; ``search`` matches names and emails."""
    matching = (
        or_(
            User.email.icontains(search, autoescape=True),
            User.name.icontains(search, autoescape=True),
        )
        if search
        else None
    )
    total, page = select(func.count()).select_from(User), _accounts()
    if matching is not None:
        total, page = total.where(matching), page.where(matching)
    rows = await session.execute(
        page.order_by(User.created_at.desc(), User.id).limit(limit).offset(offset)
    )
    return AdminUsers(
        total=await session.scalar(total) or 0,
        items=[AdminUser.model_validate(row) for row in rows],
    )


# --- closing accounts ----------------------------------------------------------------------------


async def _account(session: AsyncSession, admin: User, user_id: uuid.UUID) -> User:
    """The account to close, locked. Never the administrator's own, nor another one's."""
    user = await session.scalar(select(User).where(User.id == user_id).with_for_update())
    if user is None:
        raise UserNotFoundError
    if user.id == admin.id or user.is_admin:
        raise AdminProtectedError
    return user


async def set_active(
    session: AsyncSession, admin: User, user_id: uuid.UUID, *, active: bool
) -> AdminUser:
    """Deactivating signs the account out everywhere and keeps its data; it can come back."""
    user = await _account(session, admin, user_id)
    if active:
        user.deactivated_at = None
    elif user.deactivated_at is None:
        user.deactivated_at = logs.now()
        await revoke_all_sessions(session, user.id)
        cancel_rest_end(user.id)
    await session.commit()
    logger.info(
        "Administrator %s %s account %s",
        admin.id,
        "reactivated" if active else "deactivated",
        user.id,
    )
    row = (await session.execute(_accounts().where(User.id == user.id))).one()
    return AdminUser.model_validate(row)


async def delete_user(
    session: AsyncSession, storage: Storage, admin: User, user_id: uuid.UUID
) -> None:
    """Deletes the account and everything it owns (``users.service.delete_account``). There is
    no way back."""
    user = await _account(session, admin, user_id)
    await users.delete_account(session, storage, user)
    logger.info("Administrator %s deleted account %s", admin.id, user_id)


# --- administrators ------------------------------------------------------------------------------


async def set_admin(session: AsyncSession, email: str, *, admin: bool) -> User:
    """Make an existing account an administrator, or an ordinary one again.

    Only reachable from the server (``python -m app.admin.grant``), never from the API.
    """
    user = await session.scalar(select(User).where(User.email == email.strip().lower()))
    if user is None:
        raise UserNotFoundError
    user.is_admin = admin
    await session.commit()
    return user


async def administrators(session: AsyncSession) -> list[str]:
    emails = await session.scalars(select(User.email).where(User.is_admin).order_by(User.email))
    return list(emails)
