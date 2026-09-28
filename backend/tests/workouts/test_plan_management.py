"""Imported PDFs: rename, make active, view the PDF, delete (keeping the logged weights)."""

from typing import Any

import pytest
from httpx import AsyncClient

from tests.conftest import MemoryStorage
from tests.helpers import signup
from tests.training import PLAN, Clock
from tests.workouts.test_import_api import plan_body, upload


async def imported(
    client: AsyncClient, headers: dict[str, str], **overrides: Any
) -> dict[str, Any]:
    """Import the layout PDF and confirm it as a plan."""
    preview = (await upload(client, headers)).json()
    response = await client.post(
        "/api/workouts", json=plan_body(preview, **overrides), headers=headers
    )
    assert response.status_code == 201, response.text
    result: dict[str, Any] = response.json()
    return result


async def test_the_list_shows_each_plans_pdf(client: AsyncClient) -> None:
    headers = await signup(client)
    plan = await imported(client, headers)

    [summary] = (await client.get("/api/workouts", headers=headers)).json()

    assert summary["id"] == plan["id"]
    assert summary["day_count"] == 3
    assert summary["source_file"]["filename"] == "Treino 07.pdf"
    assert summary["source_file"]["size_bytes"] > 0


async def test_rename_and_activate(client: AsyncClient) -> None:
    headers = await signup(client)
    first = await imported(client, headers)
    second = await imported(client, headers, name="Hipertrofia")  # the new one is active

    renamed = await client.patch(
        f"/api/workouts/{first['id']}", json={"name": "Treino 01"}, headers=headers
    )
    activated = await client.patch(
        f"/api/workouts/{first['id']}", json={"is_active": True}, headers=headers
    )

    assert renamed.json()["name"] == "Treino 01"
    assert activated.json()["is_active"] is True
    plans = {
        p["id"]: p["is_active"] for p in (await client.get("/api/workouts", headers=headers)).json()
    }
    assert plans == {first["id"]: True, second["id"]: False}

    none_active = await client.patch(
        f"/api/workouts/{first['id']}", json={"is_active": False}, headers=headers
    )
    assert none_active.json()["is_active"] is False


@pytest.mark.parametrize("body", [{}, {"name": "  "}, {"is_active": None}, {"name": None}])
async def test_plan_updates_are_validated(client: AsyncClient, body: dict[str, Any]) -> None:
    headers = await signup(client)
    plan = await imported(client, headers)

    response = await client.patch(f"/api/workouts/{plan['id']}", json=body, headers=headers)

    assert response.status_code == 422


async def test_the_pdf_can_be_viewed(client: AsyncClient) -> None:
    headers = await signup(client)
    plan = await imported(client, headers)

    response = await client.get(f"/api/files/{plan['source_file_id']}/content", headers=headers)

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["content-disposition"] == (
        "inline; filename=\"Treino 07.pdf\"; filename*=UTF-8''Treino%2007.pdf"
    )
    assert response.content.startswith(b"%PDF")


async def test_deleting_a_plan_removes_its_pdf_but_keeps_the_history(
    client: AsyncClient, storage: MemoryStorage, clock: Clock
) -> None:
    headers = await signup(client)
    old = await imported(client, headers)
    extension = old["days"][0]["exercises"][2]  # "Cadeira Extensora", quads
    await client.post(
        f"/api/logs/exercises/{extension['id']}/sets",
        json={"weight": 45, "reps": 12},
        headers=headers,
    )
    clock.advance(days=7)

    response = await client.delete(f"/api/workouts/{old['id']}", headers=headers)

    assert response.status_code == 204
    assert storage.objects == {}
    assert (await client.get("/api/workouts", headers=headers)).json() == []
    gone = await client.get(f"/api/workouts/{old['id']}", headers=headers)
    assert (gone.status_code, gone.json()["code"]) == (404, "plan_not_found")
    # No more logging into it...
    blocked = await client.post(
        f"/api/logs/exercises/{extension['id']}/sets",
        json={"weight": 50, "reps": 10},
        headers=headers,
    )
    assert (blocked.status_code, blocked.json()["code"]) == (404, "exercise_not_found")
    # ...but its weights stay: in progress, and as last time for the same exercise in a new plan.
    progress = await client.get(f"/api/progress/exercises/{extension['id']}", headers=headers)
    assert [p["weight"] for p in progress.json()["points"]] == [45.0]
    new_day = (await client.post("/api/workouts", json=PLAN, headers=headers)).json()["days"][0]
    day_log = (await client.get(f"/api/logs/days/{new_day['id']}", headers=headers)).json()
    assert day_log["last"][new_day["exercises"][2]["id"]]["sets"] == [{"weight": 45.0, "reps": 12}]


async def test_deleting_the_active_plan_leaves_none_active(client: AsyncClient) -> None:
    headers = await signup(client)
    plan = await imported(client, headers)

    await client.delete(f"/api/workouts/{plan['id']}", headers=headers)
    replacement = await imported(client, headers, activate=False)

    assert (await client.get("/api/workouts", headers=headers)).json()[0]["id"] == replacement["id"]
    assert (await client.get("/api/workouts", headers=headers)).json()[0]["is_active"] is False


async def test_other_users_cannot_manage_my_plans(client: AsyncClient) -> None:
    alice = await signup(client, "alice@example.pt")
    bob = await signup(client, "bob@example.pt")
    plan = await imported(client, alice)

    attempts = [
        await client.patch(f"/api/workouts/{plan['id']}", json={"name": "x"}, headers=bob),
        await client.delete(f"/api/workouts/{plan['id']}", headers=bob),
        await client.get(f"/api/files/{plan['source_file_id']}/content", headers=bob),
    ]

    assert [r.status_code for r in attempts] == [404, 404, 404]
    assert (await client.get("/api/workouts", headers=alice)).json()[0]["name"] == plan["name"]
