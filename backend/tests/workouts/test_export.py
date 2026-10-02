"""Exporting a plan as a PDF in the trainer's format, readable by the import again."""

import os
import re
from datetime import date
from typing import Any

import pytest
from httpx import AsyncClient

from app.core.config import get_settings
from app.users.models import Language
from app.workouts.export import WORDING, format_rest, sets_text
from app.workouts.parser import extract_text
from app.workouts.parser.agent import build_plan_parser, llm_client
from app.workouts.service import export_filename
from tests.conftest import LLM_API_KEY
from tests.training import Gym, open_gym


def squeeze(text: str) -> str:
    """Layout mode pads the text to its position on the page; one space is enough here."""
    return re.sub(r"\s+", " ", text)


def test_sets_are_written_as_the_trainer_writes_them() -> None:
    assert sets_text(3, "12") == "3x12"
    assert sets_text(3, "8-12") == "3x8-12"
    assert sets_text(4, "15/12/10/8") == "1x15, 1x12, 1x10, 1x8"
    assert sets_text(3, "15/12") == "1x15, 1x12, 1x12"
    assert sets_text(None, "30 min") == "30 min"
    assert sets_text(3, None) == "3x"
    assert sets_text(None, None) == ""


def test_rest_reads_like_the_trainers_column() -> None:
    pt, en, es = WORDING[Language.PT], WORDING[Language.EN], WORDING[Language.ES]
    assert format_rest(90, pt) == "1 min e 30 seg"
    assert format_rest(120, pt) == "2 min"
    assert format_rest(45, pt) == "45 seg"
    assert format_rest(0, pt) == "0 seg"
    assert format_rest(90, en) == "1 min 30 s"
    assert format_rest(75, es) == "1 min y 15 seg"


def test_the_file_name_is_safe_everywhere() -> None:
    assert (
        export_filename("Full body 3\u00d7 semana") == "Full body 3 semana.pdf"
    )  # the multiplication sign goes
    assert export_filename("Treino 01 / Hipertrofia: fase A") == "Treino 01  Hipertrofia fase A.pdf"
    assert export_filename("***") == "treino.pdf"
    assert len(export_filename("x" * 200)) == 84


async def test_the_pdf_holds_the_plan_as_text(gym: Gym) -> None:
    await gym.log("1/0", 50, 12)
    await gym.log("1/0", 52.5, 10)

    response = await gym.client.get(
        f"/api/workouts/{gym.plan['id']}/export.pdf",
        params={"weights": "true"},
        headers=gym.headers,
    )

    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["content-disposition"] == "attachment; filename*=UTF-8''Treino%2001.pdf"
    assert response.content.startswith(b"%PDF-")
    text = squeeze(extract_text(response.content))
    assert "Treino 01" in text
    assert "Aluno: Atleta" in text
    assert "Segunda Feira - Quadríceps e Glúteos" in text
    assert "Aquecimento" in text
    assert "Esteira" in text
    assert "30 min" in text
    assert "Cadeira Extensora" in text
    assert "2x20" in text
    assert "3x12" in text
    assert "Agachamento Livre" in text
    assert "2x8-12" in text
    assert "Quarta Feira - Costas" in text
    # The last weight goes next to the sets, never into the name.
    assert "Remada Curvada" in text
    assert "3x12 (52.5 kg)" in text
    assert "Cargas: a última registada" in text


async def test_without_weights_and_in_the_users_language(client: AsyncClient) -> None:
    plan: dict[str, Any] = {
        "name": "Push",
        "valid_until": "2026-12-15",
        "days": [
            {"weekday": None, "label": "", "exercises": [
                {"name": "Bench press", "muscle_group": "chest", "sets": 3, "reps": "10",
                 "rest_seconds": 60, "rest_max_seconds": 120, "notes": "Drop set"},
            ]},
        ],
    }  # fmt: skip
    gym = await open_gym(client, "en@example.pt", plan)
    await client.patch("/api/users/me", json={"language": "en"}, headers=gym.headers)

    response = await client.get(f"/api/workouts/{gym.plan['id']}/export.pdf", headers=gym.headers)

    text = squeeze(extract_text(response.content))
    assert "Workout A" in text
    assert "Athlete: Atleta" in text
    assert "Replace by: 15/12/2026" in text
    assert "Bench press" in text
    assert "Drop set" in text
    assert "1 min to 2 min" in text
    assert "kg" not in text


async def test_another_users_plan_is_not_exported(client: AsyncClient) -> None:
    gym = await open_gym(client)
    other = await open_gym(client, "outro@example.pt")

    response = await client.get(f"/api/workouts/{gym.plan['id']}/export.pdf", headers=other.headers)

    assert response.status_code == 404
    assert response.json()["code"] == "plan_not_found"


@pytest.mark.llm
@pytest.mark.skipif(os.environ.get("LLM_LIVE_TESTS") != "1", reason="set LLM_LIVE_TESTS=1")
@pytest.mark.skipif(not LLM_API_KEY, reason="LLM_API_KEY is not set")
async def test_the_llm_reads_an_exported_plan_back(gym: Gym) -> None:
    """The cycle closes: what the app writes, the import reads without losses."""
    response = await gym.client.get(
        f"/api/workouts/{gym.plan['id']}/export.pdf", headers=gym.headers
    )
    settings = get_settings()
    llm = llm_client(settings, LLM_API_KEY)
    try:
        parsed = await build_plan_parser(settings, llm).parse(extract_text(response.content))
    finally:
        await llm.close()

    assert parsed.title == "Treino 01"
    assert [day.weekday for day in parsed.days] == [0, 2]
    monday, wednesday = parsed.days
    assert [(e.name, e.muscle_group, e.sets, e.reps) for e in monday.exercises] == [
        ("Esteira", "warmup", None, "30 min"),
        ("Cadeira Extensora", "warmup", 2, "20"),
        ("Cadeira Extensora", "quads", 3, "12"),
        ("Agachamento Livre", "quads", 2, "8-12"),
    ]
    assert [(e.name, e.sets, e.reps) for e in wednesday.exercises] == [("Remada Curvada", 3, "12")]
    assert parsed.valid_until is None or parsed.valid_until == date(2026, 12, 15)
