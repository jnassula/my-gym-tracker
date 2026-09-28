from typing import Any

import pytest
from httpx import AsyncClient, Response

from app.workouts import service
from app.workouts.parser import NoWorkoutStructureError, ParserUnavailableError
from tests.conftest import FakePlanParser, MemoryStorage
from tests.helpers import signup
from tests.workouts.layout import PLAN, blank_pdf, to_pdf


async def upload(
    client: AsyncClient,
    headers: dict[str, str],
    data: bytes | None = None,
    filename: str = "Treino 07.pdf",
) -> Response:
    files = {"file": (filename, data if data is not None else to_pdf(PLAN), "application/pdf")}
    return await client.post("/api/workouts/import", files=files, headers=headers)


def plan_body(preview: dict[str, Any], **overrides: Any) -> dict[str, Any]:
    """Turn a preview into a PlanCreate body, as the client does after review."""
    days = [
        {
            "weekday": day["weekday"],
            "label": day["label"],
            "exercises": [
                {k: v for k, v in exercise.items() if k != "warnings"}
                for exercise in day["exercises"]
            ],
        }
        for day in preview["days"]
    ]
    return {
        "name": preview["name"],
        "source_file_id": preview["file_id"],
        "valid_until": preview["valid_until"],
        "days": days,
    } | overrides


# --- import (upload + read) ------------------------------------------------------------------


async def test_import_returns_the_parsed_structure_and_stores_the_pdf(
    client: AsyncClient, storage: MemoryStorage, plan_parser: FakePlanParser
) -> None:
    headers = await signup(client)

    response = await upload(client, headers)

    assert response.status_code == 200
    # The LLM got the PDF's text, not the file.
    [text] = plan_parser.texts
    assert "Cadeira Extensora 3x12 Rm (com 10 segundos de isometria)" in text
    preview = response.json()
    assert preview["name"] == "Treino 07"
    assert preview["filename"] == "Treino 07.pdf"
    assert preview["valid_until"] == "2026-04-15"
    assert preview["rest_days"] == [2]
    assert [day["weekday"] for day in preview["days"]] == [0, 1, 4]
    first = preview["days"][0]["exercises"][2]
    assert first == {
        "name": "Cadeira Extensora",
        "muscle_group": "quads",
        "sets": 3,
        "reps": "12",
        "rest_seconds": 80,
        "rest_max_seconds": None,
        "notes": "3x12 Rm (com 10 segundos de isometria)",
        "warnings": [],
    }
    [(key, (data, content_type))] = storage.objects.items()
    assert key.endswith(preview["file_id"])
    assert data.startswith(b"%PDF")
    assert content_type == "application/pdf"


async def test_import_requires_authentication(client: AsyncClient) -> None:
    assert (await upload(client, {})).status_code == 401


@pytest.mark.parametrize(
    ("data", "status", "code"),
    [
        (b"PK\x03\x04 this is a zip", 415, "unsupported_file_type"),
        (blank_pdf(), 422, "pdf_no_text"),
        (b"%PDF-1.4 broken", 422, "pdf_unreadable"),
    ],
)
async def test_import_rejects_files_before_calling_the_llm(
    client: AsyncClient,
    *,
    storage: MemoryStorage,
    plan_parser: FakePlanParser,
    data: bytes,
    status: int,
    code: str,
) -> None:
    headers = await signup(client)

    response = await upload(client, headers, data)

    assert response.status_code == status
    assert response.json()["code"] == code
    assert plan_parser.texts == []
    assert storage.objects == {}  # nothing is kept when the import fails


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (NoWorkoutStructureError("not a plan"), 422, "pdf_no_structure"),
        (ParserUnavailableError("APIConnectionError"), 503, "pdf_reader_unavailable"),
    ],
)
async def test_import_reports_what_the_llm_could_not_do(
    client: AsyncClient,
    *,
    storage: MemoryStorage,
    plan_parser: FakePlanParser,
    error: Exception,
    status: int,
    code: str,
) -> None:
    headers = await signup(client)
    plan_parser.error = error

    response = await upload(client, headers, to_pdf([[(20, "Fatura n.º 123")]]))

    assert response.status_code == status
    assert response.json()["code"] == code
    assert storage.objects == {}


async def test_import_rejects_files_over_the_limit(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    headers = await signup(client)
    monkeypatch.setattr(service, "MAX_PDF_BYTES", 1024)

    response = await upload(client, headers)

    assert response.status_code == 413
    assert response.json()["code"] == "file_too_large"


# --- confirm (create plan) ---------------------------------------------------------------


async def test_confirmed_preview_becomes_the_active_plan(client: AsyncClient) -> None:
    headers = await signup(client)
    preview = (await upload(client, headers)).json()
    body = plan_body(preview)
    # The user fixed the flagged exercise and renamed the plan in the preview.
    body["name"] = "Treino de Setembro"
    body["days"][2]["exercises"][2] |= {"name": "Máquina Nova", "muscle_group": "back"}

    response = await client.post("/api/workouts", json=body, headers=headers)

    assert response.status_code == 201
    plan = response.json()
    assert plan["name"] == "Treino de Setembro"
    assert plan["is_active"] is True
    assert plan["source_file_id"] == preview["file_id"]
    assert [(d["weekday"], d["position"], len(d["exercises"])) for d in plan["days"]] == [
        (0, 0, 5),
        (1, 1, 5),
        (4, 2, 3),
    ]
    friday = plan["days"][2]["exercises"]
    assert [(e["position"], e["name"], e["muscle_group"]) for e in friday] == [
        (0, "Remada Articulada Máquina", "back"),
        (1, "Graviton", "back"),
        (2, "Máquina Nova", "back"),
    ]


async def test_activating_a_plan_deactivates_the_previous_one(client: AsyncClient) -> None:
    headers = await signup(client)
    preview = (await upload(client, headers)).json()
    first = (await client.post("/api/workouts", json=plan_body(preview), headers=headers)).json()

    second_body = plan_body(preview, name="Novo plano", source_file_id=None)
    second = (await client.post("/api/workouts", json=second_body, headers=headers)).json()
    inactive_body = plan_body(preview, name="Rascunho", source_file_id=None, activate=False)
    await client.post("/api/workouts", json=inactive_body, headers=headers)

    plans = (await client.get("/api/workouts", headers=headers)).json()
    assert [(p["name"], p["is_active"]) for p in plans] == [
        ("Novo plano", True),
        ("Rascunho", False),
        ("Treino 07", False),
    ]
    assert plans[0]["id"] == second["id"]
    assert plans[2]["id"] == first["id"]
    assert plans[0]["weekdays"] == [0, 1, 4]
    assert plans[0]["exercise_count"] == 13


@pytest.mark.parametrize(
    "change",
    [
        {"days": []},
        {"name": "   "},
        {"days": [{"weekday": 0, "label": "", "exercises": []}]},
        {"days": [{"weekday": 7, "label": "", "exercises": [{"name": "Supino"}]}]},
        {"days": [{"weekday": 0, "exercises": [{"name": "A"}]},
                  {"weekday": 0, "exercises": [{"name": "B"}]}]},
        {"days": [{"weekday": 0, "exercises": [{"name": "A", "muscle_group": "legs"}]}]},
        {"days": [{"weekday": 0, "exercises": [{"name": "A", "rest_seconds": 90,
                                                 "rest_max_seconds": 60}]}]},
    ],
)  # fmt: skip
async def test_create_plan_validates_the_structure(
    client: AsyncClient, change: dict[str, Any]
) -> None:
    headers = await signup(client)
    body = {"name": "Plano", "days": [{"weekday": 0, "exercises": [{"name": "Supino"}]}]}

    response = await client.post("/api/workouts", json=body | change, headers=headers)

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


# --- isolation between users ------------------------------------------------------------


async def test_users_never_see_each_others_plans_or_files(client: AsyncClient) -> None:
    alice = await signup(client, "alice@example.pt")
    bob = await signup(client, "bob@example.pt")
    preview = (await upload(client, alice)).json()
    plan = (await client.post("/api/workouts", json=plan_body(preview), headers=alice)).json()

    assert (await client.get("/api/workouts", headers=bob)).json() == []
    stolen = await client.get(f"/api/workouts/{plan['id']}", headers=bob)
    assert stolen.status_code == 404
    assert stolen.json()["code"] == "plan_not_found"
    # Bob cannot attach Alice's file to his plan, nor delete it.
    borrowed = await client.post("/api/workouts", json=plan_body(preview), headers=bob)
    assert borrowed.status_code == 404
    assert borrowed.json()["code"] == "file_not_found"
    deleted = await client.delete(f"/api/files/{preview['file_id']}", headers=bob)
    assert deleted.status_code == 404


# --- files ----------------------------------------------------------------------------------


async def test_cancelling_an_import_deletes_the_upload(
    client: AsyncClient, storage: MemoryStorage
) -> None:
    headers = await signup(client)
    preview = (await upload(client, headers)).json()

    response = await client.delete(f"/api/files/{preview['file_id']}", headers=headers)

    assert response.status_code == 204
    assert storage.objects == {}
    again = await client.delete(f"/api/files/{preview['file_id']}", headers=headers)
    assert again.status_code == 404


async def test_deleting_the_pdf_keeps_the_plan(client: AsyncClient) -> None:
    headers = await signup(client)
    preview = (await upload(client, headers)).json()
    plan = (await client.post("/api/workouts", json=plan_body(preview), headers=headers)).json()

    await client.delete(f"/api/files/{preview['file_id']}", headers=headers)

    kept = (await client.get(f"/api/workouts/{plan['id']}", headers=headers)).json()
    assert kept["source_file_id"] is None
    assert len(kept["days"]) == 3
