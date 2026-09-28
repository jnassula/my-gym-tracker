"""Live regression tests: the real LLM reads the real sample plans in ``samples/``.

Opt-in, because they call the paid API and take minutes: ``LLM_LIVE_TESTS=1 pytest -m llm``.
They also skip without the PDFs (personal, never committed; compose mounts them at /samples)
or without ``LLM_API_KEY``. The scripted-model tests in ``test_agent.py`` run everywhere.
"""

import asyncio
import os
from collections.abc import AsyncIterator
from datetime import date
from pathlib import Path

import pytest

from app.core.config import get_settings
from app.exercises.models import MuscleGroup as G
from app.workouts.parser import ParsedPlan, extract_text
from app.workouts.parser import ParseWarning as W
from app.workouts.parser.agent import AgentPlanParser, build_plan_parser, llm_client
from tests.conftest import LLM_API_KEY

SAMPLES = Path(__file__).resolve().parents[3] / "samples"
PDFS = sorted(SAMPLES.glob("*.pdf"))

pytestmark = [
    pytest.mark.llm,
    pytest.mark.skipif(os.environ.get("LLM_LIVE_TESTS") != "1", reason="set LLM_LIVE_TESTS=1"),
    pytest.mark.skipif(not PDFS, reason="no sample PDFs in samples/"),
    pytest.mark.skipif(not LLM_API_KEY, reason="LLM_API_KEY is not set"),
]

_readings: dict[Path, ParsedPlan] = {}


@pytest.fixture(scope="module")
async def parser() -> AsyncIterator[AgentPlanParser]:
    settings = get_settings()
    client = llm_client(settings, LLM_API_KEY)
    yield build_plan_parser(settings, client)
    await client.close()


def _text(path: Path) -> str:
    return extract_text(path.read_bytes())


async def read(parser: AgentPlanParser, path: Path) -> ParsedPlan:
    """Each sample is sent once per run, however many tests look at it."""
    if path not in _readings:
        _readings[path] = await parser.parse(await asyncio.to_thread(_text, path))
    return _readings[path]


def _sample(number: str) -> Path:
    matches = [p for p in PDFS if f" {number}" in p.name]
    if not matches:
        pytest.skip(f"sample {number} not available")
    return matches[0]


async def test_plan_01_matches_the_design(parser: AgentPlanParser) -> None:
    plan = await read(parser, _sample("01"))

    assert plan.title == "Periodização de Treino 01"
    assert plan.valid_until == date(2024, 4, 15)
    # Six training days; Thursday is the rest day.
    assert [day.weekday for day in plan.days] == [0, 1, 2, 4, 5, 6]
    focus = ["Quadriceps", "Peitoral", "remadas", "Bíceps", "Membros Inferiores", "puxadas"]
    assert [word in day.label for word, day in zip(focus, plan.days, strict=True)] == [True] * 6
    tuesday = plan.days[1].exercises
    # Warm-up first (treadmill and rotator cuff), then the main work.
    assert [e.muscle_group for e in tuesday[:2]] == [G.WARMUP, G.WARMUP]
    dumbbell_press = next(e for e in tuesday if e.name == "Supino Inclinado com Halteres")
    assert (dumbbell_press.muscle_group, dumbbell_press.sets, dumbbell_press.reps) == (
        G.CHEST,
        3,
        "8-10",
    )


@pytest.mark.parametrize("path", PDFS, ids=[p.name for p in PDFS])
async def test_every_sample_reads_cleanly(parser: AgentPlanParser, path: Path) -> None:
    plan = await read(parser, path)
    exercises = [e for day in plan.days for e in day.exercises]

    assert len(plan.days) >= 4
    assert all(day.weekday is not None for day in plan.days)
    assert all(day.label for day in plan.days)
    assert all(len(day.exercises) >= 5 for day in plan.days)
    assert not [e.name for e in exercises if e.muscle_group is None]
    # A couple of prescriptions have typos ("3xz10"); the rest must come with sets.
    assert len([e for e in exercises if W.NO_SETS in e.warnings]) <= 2
