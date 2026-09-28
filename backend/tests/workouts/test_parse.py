from datetime import date

import pytest

from app.exercises.models import MuscleGroup as G
from app.workouts.parser import (
    NoTextLayerError,
    NoWorkoutStructureError,
    UnreadablePdfError,
    parse_pdf,
)
from app.workouts.parser.parse import parse_plan, weekday_of
from app.workouts.parser.types import ParsedPlan
from app.workouts.parser.types import ParseWarning as W
from tests.workouts.layout import PLAN, blank_pdf, to_lines, to_pdf


def summary(
    plan: ParsedPlan,
) -> list[tuple[int, str, list[tuple[str, G | None, int | None, str | None]]]]:
    return [
        (day.weekday, day.label, [(e.name, e.muscle_group, e.sets, e.reps) for e in day.exercises])
        for day in plan.days
    ]


EXPECTED_DAYS = [
    (0, "Quadriceps e Glúteos", [
        ("Esteira", G.WARMUP, None, "30 min"),
        ("Cadeira Extensora", G.WARMUP, 2, "20"),
        ("Cadeira Extensora", G.QUADS, 3, "12"),
        ("Agachamento Livre", G.QUADS, 3, "15/8-12"),
        ("Cadeira Extensora", G.QUADS, 2, "Rest Pause"),
    ]),
    (1, "Peitoral, Ombros, Abdômen e Panturrilhas", [
        ("Rotação Externa no CrossOver", G.WARMUP, 2, "15"),
        ("Supino Inclinado (Progressão de Cargas)", G.CHEST, 4, "15/12/10/6-8"),
        ("Crucifixo Inferior com a Polia Alta", G.CHEST, 3, "12"),
        ("Abdômen Remador + Prancha Abdominal Isométrica", G.ABS, 3, "falha"),
        ("Panturrilha Sentada", G.CALVES, 4, "12"),
    ]),
    (4, "Costas (ênfase em remadas)", [
        ("Remada Articulada Máquina", G.BACK, 3, "12"),
        ("Graviton", G.BACK, 3, "12"),
        ("Movimento Desconhecido", None, 3, "10"),
    ]),
]  # fmt: skip


def test_parses_the_template_layout() -> None:
    plan = parse_plan(to_lines(PLAN))

    assert plan.title == "Periodização de Treino 07"
    assert plan.valid_until == date(2026, 4, 15)
    assert plan.rest_days == [2]
    assert summary(plan) == EXPECTED_DAYS


def test_rest_column_and_ranges() -> None:
    monday = parse_plan(to_lines(PLAN)).days[0].exercises

    assert [(e.rest_seconds, e.rest_max_seconds) for e in monday] == [
        (None, None),  # warm-up has no rest
        (None, None),
        (80, None),
        (60, 120),
        (60, 120),
    ]


def test_flags_what_needs_review() -> None:
    days = parse_plan(to_lines(PLAN)).days
    warnings = {e.name: e.warnings for day in days for e in day.exercises if e.warnings}

    assert warnings == {
        "Cadeira Extensora": [W.TECHNIQUE_SETS],
        "Crucifixo Inferior com a Polia Alta": [W.TECHNIQUE_SETS],
        "Abdômen Remador + Prancha Abdominal Isométrica": [W.COMBINED_EXERCISE],
        "Remada Articulada Máquina": [W.ALTERNATIVE_EXERCISE],
        "Movimento Desconhecido": [W.UNKNOWN_MUSCLE_GROUP],
    }


def test_wrapped_lines_join_the_previous_exercise() -> None:
    calves = parse_plan(to_lines(PLAN)).days[1].exercises[-1]

    assert calves.notes == "4x12 Rm + 20 segundos de alongamento no final de cada série"
    assert calves.rest_seconds == 45


def test_works_without_a_summary_or_rest_column() -> None:
    rows = [row for row in PLAN[7:] if row[0][1] != "Tempo de intervalo"]
    rows = [[chunk for chunk in row if chunk[0] < 690] for row in rows]

    plan = parse_plan(to_lines(rows))

    assert [day.weekday for day in plan.days] == [0, 1, 4]
    assert all(day.label == "" for day in plan.days)


@pytest.mark.parametrize(
    ("text", "weekday"),
    [("Segunda Feira", 0), ("Terça-feira", 1), ("QUARTA FEIRA", 2), ("Sábado", 5),
     ("Domingo", 6), ("Segunda Feira Terça Feira", None), ("Feira", None)],
)  # fmt: skip
def test_weekday_of(text: str, weekday: int | None) -> None:
    assert weekday_of(text) == weekday


# --- through a real PDF ---------------------------------------------------------------------


def test_parse_pdf_reads_a_real_pdf_file() -> None:
    plan = parse_pdf(to_pdf(PLAN))

    assert summary(plan) == EXPECTED_DAYS
    assert plan.valid_until == date(2026, 4, 15)


def test_scanned_pdf_has_no_text_layer() -> None:
    with pytest.raises(NoTextLayerError):
        parse_pdf(blank_pdf())


def test_text_without_workout_structure() -> None:
    with pytest.raises(NoWorkoutStructureError):
        parse_pdf(to_pdf([[(20, "Fatura n.º 123")], [(20, "Total 10,00 EUR")]]))


@pytest.mark.parametrize("data", [b"", b"not a pdf at all", b"%PDF-1.4\n garbage"])
def test_garbage_is_unreadable(data: bytes) -> None:
    with pytest.raises(UnreadablePdfError):
        parse_pdf(data)
