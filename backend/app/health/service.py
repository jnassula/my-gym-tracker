"""Business logic for Apple Health. Routers only map HTTP to these functions.

The web has no HealthKit: a shortcut on the user's iPhone reads the Health app and posts the
samples with a personal token (``connect``). Only samples inside a session's time window are
kept; the rest of the day's heart rate never reaches the database.
"""

import secrets
import uuid
from datetime import datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import hash_token
from app.core.db import utcnow
from app.health.errors import HealthNotConnectedError, HealthTokenInvalidError
from app.health.metrics import (
    Sample,
    SessionTimes,
    assign,
    session_window,
)
from app.health.models import HealthConnection, HealthSample, HealthSampleType
from app.health.schemas import (
    HealthRead,
    HealthSettings,
    HealthSettingsUpdate,
    HealthToken,
    SyncResult,
)
from app.logs.models import ExerciseLog, WorkoutSession
from app.logs.service import local_today
from app.users.models import User

TOKEN_PREFIX = "mgt_"  # noqa: S105  # a prefix to recognise the tokens, not a secret
SETTING_TYPES = {
    "heart_rate": HealthSampleType.HEART_RATE,
    "calories": HealthSampleType.CALORIES,
}


def now() -> datetime:
    """The clock (tests move it)."""
    return utcnow()


async def _connection(session: AsyncSession, user_id: uuid.UUID) -> HealthConnection | None:
    return await session.get(HealthConnection, user_id)


def enabled_types(connection: HealthConnection) -> set[HealthSampleType]:
    return {kind for field, kind in SETTING_TYPES.items() if getattr(connection, field)}


# --- the Apple Health screen ---------------------------------------------------------------------


async def read(session: AsyncSession, user: User) -> HealthRead:
    connection = await _connection(session, user.id)
    today = local_today(user)
    week = select(WorkoutSession.id).where(
        WorkoutSession.user_id == user.id,
        WorkoutSession.local_date >= today - timedelta(days=today.weekday()),
    )
    week_sessions = await session.scalar(select(func.count()).select_from(week.subquery()))
    week_synced = await session.scalar(
        select(func.count(func.distinct(HealthSample.session_id))).where(
            HealthSample.user_id == user.id, HealthSample.session_id.in_(week)
        )
    )
    return HealthRead(
        connected=connection is not None,
        last_sync_at=connection.last_sync_at if connection else None,
        settings=HealthSettings.model_validate(connection) if connection else HealthSettings(),
        week_sessions=week_sessions or 0,
        week_synced=week_synced or 0,
    )


async def connect(session: AsyncSession, user: User) -> HealthToken:
    """A new token for the shortcut. Connecting again replaces it and keeps the data."""
    token = TOKEN_PREFIX + secrets.token_urlsafe(32)
    connection = await _connection(session, user.id)
    if connection is None:
        session.add(HealthConnection(user_id=user.id, token_hash=hash_token(token)))
    else:
        connection.token_hash = hash_token(token)
    await session.commit()
    return HealthToken(token=token)


async def disconnect(session: AsyncSession, user: User) -> None:
    """Revoke the token and forget everything imported from the Health app."""
    await session.execute(delete(HealthSample).where(HealthSample.user_id == user.id))
    await session.execute(delete(HealthConnection).where(HealthConnection.user_id == user.id))
    await session.commit()


async def update_settings(
    session: AsyncSession, user: User, data: HealthSettingsUpdate
) -> HealthSettings:
    """Turning a kind of data off also deletes what was imported of it."""
    connection = await _connection(session, user.id)
    if connection is None:
        raise HealthNotConnectedError
    for field in data.model_fields_set:
        setattr(connection, field, getattr(data, field))
        if not getattr(data, field):
            await session.execute(
                delete(HealthSample).where(
                    HealthSample.user_id == user.id, HealthSample.type == SETTING_TYPES[field]
                )
            )
    await session.commit()
    return HealthSettings.model_validate(connection)


# --- the shortcut ---------------------------------------------------------------------------------


async def authenticate(session: AsyncSession, token: str) -> tuple[User, HealthConnection]:
    connection = await session.scalar(
        select(HealthConnection).where(HealthConnection.token_hash == hash_token(token))
    )
    if connection is None:
        raise HealthTokenInvalidError
    user = await session.get(User, connection.user_id)
    if user is None:  # pragma: no cover - the connection cascades with the user
        raise HealthTokenInvalidError
    return user, connection


# --- reading -------------------------------------------------------------------------------------


async def samples_of(
    session: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID
) -> dict[HealthSampleType, list[Sample]]:
    """A session's samples by type, in time order."""
    rows = await session.execute(
        select(HealthSample.type, HealthSample.recorded_at, HealthSample.value)
        .where(HealthSample.user_id == user_id, HealthSample.session_id == session_id)
        .order_by(HealthSample.recorded_at)
    )
    samples: dict[HealthSampleType, list[Sample]] = {kind: [] for kind in HealthSampleType}
    for row in rows:
        samples[row.type].append(Sample(row.recorded_at, row.value))
    return samples


# --- storing what the shortcut sends -------------------------------------------------------------

# Sessions this far around the samples are candidates (a session's window is a few hours at most).
SESSION_MARGIN = timedelta(days=1)
# Postgres takes at most 32767 parameters per statement: 5 per row.
INSERT_CHUNK = 5_000


async def _session_times(
    session: AsyncSession, user_id: uuid.UUID, start: datetime, end: datetime
) -> list[SessionTimes]:
    workouts = list(
        await session.scalars(
            select(WorkoutSession).where(
                WorkoutSession.user_id == user_id,
                WorkoutSession.started_at >= start - SESSION_MARGIN,
                WorkoutSession.started_at <= end + SESSION_MARGIN,
            )
        )
    )
    set_times: dict[uuid.UUID, list[datetime]] = {w.id: [] for w in workouts}
    rows = await session.execute(
        select(ExerciseLog.session_id, ExerciseLog.performed_at).where(
            ExerciseLog.session_id.in_(set_times)
        )
    )
    for row in rows:
        set_times[row.session_id].append(row.performed_at)
    return [SessionTimes(w.id, w.started_at, w.ended_at, set_times[w.id]) for w in workouts]


async def store(
    session: AsyncSession,
    user: User,
    connection: HealthConnection,
    samples: dict[HealthSampleType, list[Sample]],
) -> SyncResult:
    """Keep the samples (of the enabled kinds) that fall in one of the user's sessions.

    Sending the same samples again updates them, so runs can overlap.
    """
    enabled = enabled_types(connection)
    wanted = {kind: items for kind, items in samples.items() if kind in enabled and items}
    received = sum(len(items) for items in wanted.values())
    # One row per kind and instant (a later duplicate in the batch wins).
    rows: dict[tuple[HealthSampleType, datetime], dict[str, object]] = {}
    instants = [s.at for items in wanted.values() for s in items]
    if instants:
        times = await _session_times(session, user.id, min(instants), max(instants))
        windows = {t.session_id: session_window(t) for t in times}
        for kind, items in wanted.items():
            for sample, owner in zip(items, assign((s.at for s in items), windows), strict=True):
                if owner is not None:
                    rows[kind, sample.at] = {
                        "user_id": user.id,
                        "session_id": owner,
                        "type": kind,
                        "value": sample.value,
                        "recorded_at": sample.at,
                    }
    values = list(rows.values())
    for start in range(0, len(values), INSERT_CHUNK):
        chunk = insert(HealthSample).values(values[start : start + INSERT_CHUNK])
        await session.execute(
            chunk.on_conflict_do_update(
                index_elements=["user_id", "type", "recorded_at"],
                set_={"value": chunk.excluded.value, "session_id": chunk.excluded.session_id},
            )
        )
    # Samples whose session was deleted (emptied) since.
    await session.execute(
        delete(HealthSample).where(
            HealthSample.user_id == user.id, HealthSample.session_id.is_(None)
        )
    )
    connection.last_sync_at = now()
    await session.commit()
    return SyncResult(
        received=received,
        kept=len(values),
        sessions=len({row["session_id"] for row in values}),
    )
