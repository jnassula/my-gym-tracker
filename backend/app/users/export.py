"""Everything the app holds about one account, as a document its owner can take away.

Read-only, and only ever of the account asking: every query filters by its id. What identifies
the account to the server (password hash, tokens, storage keys) is not data to export and is
left out. The uploaded files are listed, not embedded: the app serves each by its id.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.body.models import BodyMeasurement
from app.core.config import get_settings
from app.core.db import utcnow
from app.files.models import StoredFile
from app.health.models import HealthConnection, HealthSample
from app.logs.models import ExerciseLog, WorkoutSession
from app.notifications import service as notifications
from app.notifications.models import PushSubscription
from app.notifications.schemas import NotificationSettingsRead
from app.users.models import User
from app.users.schemas import UserRead
from app.workouts.models import WorkoutDay, WorkoutPlan


def file_name(at: datetime) -> str:
    return f"mygymtracker-{at:%Y-%m-%d}.json"


async def _plans(session: AsyncSession, user: User) -> list[dict[str, Any]]:
    """Deleted plans too: the workouts logged on them are still the user's history."""
    plans = await session.scalars(
        select(WorkoutPlan)
        .where(WorkoutPlan.user_id == user.id)
        .options(selectinload(WorkoutPlan.days).selectinload(WorkoutDay.exercises))
        .order_by(WorkoutPlan.created_at)
    )
    return [
        {
            "id": plan.id,
            "name": plan.name,
            "is_active": plan.is_active,
            "valid_until": plan.valid_until,
            "created_at": plan.created_at,
            "deleted_at": plan.deleted_at,
            "days": [
                {
                    "id": day.id,
                    "weekday": day.weekday,
                    "label": day.label,
                    "exercises": [
                        {
                            "id": exercise.id,
                            "name": exercise.name,
                            "muscle_group": exercise.muscle_group,
                            "sets": exercise.sets,
                            "reps": exercise.reps,
                            "rest_seconds": exercise.rest_seconds,
                            "rest_max_seconds": exercise.rest_max_seconds,
                            "notes": exercise.notes,
                        }
                        for exercise in sorted(day.exercises, key=lambda e: e.position)
                    ],
                }
                for day in sorted(plan.days, key=lambda d: d.position)
            ],
        }
        for plan in plans
    ]


async def _workouts(session: AsyncSession, user: User) -> list[dict[str, Any]]:
    sessions = await session.scalars(
        select(WorkoutSession)
        .where(WorkoutSession.user_id == user.id)
        .order_by(WorkoutSession.started_at)
    )
    logs = await session.scalars(
        select(ExerciseLog)
        .where(ExerciseLog.user_id == user.id)
        .order_by(ExerciseLog.performed_at, ExerciseLog.set_number)
    )
    sets: dict[Any, list[dict[str, Any]]] = {}
    for log in logs:
        sets.setdefault(log.session_id, []).append(
            {
                "exercise_id": log.exercise_id,
                "set_number": log.set_number,
                "weight_kg": log.weight,
                "reps": log.reps,
                "performed_at": log.performed_at,
            }
        )
    return [
        {
            "id": workout.id,
            "day_id": workout.day_id,
            "date": workout.local_date,
            "started_at": workout.started_at,
            "ended_at": workout.ended_at,
            "exercises_ticked_without_sets": workout.done_exercise_ids,
            "sets": sets.get(workout.id, []),
        }
        for workout in sessions
    ]


async def _weighings(session: AsyncSession, user: User) -> list[dict[str, Any]]:
    """Not the ones the user deleted (kept hidden only so a bridge doesn't bring them back)."""
    rows = await session.scalars(
        select(BodyMeasurement)
        .where(BodyMeasurement.user_id == user.id, BodyMeasurement.deleted_at.is_(None))
        .order_by(BodyMeasurement.measured_at)
    )
    return [
        {
            "measured_at": row.measured_at,
            "source": row.source,
            "weight_kg": row.weight,
            "impedance": row.impedance,
            "body_fat_pct": row.body_fat_pct,
        }
        for row in rows
    ]


async def _health(session: AsyncSession, user: User) -> dict[str, Any]:
    connections = await session.scalars(
        select(HealthConnection)
        .where(HealthConnection.user_id == user.id)
        .order_by(HealthConnection.provider)
    )
    samples = await session.scalars(
        select(HealthSample)
        .where(HealthSample.user_id == user.id)
        .order_by(HealthSample.recorded_at)
    )
    return {
        "sources": [
            {
                "provider": connection.provider,
                "connected_at": connection.created_at,
                "last_sync_at": connection.last_sync_at,
                "keeps": {
                    "heart_rate": connection.heart_rate,
                    "calories": connection.calories,
                    "body": connection.body,
                },
            }
            for connection in connections
        ],
        "samples": [
            {
                "type": sample.type,
                "source": sample.source,
                "recorded_at": sample.recorded_at,
                "value": sample.value,
                "workout_id": sample.session_id,
            }
            for sample in samples
        ],
    }


async def _files(session: AsyncSession, user: User) -> list[dict[str, Any]]:
    rows = await session.scalars(
        select(StoredFile).where(StoredFile.user_id == user.id).order_by(StoredFile.created_at)
    )
    return [
        {
            "id": row.id,
            "kind": row.kind,
            "name": row.filename,
            "type": row.content_type,
            "bytes": row.size_bytes,
            "uploaded_at": row.created_at,
        }
        for row in rows
    ]


async def export_data(session: AsyncSession, user: User) -> dict[str, Any]:
    devices = await session.scalar(
        select(func.count())
        .select_from(PushSubscription)
        .where(PushSubscription.user_id == user.id)
    )
    settings = await notifications.get_settings(session, user.id)
    return {
        "exported_at": utcnow(),
        "app_version": get_settings().app_version,
        "account": UserRead.model_validate(user).model_dump(exclude={"is_admin"}),
        "plans": await _plans(session, user),
        "workouts": await _workouts(session, user),
        "weighings": await _weighings(session, user),
        "health": await _health(session, user),
        "notifications": {
            "settings": NotificationSettingsRead.model_validate(settings).model_dump(),
            "devices": devices or 0,
        },
        "files": await _files(session, user),
    }
