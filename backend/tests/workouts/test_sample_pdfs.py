"""Live regression tests: the real LLM reads the real sample plans in ``samples/``.

Opt-in, because they call the paid API and take minutes: ``LLM_LIVE_TESTS=1 pytest -m llm``.
They also skip without the PDFs (personal, never committed; compose mounts them at /samples)
or without ``LLM_API_KEY``. The scripted-model tests in ``test_agent.py`` run everywhere.
"""

import asyncio
import os
import unicodedata
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


# --- photos of printed sheets (samples/image.jpeg, image2.jpeg, Academia Maravilhosas.pdf) ----

PHOTOS = sorted(SAMPLES.glob("image*.jpeg"))
PHOTO_PDF = SAMPLES / "Academia Maravilhosas.pdf"


@pytest.mark.skipif(len(PHOTOS) < 2, reason="no sample photos in samples/")
async def test_the_llm_reads_photographed_gym_sheets(parser: AgentPlanParser) -> None:
    """Two photos of printed sheets (Treino E and Treino A): one day each, crossed-out lines
    left out, "20 PASSOS" kept as reps, "Validade" as the date."""
    from app.workouts.parser import images  # noqa: PLC0415

    prepared = [await asyncio.to_thread(images.prepare, p.read_bytes()) for p in PHOTOS]

    plan = await parser.parse_images(prepared)

    assert plan.valid_until == date(2026, 11, 2)
    assert [(day.weekday, day.label) for day in plan.days] == [
        (None, "Treino E"),
        (None, "Treino A"),
    ]
    sheet_e, sheet_a = plan.days
    names_e = [e.name.upper() for e in sheet_e.exercises]
    assert names_e == [
        "BANCO FLEXOR", "STIFF", "ROSCA FEM. EXTEN", "GOOD MORNING", "ABD PRANCHA", "ABD REMADOR",
    ]  # fmt: skip  # MESA FLEXORA is crossed out
    assert [(e.sets, e.reps, e.rest_seconds) for e in sheet_e.exercises[:4]] == [(4, "10", 60)] * 4
    assert (sheet_e.exercises[4].reps or "").lower().startswith("1 min")
    assert (sheet_e.exercises[5].sets, sheet_e.exercises[5].reps) == (3, "20")
    # The print is blurred under the pink light: "SUMÔ" may lose its accent.
    names_a = [
        unicodedata.normalize("NFD", e.name.upper()).encode("ascii", "ignore").decode()
        for e in sheet_a.exercises
    ]
    assert names_a == [
        "LEG PRESS", "AGACHA BAR GUIA", "PASSADA", "BANCO ADUTOR", "AGACHA SUMO KETT",
    ]  # fmt: skip  # BANCO EXTENSOR is crossed out
    assert (sheet_a.exercises[1].reps or "").lower() == "20 passos"
    assert [e.sets for e in sheet_a.exercises] == [4, 4, 4, 4, 4]


@pytest.mark.skipif(not PHOTO_PDF.exists(), reason="no sample photo PDF in samples/")
async def test_the_llm_reads_a_pdf_made_of_one_photo(parser: AgentPlanParser) -> None:
    from app.workouts.parser import images  # noqa: PLC0415

    pages = await asyncio.to_thread(images.pdf_pages, PHOTO_PDF.read_bytes(), max_pages=10)
    assert len(pages) == 1

    plan = await parser.parse_images(pages)

    # The gym's name is printed small at the top; the model takes it or the sheet's title.
    assert plan.title in ("Academia Maravilhosas", "Ficha de Treino")
    assert plan.valid_until == date(2026, 11, 2)
    [sheet] = plan.days
    assert (sheet.weekday, sheet.label) == (None, "Treino D")
    assert [e.name.upper() for e in sheet.exercises] == [
        "REMADA ART NEUTRA", "FPNA", "CRUCIFIXO INV PECK DECK NEUTRO", "REMADA UNI",
        "ABD INFRA ELEV PERNA",
    ]  # fmt: skip  # Pulley Supinada and REMADA BAIXA TRIANGULO are crossed out
    assert [(e.sets, e.reps) for e in sheet.exercises] == [(4, "10")] * 4 + [(3, "20")]
