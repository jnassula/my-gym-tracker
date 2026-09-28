import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from app.exercises.models import MuscleGroup
from app.progress.metrics import (
    LoggedSet,
    Record,
    adherence,
    duration_seconds,
    records,
    session_tops,
    week_streak,
    weekly_tops,
)

SQUAT = ("agachamento livre", MuscleGroup.QUADS)
SESSIONS: dict[date, uuid.UUID] = {}


def logged(
    day: date, weight: float, reps: int = 10, key: tuple[str, MuscleGroup] = SQUAT
) -> LoggedSet:
    return LoggedSet(
        session_id=SESSIONS.setdefault(day, uuid.uuid4()),
        local_date=day,
        performed_at=datetime(day.year, day.month, day.day, 18, tzinfo=UTC),
        exercise_id=uuid.uuid4(),
        key=key,
        name=key[0],
        muscle_group=key[1],
        weight=Decimal(str(weight)),
        reps=reps,
    )


def test_session_tops_take_the_heaviest_set_and_sum_the_volume() -> None:
    day = date(2026, 9, 28)

    [top] = session_tops([logged(day, 80, 10), logged(day, 85, 6), logged(day, 85, 8)])[SQUAT]

    assert (top.weight, top.reps, top.volume) == (
        Decimal(85),
        8,
        Decimal(80 * 10 + 85 * 6 + 85 * 8),
    )


def test_weekly_tops_keep_the_heaviest_of_each_week() -> None:
    monday, wednesday, next_monday = date(2026, 9, 28), date(2026, 9, 30), date(2026, 10, 5)
    tops = session_tops([logged(monday, 80), logged(wednesday, 82.5), logged(next_monday, 81)])

    assert weekly_tops(tops[SQUAT]) == [(monday, Decimal("82.5")), (next_monday, Decimal(81))]


def test_week_streak_counts_back_from_this_week() -> None:
    wednesday = date(2026, 9, 30)
    weeks_ago = [wednesday - timedelta(weeks=n) for n in (1, 2, 3, 5)]

    # This week has nothing yet: it doesn't break the streak (3), the gap at week 4 does.
    assert week_streak(weeks_ago, wednesday) == 3
    assert week_streak([*weeks_ago, wednesday], wednesday) == 4
    assert week_streak([wednesday - timedelta(weeks=2)], wednesday) == 0
    assert week_streak([], wednesday) == 0


def test_records_beat_every_earlier_date() -> None:
    days = [date(2026, 9, 1) + timedelta(weeks=n) for n in range(5)]
    tops = session_tops([
        logged(days[0], 80),  # first time: not a record
        logged(days[1], 82.5),  # record
        logged(days[2], 82.5),  # equal: not a record
        logged(days[3], 80),
        logged(days[4], 85),  # record
    ])  # fmt: skip

    assert records(tops) == [
        Record(key=SQUAT, date=days[1], weight=Decimal("82.5")),
        Record(key=SQUAT, date=days[4], weight=Decimal(85)),
    ]


def test_adherence_and_duration() -> None:
    planned = [date(2026, 9, 28), date(2026, 9, 30), date(2026, 10, 2)]
    start = datetime(2026, 9, 28, 18, tzinfo=UTC)

    assert adherence(planned, {date(2026, 9, 28), date(2026, 10, 2)}) == 2 / 3
    assert adherence([], set()) is None
    assert duration_seconds(start, start + timedelta(minutes=58), None) == 58 * 60
    assert duration_seconds(start, None, start + timedelta(minutes=40)) == 40 * 60
    assert duration_seconds(start, None, None) == 0
