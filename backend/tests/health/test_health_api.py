from typing import Any

import pytest
from httpx import AsyncClient

from tests.helpers import signup
from tests.training import Clock, Gym


async def test_not_connected_at_first(client: AsyncClient) -> None:
    headers = await signup(client)

    body = (await client.get("/api/health", headers=headers)).json()

    assert body == {
        "connected": False,
        "last_sync_at": None,
        "settings": {"heart_rate": True, "calories": True, "body": True},
        "week_sessions": 0,
        "week_synced": 0,
    }


async def test_connecting_gives_the_shortcut_a_token(client: AsyncClient) -> None:
    headers = await signup(client)

    response = await client.post("/api/health/connection", headers=headers)

    assert response.status_code == 201
    assert response.json()["token"].startswith("mgt_")
    assert (await client.get("/api/health", headers=headers)).json()["connected"] is True


async def test_settings_need_a_connection(client: AsyncClient) -> None:
    headers = await signup(client)

    response = await client.patch("/api/health/settings", json={"calories": False}, headers=headers)

    assert (response.status_code, response.json()["code"]) == (404, "health_not_connected")


async def test_settings_can_be_changed(client: AsyncClient) -> None:
    headers = await signup(client)
    await client.post("/api/health/connection", headers=headers)

    response = await client.patch("/api/health/settings", json={"calories": False}, headers=headers)

    assert response.json() == {"heart_rate": True, "calories": False, "body": True}
    body = (await client.get("/api/health", headers=headers)).json()
    assert body["settings"]["calories"] is False


@pytest.mark.parametrize("body", [{}, {"heart_rate": None}])
async def test_settings_are_validated(client: AsyncClient, body: dict[str, Any]) -> None:
    headers = await signup(client)
    await client.post("/api/health/connection", headers=headers)

    response = await client.patch("/api/health/settings", json=body, headers=headers)

    assert response.status_code == 422


async def test_disconnecting(client: AsyncClient) -> None:
    headers = await signup(client)
    await client.post("/api/health/connection", headers=headers)

    response = await client.delete("/api/health/connection", headers=headers)

    assert response.status_code == 204
    assert (await client.get("/api/health", headers=headers)).json()["connected"] is False


@pytest.mark.parametrize(
    ("method", "path"),
    [("GET", "/api/health"), ("POST", "/api/health/connection"),
     ("DELETE", "/api/health/connection"), ("PATCH", "/api/health/settings")],
)  # fmt: skip
async def test_the_screen_needs_a_session(client: AsyncClient, method: str, path: str) -> None:
    assert (await client.request(method, path)).status_code == 401


# --- a session's detail --------------------------------------------------------------------------


async def test_a_session_without_watch_data(gym: Gym, clock: Clock) -> None:
    await gym.log("0/1", 20, 20)  # warm-up
    clock.advance(minutes=3)
    session = await gym.log("0/2", 45, 12)
    clock.advance(minutes=2)
    await gym.log("0/2", 50, 10)

    detail = await gym.get(f"/api/progress/sessions/{session['id']}")

    assert (detail["label"], detail["sets"], detail["volume"], detail["duration_seconds"]) == (
        "Quadríceps e Glúteos",
        2,
        1040.0,
        300,
    )
    assert [(e["name"], e["sets"], e["top_weight"]) for e in detail["exercises"]] == [
        ("Cadeira Extensora", 1, 20.0),
        ("Cadeira Extensora", 2, 50.0),
    ]
    assert detail["health"] is None
    assert detail["exercises"][1]["peak_heart_rate"] is None


async def test_another_users_session_is_not_found(gym: Gym, client: AsyncClient) -> None:
    session = await gym.log("0/2", 45, 12)
    other = await signup(client, "outra@example.pt")

    response = await client.get(f"/api/progress/sessions/{session['id']}", headers=other)

    assert (response.status_code, response.json()["code"]) == (404, "session_not_found")
