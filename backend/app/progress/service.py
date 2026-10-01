"""Business logic for the progress screens: read-only aggregates over the training log.

Progress follows an exercise across plans (same name and muscle group) and leaves warm-up sets
out. "Today" and weeks (Monday to Sunday) are in the user's time zone. The arithmetic lives in
``metrics``; this module loads the rows.
"""

import uuid
from collections import Counter
from datetime import date, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.exercises.models import Exercise, MuscleGroup
from app.health import service as health
from app.health.metrics import (
    Sample,
    SessionTimes,
    average,
    chart,
    peak,
    session_window,
    set_peak,
    total,
)
from app.health.models import HealthSampleType
from app.logs.errors import SessionNotFoundError
from app.logs.models import ExerciseLog, WorkoutSession
from app.logs.schemas import WeightPoint
from app.logs.service import count_done, exercise_key, get_exercise, local_today
from app.progress.metrics import (
    LoggedSet,
    adherence,
    duration_seconds,
    records,
    session_tops,
    volume,
    week_start,
    week_streak,
    weekly_tops,
)
from app.progress.schemas import (
    CalendarDay,
    DayStatus,
    DayVolume,
    ExerciseComparison,
    ExerciseProgress,
    ExerciseTrend,
    GroupSets,
    HeartRatePoint,
    LastRecord,
    ProgressCalendar,
    ProgressOverview,
    Range,
    SessionBest,
    SessionDetail,
    SessionExercise,
    SessionHealth,
    TodayComparison,
    Totals,
    WeekComparison,
    WeekSession,
)
from app.users.models import User
from app.workouts.models import WorkoutDay, WorkoutPlan

RANGE_DAYS: dict[Range, int] = {"4w": 28, "3m": 91, "1y": 365}
RECENT_SESSIONS = 8
TABLE_ROWS = 5


async def _sets(
    session: AsyncSession, user_id: uuid.UUID, *, since: date | None = None, name: str | None = None
) -> list[LoggedSet]:
    """The user's sets, oldest first; optionally from a date, or of one exercise name."""
    query = (
        select(
            ExerciseLog.session_id,
            WorkoutSession.local_date,
            ExerciseLog.performed_at,
            ExerciseLog.exercise_id,
            Exercise.name,
            Exercise.muscle_group,
            ExerciseLog.weight,
            ExerciseLog.reps,
        )
        .join(Exercise, ExerciseLog.exercise_id == Exercise.id)
        .join(WorkoutSession, ExerciseLog.session_id == WorkoutSession.id)
        .where(ExerciseLog.user_id == user_id)
        .order_by(WorkoutSession.local_date, ExerciseLog.performed_at)
    )
    if since is not None:
        query = query.where(WorkoutSession.local_date >= since)
    if name is not None:
        query = query.where(func.lower(func.trim(Exercise.name)) == name.strip().lower())
    rows = await session.execute(query)
    return [
        LoggedSet(
            session_id=row.session_id,
            local_date=row.local_date,
            performed_at=row.performed_at,
            exercise_id=row.exercise_id,
            key=exercise_key(row.name, row.muscle_group),
            name=row.name,
            muscle_group=row.muscle_group,
            weight=row.weight,
            reps=row.reps,
        )
        for row in rows
    ]


async def _trained_dates(session: AsyncSession, user_id: uuid.UUID) -> set[date]:
    rows = await session.scalars(
        select(WorkoutSession.local_date).where(WorkoutSession.user_id == user_id).distinct()
    )
    return set(rows)


async def _active_plan(session: AsyncSession, user_id: uuid.UUID) -> WorkoutPlan | None:
    return await session.scalar(
        select(WorkoutPlan)
        .where(WorkoutPlan.user_id == user_id, WorkoutPlan.is_active)
        .options(selectinload(WorkoutPlan.days).selectinload(WorkoutDay.exercises))
    )


# --- overview ------------------------------------------------------------------------------------


async def overview(session: AsyncSession, user: User) -> ProgressOverview:
    today = local_today(user)
    this_week_start = week_start(today)
    working = [s for s in await _sets(session, user.id) if s.working]
    tops = session_tops(working)
    this_week = [s for s in working if s.local_date >= this_week_start]
    latest = {s.key: s for s in working}  # sets are oldest first: the last one wins

    exercises = []
    for key, entries in tops.items():
        best = max(entry.weight for entry in entries)
        if best <= 0:  # bodyweight only: nothing to chart
            continue
        recent = entries[-RECENT_SESSIONS:]
        exercises.append(
            ExerciseTrend(
                exercise_id=latest[key].exercise_id,
                name=latest[key].name,
                muscle_group=key[1],
                best_weight=best,
                recent=[WeightPoint(date=entry.date, weight=entry.weight) for entry in recent],
                trend=recent[-1].weight - recent[0].weight,
                last_date=entries[-1].date,
            )
        )
    exercises.sort(key=lambda e: (-e.last_date.toordinal(), e.name.lower()))

    groups = Counter(s.muscle_group for s in this_week)
    month_start = today.replace(day=1)
    found = records(tops)
    last = max(found, key=lambda record: (record.date, record.weight), default=None)
    return ProgressOverview(
        week_streak=week_streak(await _trained_dates(session, user.id), today),
        week_volume=volume(this_week),
        records_this_month=sum(1 for record in found if record.date >= month_start),
        last_record=None
        if last is None
        else LastRecord(
            exercise_id=latest[last.key].exercise_id,
            name=latest[last.key].name,
            weight=last.weight,
            date=last.date,
        ),
        sets_by_group=[
            GroupSets(muscle_group=group, sets=n)
            for group, n in sorted(groups.items(), key=lambda item: (-item[1], item[0] or ""))
        ],
        exercises=exercises,
    )


# --- one exercise --------------------------------------------------------------------------------


async def exercise_progress(
    session: AsyncSession, user: User, exercise_id: uuid.UUID, range_: Range
) -> ExerciseProgress:
    exercise = await get_exercise(session, user.id, exercise_id, include_deleted=True)
    key = exercise_key(exercise.name, exercise.muscle_group)
    sets = [s for s in await _sets(session, user.id, name=exercise.name) if s.key == key]
    entries = session_tops(sets).get(key, [])
    since = local_today(user) - timedelta(days=RANGE_DAYS[range_] - 1)
    in_range = [entry for entry in entries if entry.date >= since]
    if range_ == "1y":
        points = [WeightPoint(date=day, weight=weight) for day, weight in weekly_tops(in_range)]
    else:
        points = [WeightPoint(date=entry.date, weight=entry.weight) for entry in in_range]
    return ExerciseProgress(
        exercise_id=exercise.id,
        name=exercise.name,
        muscle_group=exercise.muscle_group,
        range=range_,
        points=points,
        best_weight=max((entry.weight for entry in entries), default=None),
        volume=sum((entry.volume for entry in in_range), Decimal(0)),
        trend=points[-1].weight - points[0].weight if points else None,
        sessions=[
            SessionBest(date=entry.date, weight=entry.weight, reps=entry.reps, volume=entry.volume)
            for entry in reversed(in_range[-TABLE_ROWS:])
        ],
    )


# --- calendar ------------------------------------------------------------------------------------


def _month_days(first: date) -> list[date]:
    following = (first.replace(day=28) + timedelta(days=4)).replace(day=1)
    return [first + timedelta(days=n) for n in range((following - first).days)]


async def calendar(session: AsyncSession, user: User, month: date | None) -> ProgressCalendar:
    today = local_today(user)
    first = (month or today).replace(day=1)
    trained = await _trained_dates(session, user.id)
    plan = await _active_plan(session, user.id)
    weekdays = {day.weekday for day in plan.days if day.weekday is not None} if plan else set()
    # Days before the plan was imported weren't planned by it.
    plan_start = plan.created_at.astimezone(ZoneInfo(user.timezone)).date() if plan else today

    def planned(day: date) -> bool:
        return day >= plan_start and day.weekday() in weekdays

    def status(day: date) -> DayStatus:
        if day in trained:
            return "trained"
        if day == today:
            return "today" if planned(day) else "rest"
        if day > today:
            return "future"
        return "missed" if planned(day) else "rest"

    # Today only counts against the plan once it's over; trained today, it already counts.
    window = [today - timedelta(days=n) for n in range(30)]
    due = [day for day in window if planned(day) and (day < today or day in trained)]

    return ProgressCalendar(
        month=first,
        today=today,
        days=[CalendarDay(date=day, status=status(day)) for day in _month_days(first)],
        week_streak=week_streak(trained, today),
        sessions_total=len(trained),
        adherence_30d=adherence(due, trained),
        this_week=await _week_sessions(session, user, week_start(today)),
    )


async def _week_sessions(session: AsyncSession, user: User, start: date) -> list[WeekSession]:
    workouts = list(
        await session.scalars(
            select(WorkoutSession)
            .where(WorkoutSession.user_id == user.id, WorkoutSession.local_date >= start)
            .order_by(WorkoutSession.local_date, WorkoutSession.started_at)
        )
    )
    if not workouts:
        return []
    day_ids = [w.day_id for w in workouts if w.day_id is not None]
    days = {
        day.id: day
        for day in await session.scalars(
            select(WorkoutDay)
            .where(WorkoutDay.id.in_(day_ids))
            .options(selectinload(WorkoutDay.exercises))
        )
    }
    sets = await _sets(session, user.id, since=start)
    result = []
    for workout in workouts:
        in_session = [s for s in sets if s.session_id == workout.id]
        day = days.get(workout.day_id) if workout.day_id else None
        exercises = day.exercises if day else []
        logged = Counter(s.exercise_id for s in in_session)
        result.append(
            WeekSession(
                session_id=workout.id,
                date=workout.local_date,
                weekday=workout.local_date.weekday(),
                label=day.label if day else "",
                duration_seconds=duration_seconds(
                    workout.started_at,
                    workout.ended_at,
                    max((s.performed_at for s in in_session), default=None),
                ),
                sets=sum(1 for s in in_session if s.working),
                exercises_done=count_done(exercises, workout, logged),
                exercises_total=len(exercises),
            )
        )
    return result


# --- week against week ---------------------------------------------------------------------------


async def week_comparison(session: AsyncSession, user: User) -> WeekComparison:
    today = local_today(user)
    start = week_start(today)
    last_start = start - timedelta(days=7)
    until = today.weekday()
    sets = await _sets(session, user.id, since=last_start)
    working = [s for s in sets if s.working]
    workouts = list(
        await session.scalars(
            select(WorkoutSession).where(
                WorkoutSession.user_id == user.id, WorkoutSession.local_date >= last_start
            )
        )
    )
    last_set = {}
    for s in sets:
        last_set[s.session_id] = s.performed_at  # oldest first: the last one wins

    def totals(first: date, last: date) -> Totals:
        chosen = [s for s in working if first <= s.local_date <= last]
        return Totals(
            volume=volume(chosen),
            sets=len(chosen),
            duration_seconds=sum(
                duration_seconds(w.started_at, w.ended_at, last_set.get(w.id))
                for w in workouts
                if first <= w.local_date <= last
            ),
        )

    def volume_on(day: date) -> Decimal:
        return volume(s for s in working if s.local_date == day)

    plan = await _active_plan(session, user.id)
    planned = {day.weekday for day in plan.days if day.weekday is not None} if plan else set()
    trained = {s.local_date.weekday() for s in working}
    days = [
        DayVolume(
            weekday=weekday,
            this_week=volume_on(start + timedelta(days=weekday)),
            last_week=volume_on(last_start + timedelta(days=weekday)),
        )
        for weekday in sorted(planned | trained)
    ]

    return WeekComparison(
        week_start=start,
        iso_week=start.isocalendar().week,
        last_iso_week=last_start.isocalendar().week,
        until_weekday=until,
        this_week=totals(start, today),
        last_week=totals(last_start, last_start + timedelta(days=until)),
        days=days,
        today=_today_comparison(plan, today, working),
    )


def _today_comparison(
    plan: WorkoutPlan | None, today: date, working: list[LoggedSet]
) -> TodayComparison | None:
    day = next((d for d in plan.days if d.weekday == today.weekday()), None) if plan else None
    if day is None:
        return None

    def heaviest(exercise: Exercise, on: date) -> list[LoggedSet]:
        key = exercise_key(exercise.name, exercise.muscle_group)
        return [s for s in working if s.local_date == on and s.key == key]

    rows = []
    for exercise in day.exercises:
        if exercise.muscle_group is MuscleGroup.WARMUP:
            continue
        this, last = heaviest(exercise, today), heaviest(exercise, today - timedelta(days=7))
        rows.append(
            ExerciseComparison(
                exercise_id=exercise.id,
                name=exercise.name,
                last_week=max((s.weight for s in last), default=None),
                this_week=max((s.weight for s in this), default=None),
            )
        )
    return TodayComparison(day_id=day.id, label=day.label, exercises=rows)


# --- one session (with the watch's data, once synced) --------------------------------------------


async def session_detail(session: AsyncSession, user: User, session_id: uuid.UUID) -> SessionDetail:
    workout = await session.scalar(
        select(WorkoutSession).where(
            WorkoutSession.id == session_id, WorkoutSession.user_id == user.id
        )
    )
    if workout is None:
        raise SessionNotFoundError
    day = await session.get(WorkoutDay, workout.day_id) if workout.day_id else None
    sets = [
        s
        for s in await _sets(session, user.id, since=workout.local_date)
        if s.session_id == workout.id
    ]
    samples = await health.samples_of(session, user.id, workout.id)
    heart_rate = samples[HealthSampleType.HEART_RATE]

    by_exercise: dict[uuid.UUID, list[LoggedSet]] = {}
    for s in sorted(sets, key=lambda s: s.performed_at):
        by_exercise.setdefault(s.exercise_id, []).append(s)
    working = [s for s in sets if s.working]
    return SessionDetail(
        session_id=workout.id,
        date=workout.local_date,
        label=day.label if day else "",
        started_at=workout.started_at,
        ended_at=workout.ended_at,
        duration_seconds=duration_seconds(
            workout.started_at,
            workout.ended_at,
            max((s.performed_at for s in sets), default=None),
        ),
        sets=len(working),
        volume=volume(working),
        exercises=[
            SessionExercise(
                exercise_id=exercise_id,
                name=logged[0].name,
                muscle_group=logged[0].muscle_group,
                sets=len(logged),
                top_weight=max(s.weight for s in logged),
                first_set_at=logged[0].performed_at,
                peak_heart_rate=set_peak(heart_rate, [s.performed_at for s in logged]),
            )
            for exercise_id, logged in by_exercise.items()
        ],
        health=_session_health(workout, sets, samples),
    )


def _session_health(
    workout: WorkoutSession,
    sets: list[LoggedSet],
    samples: dict[HealthSampleType, list[Sample]],
) -> SessionHealth | None:
    if not any(samples.values()):
        return None
    set_times = [s.performed_at for s in sets]
    window = session_window(
        SessionTimes(workout.id, workout.started_at, workout.ended_at, set_times)
    )
    heart_rate = samples[HealthSampleType.HEART_RATE]
    return SessionHealth(
        starts_at=window.start,
        ends_at=window.end,
        avg_heart_rate=average(heart_rate),
        max_heart_rate=peak(heart_rate),
        calories=total(samples[HealthSampleType.CALORIES]),
        heart_rate=[HeartRatePoint(at=p.at, bpm=round(p.value)) for p in chart(heart_rate, window)],
    )
