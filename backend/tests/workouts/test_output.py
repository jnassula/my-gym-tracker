from datetime import date
from typing import Any

import pytest

from app.exercises.models import MuscleGroup as G
from app.workouts.parser import NoWorkoutStructureError, ParsedExercise, ParsedPlan
from app.workouts.parser import ParseWarning as W
from app.workouts.parser.output import MAX_DAYS, MAX_EXERCISES, PlanOutput, to_parsed_plan
from tests.workouts.layout import PLAN_REPLY


def exercise(**fields: Any) -> dict[str, Any]:
    return {"name": "Supino Reto", "muscle_group": "chest", "sets": 3, "reps": "10"} | fields


def day(*exercises: dict[str, Any], weekday: int | None = 0) -> dict[str, Any]:
    return {"weekday": weekday, "label": "Peito", "exercises": list(exercises)}


def read(reply: dict[str, Any]) -> ParsedPlan:
    return to_parsed_plan(PlanOutput.model_validate(reply))


def read_exercise(**fields: Any) -> ParsedExercise:
    [parsed] = read({"days": [day(exercise(**fields))]}).days[0].exercises
    return parsed


def test_reads_a_complete_reply() -> None:
    plan = read(PLAN_REPLY)

    assert plan.title == "Periodização de Treino 07"
    assert plan.valid_until == date(2026, 4, 15)
    # Wednesday has no exercises: it is a rest day, not a training day.
    assert [d.weekday for d in plan.days] == [0, 1, 4]
    assert plan.rest_days == [2]
    assert [len(d.exercises) for d in plan.days] == [5, 5, 3]
    squat = plan.days[0].exercises[3]
    assert (squat.name, squat.muscle_group, squat.sets, squat.reps) == (
        "Agachamento Livre",
        G.QUADS,
        3,
        "15/8-12",
    )
    assert (squat.rest_seconds, squat.rest_max_seconds) == (60, 120)


def test_flags_what_needs_review() -> None:
    days = read(PLAN_REPLY).days
    warnings = {e.name: e.warnings for d in days for e in d.exercises if e.warnings}

    # The warm-up treadmill has no sets and isn't flagged for it.
    assert warnings == {
        "Cadeira Extensora": [W.TECHNIQUE_SETS],
        "Crucifixo Inferior com a Polia Alta": [W.TECHNIQUE_SETS],
        "Abdômen Remador + Prancha Abdominal Isométrica": [W.COMBINED_EXERCISE],
        "Remada Articulada Máquina": [W.ALTERNATIVE_EXERCISE],
        "Movimento Desconhecido": [W.UNKNOWN_MUSCLE_GROUP],
    }


@pytest.mark.parametrize(
    ("fields", "expected"),
    [
        ({"name": "  Supino \n Reto  "}, {"name": "Supino Reto"}),
        ({"name": "S" * 200}, {"name": "S" * 119 + "…"}),
        ({"muscle_group": " Chest "}, {"muscle_group": G.CHEST}),
        ({"muscle_group": "legs"}, {"muscle_group": None, "warnings": [W.UNKNOWN_MUSCLE_GROUP]}),
        ({"sets": "4"}, {"sets": 4}),
        ({"sets": 0}, {"sets": None, "warnings": [W.NO_SETS]}),
        ({"sets": 80}, {"sets": 50}),
        ({"sets": None, "muscle_group": "warmup"}, {"sets": None, "warnings": []}),
        ({"sets": None, "muscle_group": "cardio"}, {"sets": None, "warnings": []}),
        ({"reps": 12}, {"reps": "12"}),
        ({"reps": "   "}, {"reps": None}),
        ({"reps": "x" * 40}, {"reps": "x" * 31 + "…"}),
        ({"rest_seconds": 90, "rest_max_seconds": 60},
         {"rest_seconds": 60, "rest_max_seconds": 90}),
        ({"rest_max_seconds": 90}, {"rest_seconds": 90, "rest_max_seconds": None}),
        ({"rest_seconds": 60, "rest_max_seconds": 60},
         {"rest_seconds": 60, "rest_max_seconds": None}),
        ({"rest_seconds": -5}, {"rest_seconds": None}),
        ({"rest_seconds": 9000}, {"rest_seconds": 3600}),
        ({"notes": "  "}, {"notes": None}),
        ({"flags": ["technique_sets", "made_up", "technique_sets"]},
         {"warnings": [W.TECHNIQUE_SETS]}),
    ],
)  # fmt: skip
def test_values_become_what_the_preview_accepts(
    fields: dict[str, Any], expected: dict[str, Any]
) -> None:
    parsed = read_exercise(**fields)

    assert {key: getattr(parsed, key) for key in expected} == expected


def test_exercises_without_a_name_are_dropped() -> None:
    plan = read({"days": [day(exercise(), exercise(name=" "), exercise(name=None))]})

    assert len(plan.days[0].exercises) == 1


def test_each_weekday_is_used_once() -> None:
    plan = read({"days": [day(exercise()), day(exercise()), day(exercise(), weekday=9)]})

    # The user assigns the repeated and the impossible day in the preview.
    assert [d.weekday for d in plan.days] == [0, None, None]


def test_rest_days_are_valid_and_never_training_days() -> None:
    plan = read({"rest_days": [0, 6, 8], "days": [day(exercise()), day(weekday=3)]})

    assert plan.rest_days == [3, 6]


def test_dates_that_are_not_iso_are_dropped() -> None:
    assert read({"valid_until": "15/04/2024", "days": [day(exercise())]}).valid_until is None


@pytest.mark.parametrize(
    "reply",
    [
        {"is_workout_plan": False, "days": [day(exercise())]},
        {"days": []},
        {"days": [day()]},
        {"days": [day(exercise(name=""))]},
    ],
)
def test_no_training_days_is_not_a_workout_plan(reply: dict[str, Any]) -> None:
    with pytest.raises(NoWorkoutStructureError):
        read(reply)


def test_a_reply_is_cut_to_what_a_plan_can_hold() -> None:
    sheets = [day(*[exercise()] * (MAX_EXERCISES + 5), weekday=None) for _ in range(MAX_DAYS + 3)]

    plan = read({"is_workout_plan": True, "days": sheets})

    assert len(plan.days) == MAX_DAYS
    assert {len(sheet.exercises) for sheet in plan.days} == {MAX_EXERCISES}
