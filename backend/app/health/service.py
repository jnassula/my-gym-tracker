"""Business logic for the data sources. Routers only map HTTP to these functions.

The web has neither HealthKit nor Health Connect: a bridge on the user's phone (an iPhone
shortcut, the HC Webhook app on Android) reads the health app and posts the samples with a
personal token (``connect``), one per source. Only samples inside a session's time window are
kept; the rest of the day's heart rate doesn't stay in the database. A session takes each kind of
data from one source, the first to send it: a watch that writes to both health apps would
otherwise count its calories twice.
"""

import secrets
import uuid
from datetime import datetime, timedelta

from sqlalchemy import delete, func, or_, select, update
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
from app.health.models import HealthConnection, HealthProvider, HealthSample, HealthSampleType
from app.health.schemas import (
    ConnectionRead,
    HealthOverview,
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
# The shortcut sends its last days again on every run; these bridges send each sample once. One
# may arrive before its session's window reaches it (the set that stretches the window is logged
# later), so it waits for a session, this long at most.
SENT_ONCE = frozenset({HealthProvider.HEALTH_CONNECT})
WAIT = timedelta(hours=3)


def now() -> datetime:
    """The clock (tests move it)."""
    return utcnow()


async def _connection(
    session: AsyncSession, user_id: uuid.UUID, provider: HealthProvider
) -> HealthConnection | None:
    return await session.get(HealthConnection, {"user_id": user_id, "provider": provider})


def enabled_types(connection: HealthConnection) -> set[HealthSampleType]:
    return {kind for field, kind in SETTING_TYPES.items() if getattr(connection, field)}


# --- the data sources screens --------------------------------------------------------------------


async def overview(session: AsyncSession, user: User) -> HealthOverview:
    connections = {
        connection.provider: connection
        for connection in await session.scalars(
            select(HealthConnection).where(HealthConnection.user_id == user.id)
        )
    }
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
    return HealthOverview(
        connections=[
            ConnectionRead(
                provider=provider,
                connected=provider in connections,
                last_sync_at=connections[provider].last_sync_at
                if provider in connections
                else None,
                settings=HealthSettings.model_validate(connections[provider])
                if provider in connections
                else HealthSettings(),
            )
            for provider in HealthProvider
        ],
        week_sessions=week_sessions or 0,
        week_synced=week_synced or 0,
    )


async def read(session: AsyncSession, user: User) -> HealthRead:
    """Apple Health alone, for an installed app that hasn't updated yet."""
    status = await overview(session, user)
    apple = next(c for c in status.connections if c.provider is HealthProvider.APPLE_HEALTH)
    return HealthRead(
        connected=apple.connected,
        last_sync_at=apple.last_sync_at,
        settings=apple.settings,
        week_sessions=status.week_sessions,
        week_synced=status.week_synced,
    )


async def connect(session: AsyncSession, user: User, provider: HealthProvider) -> HealthToken:
    """A new token for the source's bridge. Connecting again replaces it and keeps the data."""
    token = TOKEN_PREFIX + secrets.token_urlsafe(32)
    connection = await _connection(session, user.id, provider)
    if connection is None:
        session.add(
            HealthConnection(user_id=user.id, provider=provider, token_hash=hash_token(token))
        )
    else:
        connection.token_hash = hash_token(token)
    await session.commit()
    return HealthToken(token=token)


async def disconnect(session: AsyncSession, user: User, provider: HealthProvider) -> None:
    """Revoke the token and forget everything imported from the source."""
    await session.execute(
        delete(HealthSample).where(HealthSample.user_id == user.id, HealthSample.source == provider)
    )
    await session.execute(
        delete(HealthConnection).where(
            HealthConnection.user_id == user.id, HealthConnection.provider == provider
        )
    )
    await session.commit()


async def update_settings(
    session: AsyncSession, user: User, provider: HealthProvider, data: HealthSettingsUpdate
) -> HealthSettings:
    """Turning a kind of data off also deletes what the source sent of it."""
    connection = await _connection(session, user.id, provider)
    if connection is None:
        raise HealthNotConnectedError
    for field in data.model_fields_set:
        setattr(connection, field, getattr(data, field))
        if not getattr(data, field):
            await session.execute(
                delete(HealthSample).where(
                    HealthSample.user_id == user.id,
                    HealthSample.source == provider,
                    HealthSample.type == SETTING_TYPES[field],
                )
            )
    await session.commit()
    return HealthSettings.model_validate(connection)


# --- the bridge -----------------------------------------------------------------------------------


async def authenticate(session: AsyncSession, token: str) -> tuple[User, HealthConnection]:
    connection = await session.scalar(
        select(HealthConnection).where(HealthConnection.token_hash == hash_token(token))
    )
    if connection is None:
        raise HealthTokenInvalidError
    user = await session.get(User, connection.user_id)
    # No user: the connection cascades with it. Deactivated: the bridge is refused too.
    if user is None or user.deactivated_at is not None:
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


# --- storing what a bridge sends -----------------------------------------------------------------

# Sessions this far around the samples are candidates (a session's window is a few hours at most).
SESSION_MARGIN = timedelta(days=1)
# Postgres takes at most 32767 parameters per statement: 6 per row.
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


async def _owners(
    session: AsyncSession, user_id: uuid.UUID, instants: list[datetime]
) -> list[uuid.UUID | None]:
    """The session each instant falls in, if any."""
    if not instants:
        return []
    times = await _session_times(session, user_id, min(instants), max(instants))
    return assign(instants, {t.session_id: session_window(t) for t in times})


async def _lock(session: AsyncSession, user_id: uuid.UUID) -> None:
    """One sync or sweep at a time per account: each decides by what the sessions already hold."""
    await session.execute(select(User.id).where(User.id == user_id).with_for_update())


async def _holders(
    session: AsyncSession, user_id: uuid.UUID, owners: list[uuid.UUID | None]
) -> dict[tuple[uuid.UUID, HealthSampleType], HealthProvider]:
    """The source each of these sessions already has each kind of data from."""
    rows = await session.execute(
        select(HealthSample.session_id, HealthSample.type, HealthSample.source)
        .where(
            HealthSample.user_id == user_id,
            HealthSample.session_id.in_({owner for owner in owners if owner is not None}),
        )
        .distinct()
    )
    return {(row.session_id, row.type): row.source for row in rows}


async def store(
    session: AsyncSession,
    user: User,
    connection: HealthConnection,
    samples: dict[HealthSampleType, list[Sample]],
) -> SyncResult:
    """Keep the samples (of the enabled kinds) that fall in one of the user's sessions, unless
    the session has that kind from another source.

    Sending the same samples again updates them, so runs can overlap. From a bridge that sends
    each sample once, a recent one outside every session waits for one (``WAIT``).
    """
    await _lock(session, user.id)
    source = connection.provider
    enabled = enabled_types(connection)
    wanted = [
        (kind, sample) for kind, items in samples.items() if kind in enabled for sample in items
    ]
    waiting_since = now() - WAIT if source in SENT_ONCE else None
    owners = await _owners(session, user.id, [sample.at for _, sample in wanted])
    holders = await _holders(session, user.id, owners)
    # One row per kind and instant (a later duplicate in the batch wins).
    rows: dict[tuple[HealthSampleType, datetime], dict[str, object]] = {}
    for (kind, sample), owner in zip(wanted, owners, strict=True):
        if owner is None:
            keep = waiting_since is not None and sample.at >= waiting_since
        else:
            keep = holders.get((owner, kind), source) == source
        if keep:
            rows[kind, sample.at] = {
                "user_id": user.id,
                "session_id": owner,
                "type": kind,
                "source": source,
                "value": sample.value,
                "recorded_at": sample.at,
            }
    values = list(rows.values())
    for start in range(0, len(values), INSERT_CHUNK):
        chunk = insert(HealthSample).values(values[start : start + INSERT_CHUNK])
        await session.execute(
            chunk.on_conflict_do_update(
                index_elements=["user_id", "type", "recorded_at"],
                set_={
                    "value": chunk.excluded.value,
                    "session_id": chunk.excluded.session_id,
                    "source": chunk.excluded.source,
                },
                # Another source's sample at the same instant stays, unless it is only waiting.
                where=or_(
                    HealthSample.source == chunk.excluded.source,
                    HealthSample.session_id.is_(None),
                ),
            )
        )
    await _settle(session, user.id)
    connection.last_sync_at = now()
    await session.commit()
    kept = [row["session_id"] for row in values if row["session_id"] is not None]
    return SyncResult(received=len(wanted), kept=len(kept), sessions=len(set(kept)))


async def _settle(session: AsyncSession, user_id: uuid.UUID) -> None:
    """The user's samples without a session: those a session's window now holds join it (they
    were waiting, or their session was emptied and started again), unless it has that kind from
    another source. What is left is deleted once it may no longer wait."""
    loose = (
        await session.execute(
            select(
                HealthSample.id, HealthSample.type, HealthSample.source, HealthSample.recorded_at
            )
            .where(HealthSample.user_id == user_id, HealthSample.session_id.is_(None))
            .order_by(HealthSample.recorded_at)
        )
    ).all()
    owners = await _owners(session, user_id, [row.recorded_at for row in loose])
    holders = await _holders(session, user_id, owners)
    joining: dict[uuid.UUID, list[uuid.UUID]] = {}
    for row, owner in zip(loose, owners, strict=True):
        if owner is not None and holders.setdefault((owner, row.type), row.source) == row.source:
            joining.setdefault(owner, []).append(row.id)
    for owner, ids in joining.items():
        await session.execute(
            update(HealthSample).where(HealthSample.id.in_(ids)).values(session_id=owner)
        )
    await session.execute(
        delete(HealthSample).where(
            HealthSample.user_id == user_id,
            HealthSample.session_id.is_(None),
            or_(
                HealthSample.source.not_in(SENT_ONCE),
                HealthSample.recorded_at < now() - WAIT,
            ),
        )
    )


async def sweep(session: AsyncSession) -> None:
    """Settle every account that has samples without a session, so that what no session claimed
    is deleted on time even if its bridge never calls again (``sweeper`` runs it every minute)."""
    users = await session.scalars(
        select(HealthSample.user_id).where(HealthSample.session_id.is_(None)).distinct()
    )
    for user_id in users.all():
        await _lock(session, user_id)
        await _settle(session, user_id)
    await session.commit()
