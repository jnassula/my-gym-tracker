"""Scheduled reminders: the training reminder, the weekly summary and the expiring plan.

``run_due`` checks every user with a device and sends what is due at that moment, in their time
zone. Each reminder is claimed in ``notification_deliveries`` before it is sent, so it goes out
once even if the loop runs twice (or on two backend instances). ``run_forever`` calls it every
minute from the app's lifespan.
"""

import asyncio
import logging
import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import exists, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.core.db import utcnow
from app.exercises.models import Exercise, MuscleGroup
from app.logs.models import ExerciseLog, WorkoutSession
from app.notifications import messages
from app.notifications.models import (
    NotificationDelivery,
    NotificationKind,
    NotificationSettings,
    PushSubscription,
)
from app.notifications.sender import PushMessage, PushSender
from app.notifications.service import DEFAULTS, notify
from app.users.models import User
from app.workouts.models import WorkoutPlan

logger = logging.getLogger(__name__)

TICK_SECONDS = 60
# A reminder missed by more than this (the server was down) is skipped, not sent late.
REMINDER_WINDOW = timedelta(hours=3)
SUMMARY_WEEKDAY, SUMMARY_TIME = 6, time(20, 0)  # "Domingo · 20:00"
EXPIRY_NOTICE_DAYS = 14  # "14 dias antes da data “trocar até”"


async def _active_plan(session: AsyncSession, user_id: uuid.UUID) -> WorkoutPlan | None:
    return await session.scalar(
        select(WorkoutPlan)
        .where(WorkoutPlan.user_id == user_id, WorkoutPlan.is_active)
        .options(selectinload(WorkoutPlan.days))
    )


async def _trained_on(session: AsyncSession, user_id: uuid.UUID, day: date) -> bool:
    found = await session.scalar(
        select(WorkoutSession.id)
        .where(WorkoutSession.user_id == user_id, WorkoutSession.local_date == day)
        .limit(1)
    )
    return found is not None


async def _week_totals(
    session: AsyncSession, user_id: uuid.UUID, start: date
) -> tuple[int, Decimal]:
    """Workouts and working-set volume (kg) from ``start`` (Monday) to Sunday."""
    end = start + timedelta(days=6)
    workouts = await session.scalar(
        select(func.count(WorkoutSession.id)).where(
            WorkoutSession.user_id == user_id, WorkoutSession.local_date.between(start, end)
        )
    )
    volume = await session.scalar(
        select(func.coalesce(func.sum(ExerciseLog.weight * ExerciseLog.reps), 0))
        .join(WorkoutSession, ExerciseLog.session_id == WorkoutSession.id)
        .join(Exercise, ExerciseLog.exercise_id == Exercise.id)
        .where(
            ExerciseLog.user_id == user_id,
            WorkoutSession.local_date.between(start, end),
            Exercise.muscle_group.is_distinct_from(MuscleGroup.WARMUP),
        )
    )
    return workouts or 0, Decimal(volume or 0)


async def _due(
    session: AsyncSession, user: User, prefs: NotificationSettings, now: datetime
) -> list[tuple[NotificationKind, str, PushMessage]]:
    local = now.astimezone(ZoneInfo(user.timezone))
    today = local.date()
    reminder_at = datetime.combine(today, prefs.reminder_time, tzinfo=local.tzinfo)
    plan = await _active_plan(session, user.id)
    due: list[tuple[NotificationKind, str, PushMessage]] = []

    if prefs.training_reminder and plan and reminder_at <= local < reminder_at + REMINDER_WINDOW:
        day = next((d for d in plan.days if d.weekday == today.weekday()), None)
        if day is not None and not await _trained_on(session, user.id, today):
            message = messages.training_reminder(user.language, day.label or plan.name)
            due.append((NotificationKind.TRAINING_REMINDER, today.isoformat(), message))

    if prefs.weekly_summary and today.weekday() == SUMMARY_WEEKDAY and local.time() >= SUMMARY_TIME:
        start = today - timedelta(days=today.weekday())
        workouts, volume = await _week_totals(session, user.id, start)
        if workouts:
            year, week, _ = start.isocalendar()
            message = messages.weekly_summary(user.language, workouts, volume)
            due.append((NotificationKind.WEEKLY_SUMMARY, f"{year}-W{week:02d}", message))

    if prefs.plan_expiring and plan and plan.valid_until and local >= reminder_at:
        days_left = (plan.valid_until - today).days
        if 0 <= days_left <= EXPIRY_NOTICE_DAYS:
            message = messages.plan_expiring(user.language, plan.name, plan.valid_until)
            due.append((NotificationKind.PLAN_EXPIRING, str(plan.id), message))

    return due


async def _claim(
    session: AsyncSession, user_id: uuid.UUID, kind: NotificationKind, key: str
) -> bool:
    """True the first time a reminder is claimed; False once it was sent."""
    claimed = await session.scalar(
        insert(NotificationDelivery)
        .values(id=uuid.uuid4(), user_id=user_id, kind=kind, key=key, sent_at=utcnow())
        .on_conflict_do_nothing(index_elements=["user_id", "kind", "key"])
        .returning(NotificationDelivery.id)
    )
    return claimed is not None


async def run_due(session: AsyncSession, sender: PushSender, now: datetime) -> int:
    """Send every reminder due at ``now``. Returns the notifications delivered."""
    rows = await session.execute(
        select(User, NotificationSettings)
        .outerjoin(NotificationSettings, NotificationSettings.user_id == User.id)
        .where(exists().where(PushSubscription.user_id == User.id))
    )
    delivered = 0
    for user, stored in rows.all():
        prefs = stored or NotificationSettings(user_id=user.id, **DEFAULTS)
        for kind, key, message in await _due(session, user, prefs, now):
            if await _claim(session, user.id, kind, key):
                delivered += await notify(session, sender, user.id, message)
    return delivered


async def run_forever(sessions: async_sessionmaker[AsyncSession], sender: PushSender) -> None:
    while True:
        try:
            async with sessions() as session:
                await run_due(session, sender, utcnow())
        except Exception:  # one bad tick must not stop the reminders
            logger.exception("Notification scheduler tick failed")
        await asyncio.sleep(TICK_SECONDS)
