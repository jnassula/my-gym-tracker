"""Business logic for the activities a user does besides the gym, and the dates they are on.

Nothing here imports the training log or the progress screens: both ask this module which
activities are on a date (``on_dates``), to work a suggestion around them and to draw them.
"""

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.activities import rules
from app.activities.errors import (
    ActivityDateError,
    ActivityLimitError,
    ActivityNameTakenError,
    ActivityNotFoundError,
)
from app.activities.models import Activity, ActivityDay
from app.activities.rules import Region
from app.activities.schemas import (
    ActivitiesRead,
    ActivityCreate,
    ActivityRead,
    ActivityUpdate,
    PlanDayRegions,
)
from app.core.db import utcnow
from app.users.models import User
from app.workouts.models import WorkoutDay, WorkoutPlan

MAX_ACTIVITIES = 20
# A day is marked today, or a little before or ahead ("surf on Saturday").
DAYS_AROUND = 14
INSERT_CHUNK = 1000


def now() -> datetime:
    """The clock (tests move it)."""
    return utcnow()


def local_today(user: User) -> date:
    return now().astimezone(ZoneInfo(user.timezone)).date()


def _rule(activity: Activity) -> rules.Rule:
    return rules.Rule(
        frozenset(activity.weekdays), activity.weekdays_since, activity.deleted_at is not None
    )


async def _get(session: AsyncSession, user_id: uuid.UUID, activity_id: uuid.UUID) -> Activity:
    activity = await session.scalar(
        select(Activity)
        .where(
            Activity.id == activity_id,
            Activity.user_id == user_id,
            Activity.deleted_at.is_(None),
        )
        .with_for_update()
    )
    if activity is None:
        raise ActivityNotFoundError
    return activity


async def _kept(session: AsyncSession, user_id: uuid.UUID) -> list[Activity]:
    return list(
        await session.scalars(
            select(Activity)
            .where(Activity.user_id == user_id, Activity.deleted_at.is_(None))
            .order_by(Activity.created_at, Activity.id)
        )
    )


async def _name_is_free(
    session: AsyncSession, user_id: uuid.UUID, name: str, *, but: uuid.UUID | None = None
) -> None:
    query = select(Activity.id).where(
        Activity.user_id == user_id,
        Activity.deleted_at.is_(None),
        func.lower(Activity.name) == name.lower(),
    )
    if but is not None:
        query = query.where(Activity.id != but)
    if await session.scalar(query.limit(1)) is not None:
        raise ActivityNameTakenError


# --- the activities themselves --------------------------------------------------------------


async def plan_regions(session: AsyncSession, user_id: uuid.UUID) -> list[PlanDayRegions]:
    """The active plan's days and the regions each works."""
    plan = await session.scalar(
        select(WorkoutPlan)
        .where(WorkoutPlan.user_id == user_id, WorkoutPlan.is_active)
        .options(selectinload(WorkoutPlan.days).selectinload(WorkoutDay.exercises))
    )
    return [
        PlanDayRegions(
            day_id=day.id,
            label=day.label,
            weekday=day.weekday,
            regions=sorted(rules.regions(exercise.muscle_group for exercise in day.exercises)),
        )
        for day in (plan.days if plan else [])
    ]


async def overview(session: AsyncSession, user: User) -> ActivitiesRead:
    return ActivitiesRead(
        activities=[ActivityRead.model_validate(a) for a in await _kept(session, user.id)],
        plan_days=await plan_regions(session, user.id),
    )


async def create(session: AsyncSession, user: User, data: ActivityCreate) -> ActivityRead:
    if len(await _kept(session, user.id)) >= MAX_ACTIVITIES:
        raise ActivityLimitError
    await _name_is_free(session, user.id, data.name)
    activity = Activity(
        user_id=user.id,
        name=data.name,
        weekdays=data.weekdays,
        weekdays_since=local_today(user) if data.weekdays else None,
        avoid=[region.value for region in data.avoid],
    )
    session.add(activity)
    await session.commit()
    return ActivityRead.model_validate(activity)


async def _keep_history(session: AsyncSession, activity: Activity, last: date) -> None:
    """Its fixed days up to ``last`` become rows of their own, before the rule that put them
    there changes: what happened stays where it happened."""
    days = rules.fixed_dates(_rule(activity), last)
    for start in range(0, len(days), INSERT_CHUNK):
        await session.execute(
            insert(ActivityDay)
            .values(
                [
                    {
                        "id": uuid.uuid4(),
                        "activity_id": activity.id,
                        "user_id": activity.user_id,
                        "local_date": day,
                        "skipped": False,
                    }
                    for day in days[start : start + INSERT_CHUNK]
                ]
            )
            # A date already said outright (marked, or "não fui") stays as it was said.
            .on_conflict_do_nothing(index_elements=["activity_id", "local_date"])
        )


async def update(
    session: AsyncSession, user: User, activity_id: uuid.UUID, data: ActivityUpdate
) -> ActivityRead:
    activity = await _get(session, user.id, activity_id)
    if data.name is not None and data.name != activity.name:
        await _name_is_free(session, user.id, data.name, but=activity.id)
        activity.name = data.name
    if data.avoid is not None:
        activity.avoid = [region.value for region in data.avoid]
    if data.weekdays is not None and data.weekdays != sorted(activity.weekdays):
        today = local_today(user)
        await _keep_history(session, activity, today - timedelta(days=1))
        activity.weekdays = data.weekdays
        activity.weekdays_since = today if data.weekdays else None
    await session.commit()
    return ActivityRead.model_validate(activity)


async def remove(session: AsyncSession, user: User, activity_id: uuid.UUID) -> None:
    """Archives it: gone from the lists and from the days to come, its past days kept."""
    activity = await _get(session, user.id, activity_id)
    today = local_today(user)
    await _keep_history(session, activity, today - timedelta(days=1))
    # From today on it is on no day, whatever was marked ahead.
    await session.execute(
        delete(ActivityDay).where(
            ActivityDay.activity_id == activity.id, ActivityDay.local_date >= today
        )
    )
    activity.deleted_at = now()
    await session.commit()


# --- its days ---------------------------------------------------------------------------------


def _near(user: User, day: date) -> None:
    if abs((day - local_today(user)).days) > DAYS_AROUND:
        raise ActivityDateError


async def _say(session: AsyncSession, activity: Activity, day: date, *, skipped: bool) -> None:
    await session.execute(
        insert(ActivityDay)
        .values(
            id=uuid.uuid4(),
            activity_id=activity.id,
            user_id=activity.user_id,
            local_date=day,
            skipped=skipped,
        )
        .on_conflict_do_update(
            index_elements=["activity_id", "local_date"], set_={"skipped": skipped}
        )
    )


async def mark(session: AsyncSession, user: User, activity_id: uuid.UUID, day: date) -> None:
    """The activity is on that date."""
    _near(user, day)
    activity = await _get(session, user.id, activity_id)
    await _say(session, activity, day, skipped=False)
    await session.commit()


async def unmark(session: AsyncSession, user: User, activity_id: uuid.UUID, day: date) -> None:
    """The activity isn't on that date: a day marked by hand is forgotten, one of its fixed
    days is kept as "não fui"."""
    _near(user, day)
    activity = await _get(session, user.id, activity_id)
    if rules.fixed(_rule(activity), day):
        await _say(session, activity, day, skipped=True)
    else:
        await session.execute(
            delete(ActivityDay).where(
                ActivityDay.activity_id == activity.id, ActivityDay.local_date == day
            )
        )
    await session.commit()


@dataclass(frozen=True)
class Happening:
    """An activity on a date."""

    activity_id: uuid.UUID
    name: str
    avoid: frozenset[Region]
    # There by its fixed weekday, with nothing said of that date.
    fixed: bool


async def on_dates(
    session: AsyncSession, user_id: uuid.UUID, first: date, last: date
) -> dict[date, list[Happening]]:
    """The activities on each date from ``first`` to ``last`` (dates with none are left out),
    archived ones included where they were. Read-only: fixed days are worked out, not stored."""
    activities = list(
        await session.scalars(
            select(Activity)
            .where(Activity.user_id == user_id)
            .order_by(Activity.created_at, Activity.id)
        )
    )
    if not activities:
        return {}
    said = {
        (row.activity_id, row.local_date): not row.skipped
        for row in await session.scalars(
            select(ActivityDay).where(
                ActivityDay.user_id == user_id, ActivityDay.local_date.between(first, last)
            )
        )
    }
    found: dict[date, list[Happening]] = {}
    for offset in range((last - first).days + 1):
        day = first + timedelta(days=offset)
        for activity in activities:
            outright = said.get((activity.id, day))
            if rules.happens(_rule(activity), outright, day):
                found.setdefault(day, []).append(
                    Happening(
                        activity_id=activity.id,
                        name=activity.name,
                        avoid=frozenset(Region(region) for region in activity.avoid),
                        fixed=outright is None,
                    )
                )
    return found
