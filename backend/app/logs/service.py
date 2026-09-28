"""Business logic for the training log. Routers only map HTTP to these functions.

A session is one plan day trained on one date, the user's local date. It starts with the first set
logged (or exercise ticked) that day, and "Terminar treino" ends it; logging again reopens it.
An exercise's history is matched by id and, across plans (the trainer's next PDF), by name and
muscle group.
"""

import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.db import utcnow
from app.exercises.models import Exercise, MuscleGroup
from app.logs.errors import (
    DayNotFoundError,
    ExerciseNotFoundError,
    SessionNotFoundError,
    SetNotFoundError,
)
from app.logs.models import ExerciseLog, WorkoutSession
from app.logs.schemas import (
    DayLog,
    DayWeek,
    ExerciseHistory,
    PastSession,
    PastSet,
    PersonalRecord,
    PlanWeek,
    SessionRead,
    SessionSummary,
    SetCreate,
    SetRead,
    SetUpdate,
    WeightPoint,
)
from app.users.models import User
from app.workouts import service as workouts
from app.workouts.models import WorkoutDay, WorkoutPlan

HISTORY_SESSIONS = 4
# The exercise screen's "Progressão" sparkline.
RECENT_SESSIONS = 8


def now() -> datetime:
    """The clock (tests move it)."""
    return utcnow()


def local_today(user: User) -> date:
    return now().astimezone(ZoneInfo(user.timezone)).date()


def planned_sets(exercise: Exercise) -> int:
    """Sets that make an exercise done; PDFs without a count (cardio, warm-ups) need one."""
    return exercise.sets or 1


def count_done(
    exercises: Iterable[Exercise], workout: WorkoutSession, sets_logged: dict[uuid.UUID, int]
) -> int:
    """Exercises done in a session: ticked off, or with all their planned sets logged."""
    return sum(
        1
        for exercise in exercises
        if exercise.id in workout.done_exercise_ids
        or sets_logged.get(exercise.id, 0) >= planned_sets(exercise)
    )


ExerciseKey = tuple[str, MuscleGroup | None]


def exercise_key(name: str, group: MuscleGroup | None) -> ExerciseKey:
    """Same name and group: the same exercise in another plan. The group keeps a warm-up
    "Cadeira Extensora 2x20 (carga leve)" apart from the working one."""
    return name.strip().lower(), group


# --- ownership -----------------------------------------------------------------------------------


async def get_exercise(
    session: AsyncSession,
    user_id: uuid.UUID,
    exercise_id: uuid.UUID,
    *,
    include_deleted: bool = False,
) -> Exercise:
    """The user's exercise. Deleted plans' exercises only for reading history (progress)."""
    query = (
        select(Exercise)
        .join(WorkoutDay, Exercise.day_id == WorkoutDay.id)
        .join(WorkoutPlan, WorkoutDay.plan_id == WorkoutPlan.id)
        .where(Exercise.id == exercise_id, WorkoutPlan.user_id == user_id)
    )
    if not include_deleted:
        query = query.where(WorkoutPlan.deleted_at.is_(None))
    exercise = await session.scalar(query)
    if exercise is None:
        raise ExerciseNotFoundError
    return exercise


async def _day(session: AsyncSession, user_id: uuid.UUID, day_id: uuid.UUID) -> WorkoutDay:
    day = await session.scalar(
        select(WorkoutDay)
        .join(WorkoutPlan, WorkoutDay.plan_id == WorkoutPlan.id)
        .where(
            WorkoutDay.id == day_id,
            WorkoutPlan.user_id == user_id,
            WorkoutPlan.deleted_at.is_(None),
        )
        .options(selectinload(WorkoutDay.exercises))
    )
    if day is None:
        raise DayNotFoundError
    return day


async def _set(session: AsyncSession, user_id: uuid.UUID, set_id: uuid.UUID) -> ExerciseLog:
    log = await session.scalar(
        select(ExerciseLog)
        .where(ExerciseLog.id == set_id, ExerciseLog.user_id == user_id)
        .with_for_update()
    )
    if log is None:
        raise SetNotFoundError
    return log


# --- sessions ------------------------------------------------------------------------------------


async def _todays_session(
    session: AsyncSession, user: User, day_id: uuid.UUID, *, lock: bool
) -> WorkoutSession | None:
    query = select(WorkoutSession).where(
        WorkoutSession.user_id == user.id,
        WorkoutSession.day_id == day_id,
        WorkoutSession.local_date == local_today(user),
    )
    if lock:
        # Serialises concurrent writes to one session (two quick taps get set numbers 1 and 2).
        query = query.with_for_update()
    return await session.scalar(query.execution_options(populate_existing=True))


async def _ensure_session(session: AsyncSession, user: User, day_id: uuid.UUID) -> WorkoutSession:
    """Today's session for the day, created on first use. Safe against a concurrent create."""
    await session.execute(
        insert(WorkoutSession)
        .values(
            id=uuid.uuid4(),
            user_id=user.id,
            day_id=day_id,
            local_date=local_today(user),
            started_at=now(),
            done_exercise_ids=[],
        )
        .on_conflict_do_nothing(index_elements=["user_id", "day_id", "local_date"])
    )
    created = await _todays_session(session, user, day_id, lock=True)
    if created is None:  # just inserted, or inserted by the concurrent request
        raise RuntimeError("Today's session vanished right after being created")
    return created


async def _read(session: AsyncSession, workout: WorkoutSession) -> SessionRead:
    logs = await session.scalars(
        select(ExerciseLog)
        .where(ExerciseLog.session_id == workout.id)
        .order_by(ExerciseLog.performed_at, ExerciseLog.set_number)
        .execution_options(populate_existing=True)
    )
    return SessionRead(
        id=workout.id,
        day_id=workout.day_id,
        local_date=workout.local_date,
        started_at=workout.started_at,
        ended_at=workout.ended_at,
        done_exercise_ids=list(workout.done_exercise_ids),
        sets=[SetRead.model_validate(log) for log in logs],
    )


async def _drop_if_empty(session: AsyncSession, workout: WorkoutSession) -> bool:
    """A session with nothing left in it (every set undone) stops existing."""
    if workout.done_exercise_ids:
        return False
    has_sets = await session.scalar(
        select(ExerciseLog.id).where(ExerciseLog.session_id == workout.id).limit(1)
    )
    if has_sets is not None:
        return False
    await session.delete(workout)
    return True


# --- logging -------------------------------------------------------------------------------------


async def log_set(
    session: AsyncSession, user: User, exercise_id: uuid.UUID, data: SetCreate
) -> SessionRead:
    exercise = await get_exercise(session, user.id, exercise_id)
    workout = await _ensure_session(session, user, exercise.day_id)
    last_number = await session.scalar(
        select(func.max(ExerciseLog.set_number)).where(
            ExerciseLog.session_id == workout.id, ExerciseLog.exercise_id == exercise.id
        )
    )
    session.add(
        ExerciseLog(
            exercise_id=exercise.id,
            user_id=user.id,
            session_id=workout.id,
            weight=data.weight,
            reps=data.reps,
            set_number=(last_number or 0) + 1,
            performed_at=now(),
        )
    )
    workout.ended_at = None  # a set after "Terminar treino" continues the session
    await session.commit()
    return await _read(session, workout)


async def update_set(
    session: AsyncSession, user: User, set_id: uuid.UUID, data: SetUpdate
) -> SessionRead:
    log = await _set(session, user.id, set_id)
    if data.weight is not None:
        log.weight = data.weight
    if data.reps is not None:
        log.reps = data.reps
    await session.commit()
    workout = await session.get_one(WorkoutSession, log.session_id)
    return await _read(session, workout)


async def delete_set(session: AsyncSession, user: User, set_id: uuid.UUID) -> SessionRead | None:
    log = await _set(session, user.id, set_id)
    workout = await session.get_one(WorkoutSession, log.session_id, with_for_update=True)
    await session.delete(log)
    await session.flush()
    # Keep numbering contiguous: deleting set 2 of 3 makes set 3 the new set 2.
    await session.execute(
        update(ExerciseLog)
        .where(
            ExerciseLog.session_id == log.session_id,
            ExerciseLog.exercise_id == log.exercise_id,
            ExerciseLog.set_number > log.set_number,
        )
        .values(set_number=ExerciseLog.set_number - 1)
    )
    dropped = await _drop_if_empty(session, workout)
    await session.commit()
    return None if dropped else await _read(session, workout)


async def mark_done(session: AsyncSession, user: User, exercise_id: uuid.UUID) -> SessionRead:
    exercise = await get_exercise(session, user.id, exercise_id)
    workout = await _ensure_session(session, user, exercise.day_id)
    if exercise.id not in workout.done_exercise_ids:
        workout.done_exercise_ids = [*workout.done_exercise_ids, exercise.id]
    await session.commit()
    return await _read(session, workout)


async def unmark_done(
    session: AsyncSession, user: User, exercise_id: uuid.UUID
) -> SessionRead | None:
    exercise = await get_exercise(session, user.id, exercise_id)
    workout = await _todays_session(session, user, exercise.day_id, lock=True)
    if workout is None:
        return None
    workout.done_exercise_ids = [i for i in workout.done_exercise_ids if i != exercise.id]
    dropped = await _drop_if_empty(session, workout)
    await session.commit()
    return None if dropped else await _read(session, workout)


# --- history -------------------------------------------------------------------------------------


@dataclass(frozen=True)
class _PastLog:
    exercise_id: uuid.UUID
    key: ExerciseKey
    session_id: uuid.UUID
    local_date: date
    performed_at: datetime
    set_number: int
    weight: Decimal
    reps: int


async def _past_logs(
    session: AsyncSession, user_id: uuid.UUID, exercises: Iterable[Exercise], before: date
) -> list[_PastLog]:
    """Sets before ``before`` that may belong to these exercises, newest session first."""
    exercises = list(exercises)
    if not exercises:
        return []
    names = {exercise.name.strip().lower() for exercise in exercises}
    rows = await session.execute(
        select(
            ExerciseLog.exercise_id,
            Exercise.name,
            Exercise.muscle_group,
            ExerciseLog.session_id,
            WorkoutSession.local_date,
            ExerciseLog.performed_at,
            ExerciseLog.set_number,
            ExerciseLog.weight,
            ExerciseLog.reps,
        )
        .join(Exercise, ExerciseLog.exercise_id == Exercise.id)
        .join(WorkoutSession, ExerciseLog.session_id == WorkoutSession.id)
        .where(
            ExerciseLog.user_id == user_id,
            WorkoutSession.local_date < before,
            or_(
                ExerciseLog.exercise_id.in_([exercise.id for exercise in exercises]),
                func.lower(func.trim(Exercise.name)).in_(names),
            ),
        )
        .order_by(WorkoutSession.local_date.desc(), ExerciseLog.performed_at.desc())
    )
    return [
        _PastLog(
            exercise_id=row.exercise_id,
            key=exercise_key(row.name, row.muscle_group),
            session_id=row.session_id,
            local_date=row.local_date,
            performed_at=row.performed_at,
            set_number=row.set_number,
            weight=row.weight,
            reps=row.reps,
        )
        for row in rows
    ]


def _history(
    exercise: Exercise, logs: list[_PastLog], limit: int | None = None
) -> list[PastSession]:
    """Earlier sessions of an exercise, newest first. Where the exercise itself was logged only
    its own sets count (a day can list the same machine twice); otherwise the same-named one."""
    key = exercise_key(exercise.name, exercise.muscle_group)
    by_session: dict[uuid.UUID, list[_PastLog]] = {}
    for log in logs:
        if log.exercise_id == exercise.id or log.key == key:
            by_session.setdefault(log.session_id, []).append(log)
    sessions: list[PastSession] = []
    for logs_in_session in by_session.values():
        own = [log for log in logs_in_session if log.exercise_id == exercise.id]
        chosen = sorted(own or logs_in_session, key=lambda log: (log.performed_at, log.set_number))
        sets = [PastSet(weight=log.weight, reps=log.reps) for log in chosen]
        sessions.append(PastSession(date=chosen[0].local_date, sets=sets))
        if limit is not None and len(sessions) == limit:
            break
    return sessions


async def day_log(session: AsyncSession, user: User, day_id: uuid.UUID) -> DayLog:
    day = await _day(session, user.id, day_id)
    today = local_today(user)
    workout = await _todays_session(session, user, day.id, lock=False)
    logs = await _past_logs(session, user.id, day.exercises, before=today)
    last = {}
    for exercise in day.exercises:
        if history := _history(exercise, logs, limit=1):
            last[exercise.id] = history[0]
    return DayLog(
        day_id=day.id,
        today=today,
        session=await _read(session, workout) if workout else None,
        last=last,
    )


async def exercise_history(
    session: AsyncSession, user: User, exercise_id: uuid.UUID
) -> ExerciseHistory:
    exercise = await get_exercise(session, user.id, exercise_id)
    logs = await _past_logs(session, user.id, [exercise], before=local_today(user))
    sessions = _history(exercise, logs)
    best = max((s.weight for past in sessions for s in past.sets), default=None)
    recent = [
        WeightPoint(date=past.date, weight=max(s.weight for s in past.sets))
        for past in reversed(sessions[:RECENT_SESSIONS])
    ]
    return ExerciseHistory(sessions=sessions[:HISTORY_SESSIONS], best_weight=best, recent=recent)


# --- week and summary ----------------------------------------------------------------------------


async def plan_week(session: AsyncSession, user: User, plan_id: uuid.UUID) -> PlanWeek:
    plan = await workouts.get_plan(session, user.id, plan_id)
    today = local_today(user)
    week_start = today - timedelta(days=today.weekday())
    workouts_this_week = await session.scalars(
        select(WorkoutSession)
        .where(
            WorkoutSession.user_id == user.id,
            WorkoutSession.day_id.in_([day.id for day in plan.days]),
            WorkoutSession.local_date.between(week_start, week_start + timedelta(days=6)),
        )
        .order_by(WorkoutSession.local_date)
    )
    latest = {workout.day_id: workout for workout in workouts_this_week}  # the last date wins
    counts: dict[tuple[uuid.UUID, uuid.UUID], int] = {}
    if latest:
        rows = await session.execute(
            select(ExerciseLog.session_id, ExerciseLog.exercise_id, func.count())
            .where(ExerciseLog.session_id.in_([w.id for w in latest.values()]))
            .group_by(ExerciseLog.session_id, ExerciseLog.exercise_id)
        )
        counts = {(row[0], row[1]): row[2] for row in rows}

    days = []
    for day in plan.days:
        workout = latest.get(day.id)
        if workout is None:
            days.append(
                DayWeek(
                    day_id=day.id,
                    session_id=None,
                    date=None,
                    finished=False,
                    exercises_done=0,
                    exercises_total=len(day.exercises),
                    sets=0,
                )
            )
            continue
        logged = {ex_id: n for (sid, ex_id), n in counts.items() if sid == workout.id}
        done = count_done(day.exercises, workout, logged)
        days.append(
            DayWeek(
                day_id=day.id,
                session_id=workout.id,
                date=workout.local_date,
                finished=workout.ended_at is not None,
                exercises_done=done,
                exercises_total=len(day.exercises),
                sets=sum(n for (session_id, _), n in counts.items() if session_id == workout.id),
            )
        )
    return PlanWeek(today=today, week_start=week_start, days=days)


async def finish_session(
    session: AsyncSession, user: User, session_id: uuid.UUID
) -> SessionSummary:
    workout = await session.scalar(
        select(WorkoutSession)
        .where(WorkoutSession.id == session_id, WorkoutSession.user_id == user.id)
        .with_for_update()
    )
    if workout is None:
        raise SessionNotFoundError
    if workout.ended_at is None:
        workout.ended_at = now()
    await session.commit()
    logs = list(
        await session.scalars(select(ExerciseLog).where(ExerciseLog.session_id == workout.id))
    )
    duration = (workout.ended_at - workout.started_at).total_seconds()
    return SessionSummary(
        session_id=workout.id,
        sets=len(logs),
        volume=sum((log.weight * log.reps for log in logs), Decimal(0)),
        duration_seconds=max(0, round(duration)),
        records=await _records(session, user, workout, logs),
    )


async def _records(
    session: AsyncSession, user: User, workout: WorkoutSession, logs: list[ExerciseLog]
) -> list[PersonalRecord]:
    """Exercises lifted heavier than on any earlier date. A first time sets no record."""
    heaviest: dict[uuid.UUID, Decimal] = {}
    for log in logs:
        heaviest[log.exercise_id] = max(log.weight, heaviest.get(log.exercise_id, log.weight))
    if not heaviest:
        return []
    exercises = list(await session.scalars(select(Exercise).where(Exercise.id.in_(heaviest))))
    earlier = await _past_logs(session, user.id, exercises, before=workout.local_date)
    records = []
    for exercise in sorted(exercises, key=lambda e: e.position):
        before = [s.weight for past in _history(exercise, earlier) for s in past.sets]
        weight = heaviest[exercise.id]
        if weight > 0 and before and weight > max(before):
            records.append(
                PersonalRecord(exercise_id=exercise.id, name=exercise.name, weight=weight)
            )
    return records
