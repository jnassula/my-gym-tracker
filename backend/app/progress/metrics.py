"""Progress arithmetic over a user's logged sets. Pure: no I/O, unit-tested on its own."""

import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal

from app.exercises.key import ExerciseKey
from app.exercises.models import MuscleGroup


@dataclass(frozen=True)
class LoggedSet:
    session_id: uuid.UUID
    local_date: date
    performed_at: datetime
    exercise_id: uuid.UUID
    key: ExerciseKey
    name: str
    muscle_group: MuscleGroup | None
    weight: Decimal
    reps: int

    @property
    def working(self) -> bool:
        """Progress leaves warm-up sets out."""
        return self.muscle_group is not MuscleGroup.WARMUP

    @property
    def volume(self) -> Decimal:
        return self.weight * self.reps


@dataclass(frozen=True)
class SessionTop:
    """An exercise's sets in one session, summed up."""

    session_id: uuid.UUID
    date: date
    weight: Decimal  # heaviest set
    reps: int  # of that set
    volume: Decimal


def week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def volume(sets: Iterable[LoggedSet]) -> Decimal:
    return sum((s.volume for s in sets), Decimal(0))


def session_tops(sets: Iterable[LoggedSet]) -> dict[ExerciseKey, list[SessionTop]]:
    """Per exercise, one entry per session in date order."""
    grouped: dict[ExerciseKey, dict[uuid.UUID, list[LoggedSet]]] = {}
    for s in sets:
        grouped.setdefault(s.key, {}).setdefault(s.session_id, []).append(s)
    tops: dict[ExerciseKey, list[SessionTop]] = {}
    for key, sessions in grouped.items():
        entries = []
        for session_id, in_session in sessions.items():
            top = max(in_session, key=lambda s: (s.weight, s.reps))
            entries.append(
                SessionTop(
                    session_id=session_id,
                    date=top.local_date,
                    weight=top.weight,
                    reps=top.reps,
                    volume=volume(in_session),
                )
            )
        tops[key] = sorted(entries, key=lambda e: e.date)
    return tops


def weekly_tops(entries: Sequence[SessionTop]) -> list[tuple[date, Decimal]]:
    """The heaviest set of each week (Monday), in order: the "1 ano" chart."""
    weeks: dict[date, Decimal] = {}
    for entry in entries:
        start = week_start(entry.date)
        weeks[start] = max(entry.weight, weeks.get(start, entry.weight))
    return sorted(weeks.items())


def week_streak(trained: Iterable[date], today: date) -> int:
    """Consecutive weeks with at least one workout, up to this one. The current week doesn't
    break the streak while it has none yet: there is still time."""
    weeks = {week_start(day) for day in trained}
    week = week_start(today)
    if week not in weeks:
        week -= timedelta(days=7)
    streak = 0
    while week in weeks:
        streak += 1
        week -= timedelta(days=7)
    return streak


@dataclass(frozen=True)
class Record:
    """A date an exercise was lifted heavier than on every earlier date."""

    key: ExerciseKey
    date: date
    weight: Decimal  # the heaviest set that date


def records(tops: dict[ExerciseKey, list[SessionTop]]) -> list[Record]:
    """Every record, exercise by exercise in date order. A first time isn't one."""
    found = []
    for key, entries in tops.items():
        by_date: dict[date, Decimal] = {}
        for entry in entries:
            by_date[entry.date] = max(entry.weight, by_date.get(entry.date, entry.weight))
        best: Decimal | None = None
        for day, weight in sorted(by_date.items()):
            if best is not None and weight > best:
                found.append(Record(key=key, date=day, weight=weight))
            best = weight if best is None else max(best, weight)
    return found


def adherence(planned: Iterable[date], trained: set[date]) -> float | None:
    """Share of planned dates that were trained; None when nothing was planned."""
    days = list(planned)
    if not days:
        return None
    return sum(1 for day in days if day in trained) / len(days)


def duration_seconds(
    started_at: datetime, ended_at: datetime | None, last_set: datetime | None
) -> int:
    """A finished session runs to its end; an unfinished one to its last set."""
    end = ended_at or last_set
    return max(0, round((end - started_at).total_seconds())) if end else 0
