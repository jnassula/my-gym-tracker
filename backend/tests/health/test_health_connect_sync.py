"""Health Connect's sync: what the HC Webhook app posts from Android, and what the app keeps."""

from datetime import timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.health import service
from app.health.models import HealthSample
from tests.health import test_sync_api as shortcut
from tests.health.test_sync_api import sync, train
from tests.helpers import signup
from tests.training import MONDAY, Clock, Gym

CONNECTION = "/api/health/connections/health_connect"


def utc(minutes: float) -> str:
    """An instant as the app writes it: java.time.Instant.toString()."""
    return (MONDAY + timedelta(minutes=minutes)).isoformat().replace("+00:00", "Z")


async def connect(gym: Gym) -> dict[str, str]:
    response = await gym.client.post(CONNECTION, headers=gym.headers)
    return {"Authorization": f"Bearer {response.json()['token']}"}


async def stored(db_session: AsyncSession) -> int:
    return await db_session.scalar(select(func.count()).select_from(HealthSample)) or 0


# The session of ``train`` runs from -5 to 9 minutes. Shaped as in the app's docs/webhook.md.
PAYLOAD: dict[str, Any] = {
    "timestamp": utc(6),
    "app_version": "1.9.22",
    "steps": [{"count": 900, "start_time": utc(-60), "end_time": utc(0)}],
    "heart_rate": [
        {"bpm": 110, "time": utc(-2)},
        {"bpm": 150, "time": utc(1)},
        # A sample resolution in minutes sends buckets: bpm is the average.
        {"time": utc(3), "avg": 160.4, "min": 151, "max": 171, "bpm": 160.4},
        {"bpm": 90, "time": utc(-600)},
    ],
    "active_calories": [
        {"calories": 30, "start_time": utc(0), "end_time": utc(6)},
        {"calories": 900, "start_time": utc(-1440), "end_time": utc(0)},  # the day's total
    ],
}


async def test_heart_rate_and_calories_inside_a_session_are_kept(gym: Gym, clock: Clock) -> None:
    session_id = await train(gym, clock)

    result = await sync(gym, await connect(gym), PAYLOAD)

    # Three heart rates in the session, one long before; six minutes of energy.
    assert result == {"received": 10, "kept": 9, "sessions": 1}
    health = (await gym.get(f"/api/progress/sessions/{session_id}"))["health"]
    assert (health["avg_heart_rate"], health["max_heart_rate"], health["calories"]) == (
        140,
        160,
        30,
    )


async def test_an_interval_counts_for_the_minutes_inside_the_session(
    gym: Gym, clock: Clock
) -> None:
    session_id = await train(gym, clock)
    energy = [{"calories": 50, "start_time": utc(5), "end_time": utc(15)}]

    await sync(gym, await connect(gym), {"active_calories": energy})

    # Minutes 5 to 9 of the ten.
    assert (await gym.get(f"/api/progress/sessions/{session_id}"))["health"]["calories"] == 25


async def test_a_sample_ahead_of_its_session_waits_for_it(
    gym: Gym, clock: Clock, db_session: AsyncSession
) -> None:
    session = await gym.log("0/2", 45, 12)  # the window ends 3 minutes after this set
    clock.advance(minutes=5)
    token = await connect(gym)

    # The app sends each sample once: what the window doesn't reach yet can't be dropped.
    result = await sync(gym, token, {"heart_rate": [{"bpm": 150, "time": utc(4.5)}]})

    assert result == {"received": 1, "kept": 0, "sessions": 0}
    assert (await gym.get(f"/api/progress/sessions/{session['id']}"))["health"] is None

    clock.advance(minutes=1)
    await gym.log("0/2", 50, 10)  # now the window reaches it
    await service.sweep(db_session)

    health = (await gym.get(f"/api/progress/sessions/{session['id']}"))["health"]
    assert health["max_heart_rate"] == 150


async def test_what_no_session_claims_is_deleted(
    gym: Gym, clock: Clock, db_session: AsyncSession
) -> None:
    await sync(gym, await connect(gym), {"heart_rate": [{"bpm": 72, "time": utc(-1)}]})
    assert await stored(db_session) == 1

    clock.advance(hours=2)
    await service.sweep(db_session)
    assert await stored(db_session) == 1  # a workout may still start

    clock.advance(hours=2)
    await service.sweep(db_session)
    assert await stored(db_session) == 0


async def test_the_shortcut_sends_again_so_nothing_of_it_waits(
    gym: Gym, clock: Clock, db_session: AsyncSession
) -> None:
    await train(gym, clock)

    await sync(gym, await shortcut.connect(gym), shortcut.BATCH)

    assert await stored(db_session) == 6


async def test_a_session_takes_each_kind_from_the_first_source_to_send_it(
    gym: Gym, clock: Clock
) -> None:
    session_id = await train(gym, clock)
    android = await connect(gym)
    await sync(gym, android, {"heart_rate": PAYLOAD["heart_rate"]})
    await sync(gym, await shortcut.connect(gym), shortcut.BATCH)

    # The same watch writes to both health apps: nothing is counted twice.
    assert (await sync(gym, android, PAYLOAD))["kept"] == 3

    health = (await gym.get(f"/api/progress/sessions/{session_id}"))["health"]
    # Health Connect's heart rate (the shortcut's 171 came second), the shortcut's 21 kcal
    # (Health Connect's 30 came second).
    assert (health["max_heart_rate"], health["calories"]) == (160, 21)


async def test_a_waiting_sample_doesnt_join_another_sources_session(
    gym: Gym, clock: Clock, db_session: AsyncSession
) -> None:
    session = await gym.log("0/2", 45, 12)
    clock.advance(minutes=5)
    await sync(gym, await connect(gym), {"heart_rate": [{"bpm": 150, "time": utc(4.5)}]})
    await sync(gym, await shortcut.connect(gym), {"hr_t": [shortcut.at(1)], "hr_v": ["140"]})
    clock.advance(minutes=1)
    await gym.log("0/2", 50, 10)

    await service.sweep(db_session)

    health = (await gym.get(f"/api/progress/sessions/{session['id']}"))["health"]
    assert health["max_heart_rate"] == 140


async def test_each_source_has_its_own_connection(gym: Gym, clock: Clock) -> None:
    session_id = await train(gym, clock)
    apple = await shortcut.connect(gym)
    android = await connect(gym)
    await sync(gym, apple, shortcut.BATCH)
    await sync(gym, android, PAYLOAD)

    status = await gym.get("/api/health/connections")

    assert [(c["provider"], c["connected"]) for c in status["connections"]] == [
        ("apple_health", True),
        ("health_connect", True),
    ]
    assert all(c["last_sync_at"] for c in status["connections"])
    assert (status["week_sessions"], status["week_synced"]) == (1, 1)

    await gym.client.delete(CONNECTION, headers=gym.headers)

    # Only Health Connect's token went: the shortcut's still works, and its samples are there.
    assert (await gym.client.post("/api/health/sync", json={}, headers=android)).status_code == 401
    assert await sync(gym, apple, {}) == {"received": 0, "kept": 0, "sessions": 0}
    health = (await gym.get(f"/api/progress/sessions/{session_id}"))["health"]
    assert (health["max_heart_rate"], health["calories"]) == (171, 21)


async def test_disconnecting_a_source_forgets_only_its_samples(gym: Gym, clock: Clock) -> None:
    session_id = await train(gym, clock)
    await sync(gym, await connect(gym), {"heart_rate": PAYLOAD["heart_rate"]})
    await sync(gym, await shortcut.connect(gym), shortcut.BATCH)

    await gym.client.delete("/api/health/connections/apple_health", headers=gym.headers)

    health = (await gym.get(f"/api/progress/sessions/{session_id}"))["health"]
    assert (health["max_heart_rate"], health["calories"]) == (160, None)


async def test_a_kind_turned_off_is_deleted_from_that_source_only(gym: Gym, clock: Clock) -> None:
    session_id = await train(gym, clock)
    await sync(gym, await connect(gym), {"heart_rate": PAYLOAD["heart_rate"]})
    await sync(gym, await shortcut.connect(gym), shortcut.BATCH)

    response = await gym.client.patch(
        f"{CONNECTION}/settings", json={"calories": False}, headers=gym.headers
    )

    assert response.json() == {"heart_rate": True, "calories": False}
    health = (await gym.get(f"/api/progress/sessions/{session_id}"))["health"]
    assert (health["max_heart_rate"], health["calories"]) == (160, 21)
    status = await gym.get("/api/health/connections")
    assert [c["settings"]["calories"] for c in status["connections"]] == [True, False]


async def test_nothing_to_send(gym: Gym) -> None:
    token = await connect(gym)
    envelope = {"timestamp": utc(0), "app_version": "1.9.22"}

    assert await sync(gym, token, {}) == {"received": 0, "kept": 0, "sessions": 0}
    assert await sync(gym, token, envelope) == {"received": 0, "kept": 0, "sessions": 0}


async def test_sensor_glitches_and_backwards_intervals_are_dropped(gym: Gym, clock: Clock) -> None:
    await train(gym, clock)
    body = {
        "heart_rate": [{"bpm": 0, "time": utc(1)}, {"bpm": 400, "time": utc(2)}],
        "active_calories": [{"calories": 10, "start_time": utc(3), "end_time": utc(1)}],
    }

    assert await sync(gym, await connect(gym), body) == {"received": 0, "kept": 0, "sessions": 0}


@pytest.mark.parametrize(
    "body",
    [
        {"heart_rate": [{"bpm": "cento e cinquenta", "time": utc(1)}]},
        {"heart_rate": [{"bpm": 150, "time": "2026-09-28T18:31:00"}]},  # no offset
        {"heart_rate": [{"bpm": 150}]},
        {"active_calories": [{"calories": 10, "start_time": utc(1)}]},
        {"heart_rate": "2026-09-28"},
    ],
)
async def test_a_payload_in_another_shape_is_refused(gym: Gym, body: dict[str, Any]) -> None:
    response = await gym.client.post("/api/health/sync", json=body, headers=await connect(gym))

    assert (response.status_code, response.json()["code"]) == (422, "validation_error")
    assert "cento" not in response.text
    assert "2026-09-28" not in response.text


async def test_the_screen_needs_a_session_and_a_known_source(client: AsyncClient) -> None:
    headers = await signup(client)

    for method, path in [
        ("GET", "/api/health/connections"),
        ("POST", CONNECTION),
        ("DELETE", CONNECTION),
        ("PATCH", f"{CONNECTION}/settings"),
    ]:
        assert (await client.request(method, path)).status_code == 401
    unknown = await client.post("/api/health/connections/garmin", headers=headers)
    assert (unknown.status_code, unknown.json()["code"]) == (422, "validation_error")
    missing = await client.patch(
        f"{CONNECTION}/settings", json={"calories": False}, headers=headers
    )
    assert (missing.status_code, missing.json()["code"]) == (404, "health_not_connected")
