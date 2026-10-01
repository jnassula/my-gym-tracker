"""Response schemas for the progress screens. Weights are kilograms, as stored."""

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

from app.exercises.models import MuscleGroup
from app.logs.schemas import Kg, WeightPoint

Range = Literal["4w", "3m", "1y"]
RANGE_DAYS: dict[Range, int] = {"4w": 28, "3m": 91, "1y": 365}
DayStatus = Literal["trained", "missed", "rest", "today", "future"]


class GroupSets(BaseModel):
    muscle_group: MuscleGroup | None
    sets: int


class ExerciseTrend(BaseModel):
    """One exercise across plans (same name and muscle group)."""

    # The most recently trained exercise with this name and group: open its detail with it.
    exercise_id: uuid.UUID
    name: str
    muscle_group: MuscleGroup | None
    best_weight: Kg
    # Heaviest set of the last 8 sessions, oldest first, and the change from first to last.
    recent: list[WeightPoint]
    trend: Kg
    last_date: date


class LastRecord(BaseModel):
    """The newest personal record (Início's "Último recorde")."""

    exercise_id: uuid.UUID  # the most recently trained exercise with this name and group
    name: str
    weight: Kg
    date: date


class ProgressOverview(BaseModel):
    week_streak: int
    week_volume: Kg
    records_this_month: int
    last_record: LastRecord | None
    # This week's working sets (warm-ups left out), most first.
    sets_by_group: list[GroupSets]
    # Exercises trained with weight, most recently trained first.
    exercises: list[ExerciseTrend]


class SessionBest(BaseModel):
    date: date
    weight: Kg  # the heaviest set
    reps: int  # of that set
    volume: Kg  # sum of weight times reps that session


class ExerciseProgress(BaseModel):
    exercise_id: uuid.UUID
    name: str
    muscle_group: MuscleGroup | None
    range: Range
    # One point per session (4w, 3m) or per week (1y), oldest first.
    points: list[WeightPoint]
    best_weight: Kg | None  # ever
    volume: Kg  # within the range
    trend: Kg | None  # last point minus first
    sessions: list[SessionBest]  # the last 5 in the range, newest first


class CalendarDay(BaseModel):
    date: date
    status: DayStatus


class WeekSession(BaseModel):
    session_id: uuid.UUID
    date: date
    weekday: int
    label: str
    duration_seconds: int
    sets: int  # working sets
    exercises_done: int
    exercises_total: int


class ProgressCalendar(BaseModel):
    month: date  # its first day
    today: date
    days: list[CalendarDay]
    week_streak: int
    sessions_total: int
    # Planned days trained in the last 30 days (0 to 1); null without planned days.
    adherence_30d: float | None
    this_week: list[WeekSession]


class Totals(BaseModel):
    volume: Kg
    sets: int
    duration_seconds: int


class DayVolume(BaseModel):
    weekday: int
    this_week: Kg
    last_week: Kg


class ExerciseComparison(BaseModel):
    exercise_id: uuid.UUID
    name: str
    last_week: Kg | None  # heaviest set on the same weekday last week
    this_week: Kg | None  # and today


class TodayComparison(BaseModel):
    day_id: uuid.UUID
    label: str
    exercises: list[ExerciseComparison]


class WeekComparison(BaseModel):
    """This week so far against last week up to the same weekday."""

    week_start: date
    iso_week: int
    last_iso_week: int
    until_weekday: int
    this_week: Totals
    last_week: Totals
    days: list[DayVolume]  # both whole weeks, for the chart
    today: TodayComparison | None  # when the active plan trains today


class HeartRatePoint(BaseModel):
    at: datetime
    bpm: int


class SessionExercise(BaseModel):
    exercise_id: uuid.UUID
    name: str
    muscle_group: MuscleGroup | None
    sets: int
    top_weight: Kg
    first_set_at: datetime
    peak_heart_rate: int | None  # the highest around any of its sets


class SessionHealth(BaseModel):
    """What the watch recorded during the session (after a data source synced)."""

    starts_at: datetime  # the session's window (a little before the first set to after the last)
    ends_at: datetime
    avg_heart_rate: int | None
    max_heart_rate: int | None
    calories: int | None  # active kcal
    heart_rate: list[HeartRatePoint]  # averaged for the chart


class SessionDetail(BaseModel):
    session_id: uuid.UUID
    date: date
    label: str
    started_at: datetime
    ended_at: datetime | None
    duration_seconds: int
    sets: int  # working sets
    volume: Kg  # working sets, weight times reps
    exercises: list[SessionExercise]  # in the order they were first logged
    health: SessionHealth | None
