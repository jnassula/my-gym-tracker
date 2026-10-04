"""What the LLM returns, and how it becomes a ``ParsedPlan``.

The model is asked for JSON, but nothing enforces its shape: the schema is lenient (every field
optional, numbers accepted where text is expected) and ``to_parsed_plan`` cleans the values up to
what the preview accepts (known muscle groups, each weekday used once, bounded lengths).
"""

import re
from datetime import date

from pydantic import BaseModel, ConfigDict

from app.exercises.models import MuscleGroup
from app.workouts.parser.types import ParsedDay, ParsedExercise, ParsedPlan, ParseWarning

# The limits of app/workouts/schemas.py, so a preview built from this always validates.
MAX_NAME = 120
MAX_LABEL = 120
MAX_REPS = 32
MAX_NOTES = 2000
MAX_SETS = 50
MAX_REST = 3600
# As many days as sheets in one import, and what a saved day may hold.
MAX_DAYS = 10
MAX_EXERCISES = 60

# Warnings the model raises itself; the other two follow from the values.
MODEL_FLAGS = (
    ParseWarning.TECHNIQUE_SETS,
    ParseWarning.COMBINED_EXERCISE,
    ParseWarning.ALTERNATIVE_EXERCISE,
)
# Warm-up and cardio items are timed, so missing sets are expected.
_UNCOUNTED_GROUPS = {MuscleGroup.WARMUP, MuscleGroup.CARDIO}
_SPACES = re.compile(r"\s+")


class NoWorkoutStructureError(Exception):
    """The text is not a workout plan, or it has no training days."""


class _Lenient(BaseModel):
    model_config = ConfigDict(coerce_numbers_to_str=True, extra="ignore")


class ExerciseOutput(_Lenient):
    name: str | None = None
    muscle_group: str | None = None
    sets: int | None = None
    reps: str | None = None
    rest_seconds: int | None = None
    rest_max_seconds: int | None = None
    notes: str | None = None
    flags: list[str] = []


class DayOutput(_Lenient):
    weekday: int | None = None
    label: str | None = None
    exercises: list[ExerciseOutput] = []


class PlanOutput(_Lenient):
    is_workout_plan: bool = True
    title: str | None = None
    valid_until: str | None = None
    rest_days: list[int] = []
    days: list[DayOutput] = []


def _clean(text: str | None, limit: int) -> str:
    cleaned = _SPACES.sub(" ", text or "").strip()
    return cleaned if len(cleaned) <= limit else cleaned[: limit - 1] + "…"


def _bounded(value: int | None, low: int, high: int) -> int | None:
    return None if value is None or value < low else min(value, high)


def _muscle_group(value: str | None) -> MuscleGroup | None:
    try:
        return MuscleGroup((value or "").strip().lower())
    except ValueError:
        return None


def _rest(low: int | None, high: int | None) -> tuple[int | None, int | None]:
    """(min, max) in seconds; max is None unless it is a real range."""
    low, high = _bounded(low, 0, MAX_REST), _bounded(high, 0, MAX_REST)
    if low is None:
        return high, None
    if high is None or high == low:
        return low, None
    return min(low, high), max(low, high)


def _date(value: str | None) -> date | None:
    try:
        return date.fromisoformat((value or "").strip())
    except ValueError:
        return None


def _exercise(output: ExerciseOutput) -> ParsedExercise | None:
    name = _clean(output.name, MAX_NAME)
    if not name:
        return None
    group = _muscle_group(output.muscle_group)
    sets = _bounded(output.sets, 1, MAX_SETS)
    rest_seconds, rest_max_seconds = _rest(output.rest_seconds, output.rest_max_seconds)
    warnings = [flag for flag in MODEL_FLAGS if flag in output.flags]
    if group is None:
        warnings.append(ParseWarning.UNKNOWN_MUSCLE_GROUP)
    if sets is None and group not in _UNCOUNTED_GROUPS:
        warnings.append(ParseWarning.NO_SETS)
    return ParsedExercise(
        name=name,
        muscle_group=group,
        sets=sets,
        reps=_clean(output.reps, MAX_REPS) or None,
        rest_seconds=rest_seconds,
        rest_max_seconds=rest_max_seconds,
        notes=_clean(output.notes, MAX_NOTES) or None,
        warnings=warnings,
    )


def to_parsed_plan(output: PlanOutput) -> ParsedPlan:
    days: list[ParsedDay] = []
    used: set[int] = set()
    rest_days = {day for day in output.rest_days if 0 <= day <= 6}
    for day in output.days[:MAX_DAYS] if output.is_workout_plan else []:
        exercises = [e for e in map(_exercise, day.exercises[:MAX_EXERCISES]) if e is not None]
        weekday = day.weekday if day.weekday is not None and 0 <= day.weekday <= 6 else None
        if not exercises:
            if weekday is not None:
                rest_days.add(weekday)
            continue
        if weekday in used:
            weekday = None  # a repeated weekday: the user picks the right one in the preview
        if weekday is not None:
            used.add(weekday)
        days.append(
            ParsedDay(weekday=weekday, label=_clean(day.label, MAX_LABEL), exercises=exercises)
        )
    if not days:
        raise NoWorkoutStructureError("No workout days found")
    return ParsedPlan(
        title=_clean(output.title, MAX_NAME) or None,
        valid_until=_date(output.valid_until),
        days=days,
        rest_days=sorted(rest_days - used),
    )
