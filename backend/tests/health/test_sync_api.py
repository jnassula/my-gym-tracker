"""The iPhone shortcut's sync: what it posts (lists of text) and what the app keeps of it."""

from datetime import timedelta
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from httpx import AsyncClient

from tests.helpers import signup
from tests.training import MONDAY, Clock, Gym

LISBON = ZoneInfo("Europe/Lisbon")


def at(minutes: float) -> str:
    """An instant as the shortcut's Format Date (ISO 8601 with time) writes it."""
    return (MONDAY + timedelta(minutes=minutes)).astimezone(LISBON).isoformat()


async def connect(gym: Gym) -> dict[str, str]:
    response = await gym.client.post("/api/health/connection", headers=gym.headers)
    return {"Authorization": f"Bearer {response.json()['token']}"}


async def train(gym: Gym, clock: Clock) -> str:
    """Three sets at 0, 3 and 6 minutes: the session's window is -5 to 9 minutes."""
    session = await gym.log("0/2", 45, 12)
    clock.advance(minutes=3)
    await gym.log("0/2", 50, 10)
    clock.advance(minutes=3)
    await gym.log("0/3", 80, 8)
    return str(session["id"])


async def sync(gym: Gym, token: dict[str, str], body: dict[str, Any]) -> dict[str, Any]:
    response = await gym.client.post("/api/health/sync", json=body, headers=token)
    assert response.status_code == 200, response.text
    result: dict[str, Any] = response.json()
    return result


BATCH = {
    "hr_t": [at(-10), at(-2), at(1), at(3.25), at(6.25), at(30)],
    "hr_v": ["95", "110", "150", "160", "171", "90"],
    "ae_t": [at(1), at(4), at(40)],
    "ae_v": ["12.4", "8.3", "5"],
}


async def test_only_what_falls_in_a_session_is_kept(gym: Gym, clock: Clock) -> None:
    session_id = await train(gym, clock)
    token = await connect(gym)

    result = await sync(gym, token, BATCH)

    assert result == {"received": 9, "kept": 6, "sessions": 1, "weighings": 0}
    health = (await gym.get(f"/api/progress/sessions/{session_id}"))["health"]
    assert (health["avg_heart_rate"], health["max_heart_rate"], health["calories"]) == (
        148,
        171,
        21,
    )
    assert [p["bpm"] for p in health["heart_rate"]] == [110, 150, 160, 171]


async def test_each_exercise_gets_the_peak_around_its_sets(gym: Gym, clock: Clock) -> None:
    session_id = await train(gym, clock)
    await sync(gym, await connect(gym), BATCH)

    detail = await gym.get(f"/api/progress/sessions/{session_id}")

    assert [(e["name"], e["peak_heart_rate"]) for e in detail["exercises"]] == [
        ("Cadeira Extensora", 160),
        ("Agachamento Livre", 171),
    ]


async def test_sending_the_same_samples_again_changes_nothing(gym: Gym, clock: Clock) -> None:
    session_id = await train(gym, clock)
    token = await connect(gym)
    await sync(gym, token, BATCH)

    assert await sync(gym, token, BATCH) == {
        "received": 9,
        "kept": 6,
        "sessions": 1,
        "weighings": 0,
    }

    health = (await gym.get(f"/api/progress/sessions/{session_id}"))["health"]
    assert len(health["heart_rate"]) == 4
    status = await gym.get("/api/health")
    assert (status["week_sessions"], status["week_synced"]) == (1, 1)
    assert status["last_sync_at"] is not None


async def test_a_lone_sample_arrives_as_text_and_numbers_as_the_region_writes_them(
    gym: Gym, clock: Clock
) -> None:
    await train(gym, clock)

    result = await sync(
        gym, await connect(gym), {"hr_t": at(1), "hr_v": "150", "ae_t": [at(1)], "ae_v": ["12,4"]}
    )

    assert result == {"received": 2, "kept": 2, "sessions": 1, "weighings": 0}


async def test_lists_in_text_fields_arrive_one_per_line(gym: Gym, clock: Clock) -> None:
    await train(gym, clock)
    body = {key: "\n".join(values) for key, values in BATCH.items()}

    assert await sync(gym, await connect(gym), body) == {
        "received": 9,
        "kept": 6,
        "sessions": 1,
        "weighings": 0,
    }


async def test_nothing_to_send(gym: Gym) -> None:
    empty = {"hr_t": "", "hr_v": "", "ae_t": "", "ae_v": ""}

    assert await sync(gym, await connect(gym), {}) == {
        "received": 0,
        "kept": 0,
        "sessions": 0,
        "weighings": 0,
    }
    assert await sync(gym, await connect(gym), empty) == {
        "received": 0,
        "kept": 0,
        "sessions": 0,
        "weighings": 0,
    }


async def test_sensor_glitches_are_dropped(gym: Gym, clock: Clock) -> None:
    await train(gym, clock)

    result = await sync(gym, await connect(gym), {"hr_t": [at(1), at(2)], "hr_v": ["0", "400"]})

    assert result == {"received": 0, "kept": 0, "sessions": 0, "weighings": 0}


@pytest.mark.parametrize(
    "body",
    [
        {"hr_t": [at(1), at(2)], "hr_v": ["150"]},  # a date without its value
        {"hr_t": ["2026-09-28"], "hr_v": ["150"]},  # Format Date without the time
        {"hr_t": ["2026-09-28T18:31:00"], "hr_v": ["150"]},  # no offset
        {"hr_t": [at(1)], "hr_v": ["cento e cinquenta"]},
    ],
)
async def test_a_badly_built_shortcut_is_told(gym: Gym, body: dict[str, Any]) -> None:
    response = await gym.client.post("/api/health/sync", json=body, headers=await connect(gym))

    assert (response.status_code, response.json()["code"]) == (422, "validation_error")
    assert "cento" not in response.text
    assert "2026-09-28" not in response.text


async def test_any_content_type_is_read_as_json(gym: Gym, clock: Clock) -> None:
    await train(gym, clock)
    token = await connect(gym)

    response = await gym.client.post(
        "/api/health/sync",
        content=b'{"hr_t": "' + at(1).encode() + b'", "hr_v": "150"}',
        headers={**token, "Content-Type": "application/octet-stream"},
    )

    assert response.json()["kept"] == 1


async def test_the_sync_needs_the_current_token(gym: Gym) -> None:
    old = await connect(gym)
    new = await connect(gym)  # "Gerar novo código"

    for headers in ({}, {"Authorization": "Bearer mgt_wrong"}, old):
        response = await gym.client.post("/api/health/sync", json={}, headers=headers)
        assert (response.status_code, response.json()["code"]) == (401, "health_token_invalid")
    assert (await gym.client.post("/api/health/sync", json={}, headers=new)).status_code == 200


async def test_the_token_is_not_a_session(gym: Gym) -> None:
    token = await connect(gym)

    assert (await gym.client.get("/api/health", headers=token)).status_code == 401


async def test_kinds_turned_off_are_neither_kept_nor_left_behind(gym: Gym, clock: Clock) -> None:
    session_id = await train(gym, clock)
    token = await connect(gym)
    await sync(gym, token, BATCH)

    await gym.client.patch("/api/health/settings", json={"calories": False}, headers=gym.headers)

    health = (await gym.get(f"/api/progress/sessions/{session_id}"))["health"]
    assert (health["calories"], health["max_heart_rate"]) == (None, 171)
    assert (await sync(gym, token, BATCH))["received"] == 6


async def test_disconnecting_forgets_the_data_and_the_token(gym: Gym, clock: Clock) -> None:
    session_id = await train(gym, clock)
    token = await connect(gym)
    await sync(gym, token, BATCH)

    await gym.client.delete("/api/health/connection", headers=gym.headers)

    assert (await gym.get(f"/api/progress/sessions/{session_id}"))["health"] is None
    assert (await gym.client.post("/api/health/sync", json={}, headers=token)).status_code == 401


async def test_another_users_sessions_are_not_theirs(
    gym: Gym, clock: Clock, client: AsyncClient
) -> None:
    await train(gym, clock)
    other = await signup(client, "outra@example.pt")
    response = await client.post("/api/health/connection", headers=other)
    token = {"Authorization": f"Bearer {response.json()['token']}"}

    assert await sync(gym, token, BATCH) == {
        "received": 9,
        "kept": 0,
        "sessions": 0,
        "weighings": 0,
    }
