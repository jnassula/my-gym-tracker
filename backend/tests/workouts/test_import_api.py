import io
from typing import Any

import pdfplumber
import pytest
from httpx import AsyncClient, Response
from PIL import Image

from app.workouts import service
from app.workouts.parser import NoWorkoutStructureError, ParserUnavailableError, images
from tests.conftest import FakePlanParser, MemoryStorage
from tests.helpers import signup
from tests.workouts.layout import PLAN, PLAN_REPLY, blank_pdf, to_pdf


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
        (b"%PDF-1.4 broken", 422, "pdf_unreadable"),
        (b"\xff\xd8\xff not really a jpeg", 422, "image_unreadable"),
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
    assert plan_parser.images == []
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


# --- photos of printed sheets ----------------------------------------------------------------


def photo(width: int = 1200, height: int = 1600, *, fmt: str = "JPEG") -> bytes:
    """A picture the size of a phone photo (the content doesn't matter to the fake parser)."""
    out = io.BytesIO()
    Image.new("RGB", (width, height), (240, 200, 230)).save(out, fmt)
    return out.getvalue()


SHEETS_REPLY: dict[str, Any] = {
    "is_workout_plan": True,
    "title": "Academia Maravilhosas",
    "valid_until": "2026-11-02",
    "rest_days": [],
    "days": [
        {"weekday": None, "label": "Treino A", "exercises": [
            {"name": "LEG PRESS", "muscle_group": "quads", "sets": 4, "reps": "10",
             "rest_seconds": 60},
        ]},
        {"weekday": None, "label": "Treino E", "exercises": [
            {"name": "STIFF", "muscle_group": "hamstrings", "sets": 4, "reps": "10",
             "rest_seconds": 60},
        ]},
    ],
}  # fmt: skip


async def upload_photos(
    client: AsyncClient, headers: dict[str, str], *photos: tuple[str, bytes, str]
) -> Response:
    files = [("files", (name, data, media_type)) for name, data, media_type in photos]
    return await client.post("/api/workouts/import", files=files, headers=headers)


async def test_photos_are_read_as_images_and_kept_as_one_pdf(
    client: AsyncClient, storage: MemoryStorage, plan_parser: FakePlanParser
) -> None:
    headers = await signup(client)
    plan_parser.reply = SHEETS_REPLY

    response = await upload_photos(
        client,
        headers,
        ("IMG_0001.jpeg", photo(), "image/jpeg"),
        ("IMG_0002.png", photo(1600, 1200, fmt="PNG"), "image/png"),
    )

    assert response.status_code == 200, response.text
    # The LLM got the photos, upright and scaled, not the PDF's text.
    assert plan_parser.texts == []
    [images] = plan_parser.images
    assert len(images) == 2
    for image in images:
        with Image.open(io.BytesIO(image)) as sent:
            assert sent.format == "JPEG"
            assert max(sent.size) <= 1600
    preview = response.json()
    assert preview["name"] == "Academia Maravilhosas"
    assert preview["filename"] == "IMG_0001.pdf"
    assert [day["label"] for day in preview["days"]] == ["Treino A", "Treino E"]
    assert [day["weekday"] for day in preview["days"]] == [None, None]
    # The photos were bound into one PDF, a page each, and that is the plan's file.
    [(stored, content_type)] = storage.objects.values()
    assert stored.startswith(b"%PDF-")
    assert content_type == "application/pdf"
    content = await client.get(f"/api/files/{preview['file_id']}/content", headers=headers)
    assert content.headers["content-type"] == "application/pdf"
    assert len(pdfplumber.open(io.BytesIO(content.content)).pages) == 2


async def test_a_pdf_without_text_is_read_page_by_page_as_photos(
    client: AsyncClient, storage: MemoryStorage, plan_parser: FakePlanParser
) -> None:
    headers = await signup(client)
    plan_parser.reply = SHEETS_REPLY
    scanned = images.bind_pdf([photo(), photo()])

    response = await upload(client, headers, scanned, filename="ficha.pdf")

    assert response.status_code == 200, response.text
    [pages] = plan_parser.images
    assert len(pages) == 2
    with Image.open(io.BytesIO(pages[0])) as page:
        assert max(page.size) == 1600
    # The PDF itself is kept, as uploaded.
    assert response.json()["filename"] == "ficha.pdf"
    [(stored, _)] = storage.objects.values()
    assert stored == scanned


async def test_a_scan_with_nothing_on_it_is_still_sent_to_the_reader(
    client: AsyncClient, plan_parser: FakePlanParser
) -> None:
    """A page without a text layer is a photo now, not an error: the reader decides."""
    headers = await signup(client)
    plan_parser.error = NoWorkoutStructureError("blank")

    response = await upload(client, headers, blank_pdf())

    assert response.status_code == 422
    assert response.json()["code"] == "pdf_no_structure"
    assert len(plan_parser.images) == 1


async def test_photos_have_a_count_and_come_without_a_pdf(
    client: AsyncClient, plan_parser: FakePlanParser
) -> None:
    headers = await signup(client)

    too_many = await upload_photos(
        client, headers, *[(f"{i}.jpeg", photo(10, 10), "image/jpeg") for i in range(11)]
    )
    mixed = await upload_photos(
        client,
        headers,
        ("a.pdf", to_pdf(PLAN), "application/pdf"),
        ("b.jpeg", photo(10, 10), "image/jpeg"),
    )
    none = await client.post("/api/workouts/import", headers=headers)

    assert (too_many.status_code, too_many.json()["code"]) == (422, "too_many_files")
    assert (mixed.status_code, mixed.json()["code"]) == (422, "too_many_files")
    assert (none.status_code, none.json()["code"]) == (422, "no_files")
    assert plan_parser.images == []
    assert plan_parser.texts == []


async def test_the_single_file_field_still_works_for_older_apps(
    client: AsyncClient, plan_parser: FakePlanParser
) -> None:
    headers = await signup(client)

    response = await upload(client, headers)

    assert response.status_code == 200
    assert response.json()["name"] == PLAN_REPLY["title"].removeprefix("Periodização de ")
