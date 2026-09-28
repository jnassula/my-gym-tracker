"""Regression tests against the real sample plans in ``samples/``.

The PDFs are personal and not committed, so these tests skip when the files are missing
(e.g. in CI). The anonymised fixture in ``layout.py`` covers the same rules everywhere.
"""

from datetime import date
from pathlib import Path

import pytest

from app.exercises.models import MuscleGroup as G
from app.workouts.parser import parse_pdf
from app.workouts.parser.types import ParseWarning as W

SAMPLES = Path(__file__).resolve().parents[3] / "samples"
PDFS = sorted(SAMPLES.glob("*.pdf"))

pytestmark = pytest.mark.skipif(not PDFS, reason="no sample PDFs in samples/")


def _sample(number: str) -> Path:
    matches = [p for p in PDFS if f" {number}" in p.name]
    if not matches:
        pytest.skip(f"sample {number} not available")
    return matches[0]


def test_plan_01_matches_the_design() -> None:
    plan = parse_pdf(_sample("01").read_bytes())

    assert plan.title == "Periodização de Treino 01"
    assert plan.valid_until == date(2024, 4, 15)
    # Six training days; Thursday is the rest day.
    assert [day.weekday for day in plan.days] == [0, 1, 2, 4, 5, 6]
    assert [day.label for day in plan.days] == [
        "Quadriceps e Glúteos",
        "Peitoral, Ombros, Abdômen e Panturrilhas",
        "Costas (ênfase em remadas)",
        "Bíceps, Tríceps, Ombros e Abdômen",
        "Membros Inferiores Completo",
        "Costas (ênfase em puxadas), Ombros e Abdominais",
    ]
    tuesday = plan.days[1].exercises
    assert [(e.name, e.muscle_group, e.sets, e.reps) for e in tuesday[:4]] == [
        ("Esteira", G.WARMUP, None, "30 min"),
        ("Rotação Externa de Manguitto Rotador no CrossOver", G.WARMUP, 2, "15"),
        ("Supino Inclinado (Progressão de Cargas)", G.CHEST, 5, "15/12/10/8/6-8"),
        ("Supino Inclinado com Halteres", G.CHEST, 3, "8-10"),
    ]
    assert tuesday[2].rest_seconds == 90


@pytest.mark.parametrize("path", PDFS, ids=[p.name for p in PDFS])
def test_every_sample_parses_cleanly(path: Path) -> None:
    plan = parse_pdf(path.read_bytes())
    exercises = [e for day in plan.days for e in day.exercises]

    assert len(plan.days) >= 4
    assert all(day.label for day in plan.days)
    assert all(len(day.exercises) >= 5 for day in plan.days)
    # Every exercise lands in a muscle group, and at most one per plan needs manual sets.
    assert not [e.name for e in exercises if e.muscle_group is None]
    assert len([e for e in exercises if W.NO_SETS in e.warnings]) <= 1
