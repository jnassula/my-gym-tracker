"""Weighings that come through the data sources: the scale's app writes them into the phone's
health app, and the bridge sends them with the watch's samples."""

from datetime import timedelta
from typing import Any

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.body.models import BodyMeasurement
from tests.health import test_health_connect_sync as android
from tests.health import test_sync_api as shortcut
from tests.health.test_sync_api import sync
from tests.training import MONDAY, Clock, Gym

# The morning's weighing, eleven hours before the clock's "now".
MORNING = -11 * 60


def weighings(body: dict[str, Any]) -> list[tuple[str, float, float | None]]:
    return [(m["source"], m["weight"], m["body_fat_pct"]) for m in body["measurements"]]


async def test_health_connect_sends_weight_and_body_fat(gym: Gym) -> None:
    payload = {
        "weight": [
            {"kilograms": 78.45, "time": android.utc(MORNING)},
            {"kilograms": 79.1, "time": android.utc(MORNING - 1440)},
        ],
        "body_fat": [{"percentage": 22.5, "time": android.utc(MORNING)}],
        "lean_body_mass": [{"kilograms": 60.8, "time": android.utc(MORNING)}],
    }

    result = await sync(gym, await android.connect(gym), payload)

    assert result == {"received": 0, "kept": 0, "sessions": 0, "weighings": 2}
    body = await gym.get("/api/body")
    assert weighings(body) == [("health_connect", 78.45, 22.5), ("health_connect", 79.1, None)]
    assert body["latest"]["measured_at"] == android.utc(MORNING)
    assert body["change"] == -0.65


async def test_the_shortcut_sends_them_in_the_health_apps_unit(gym: Gym) -> None:
    body = {
        "bm_t": [shortcut.at(MORNING), shortcut.at(MORNING - 1440)],
        "bm_v": ["172,95", "174.4"],
        "bm_u": "lb",
        # The Health app keeps body fat as a fraction.
        "bf_t": shortcut.at(MORNING),
        "bf_v": "0,225",
    }

    result = await sync(gym, await shortcut.connect(gym), body)

    assert result["weighings"] == 2
    assert weighings(await gym.get("/api/body")) == [
        ("apple_health", 78.45, 22.5),
        ("apple_health", 79.11, None),
    ]


async def test_a_shortcut_without_a_unit_is_in_kg_and_running_it_again_changes_nothing(
    gym: Gym, db_session: AsyncSession
) -> None:
    token = await shortcut.connect(gym)
    body = {"bm_t": [shortcut.at(MORNING)], "bm_v": ["78.45"], **shortcut.BATCH}

    await sync(gym, token, body)
    await sync(gym, token, body)

    assert weighings(await gym.get("/api/body")) == [("apple_health", 78.45, None)]
    assert await db_session.scalar(select(func.count()).select_from(BodyMeasurement)) == 1


async def test_a_weighing_already_read_from_the_scale_isnt_taken_twice(
    gym: Gym, clock: Clock
) -> None:
    # Weighed over Bluetooth here; the scale's app sends the same weighing later, through both
    # health apps, with its own clock and rounding.
    await gym.client.post(
        "/api/body/measurements",
        json={"source": "scale", "weight": 78.45, "impedance": 480},
        headers=gym.headers,
    )
    clock.advance(hours=2)
    seen = {"kilograms": 78.4, "time": android.utc(3)}
    another = {"kilograms": 78.9, "time": android.utc(-1440)}

    first = await sync(gym, await android.connect(gym), {"weight": [seen, another]})
    second = await sync(
        gym,
        await shortcut.connect(gym),
        {"bm_t": [shortcut.at(3), shortcut.at(-1440)], "bm_v": ["78.4", "78.9"]},
    )

    assert (first["weighings"], second["weighings"]) == (1, 0)
    assert weighings(await gym.get("/api/body")) == [
        ("scale", 78.45, None),
        ("health_connect", 78.9, None),
    ]


async def test_a_deleted_weighing_doesnt_come_back_with_the_next_run(gym: Gym) -> None:
    token = await shortcut.connect(gym)
    body = {"bm_t": [shortcut.at(MORNING)], "bm_v": ["78.45"]}
    await sync(gym, token, body)
    measurement = (await gym.get("/api/body"))["latest"]["id"]

    deleted = await gym.client.delete(f"/api/body/measurements/{measurement}", headers=gym.headers)
    again = await gym.client.delete(f"/api/body/measurements/{measurement}", headers=gym.headers)
    rerun = await sync(gym, token, body)  # the shortcut sends its last days on every run

    assert (deleted.status_code, again.status_code, rerun["weighings"]) == (204, 404, 0)
    assert (await gym.get("/api/body"))["latest"] is None
    # Nor through the other data source.
    await sync(
        gym,
        await android.connect(gym),
        {"weight": [{"kilograms": 78.45, "time": android.utc(MORNING)}]},
    )
    assert (await gym.get("/api/body"))["latest"] is None


async def test_the_switch_and_disconnecting_forget_that_sources_weighings(
    gym: Gym, db_session: AsyncSession
) -> None:
    apple = await shortcut.connect(gym)
    await sync(gym, apple, {"bm_t": [shortcut.at(MORNING)], "bm_v": ["78.45"]})
    await sync(
        gym,
        await android.connect(gym),
        {"weight": [{"kilograms": 79.3, "time": android.utc(MORNING - 2880)}]},
    )
    await gym.client.post("/api/body/measurements", json={"weight": 80}, headers=gym.headers)

    off = await gym.client.patch(
        "/api/health/connections/apple_health/settings", json={"body": False}, headers=gym.headers
    )

    assert off.json() == {"heart_rate": True, "calories": True, "body": False}
    assert weighings(await gym.get("/api/body")) == [
        ("manual", 80.0, None),
        ("health_connect", 79.3, None),
    ]
    # Off: what the shortcut sends of it is ignored.
    assert (await sync(gym, apple, {"bm_t": [shortcut.at(MORNING)], "bm_v": ["78.45"]}))[
        "weighings"
    ] == 0

    await gym.client.delete("/api/health/connections/health_connect", headers=gym.headers)

    assert weighings(await gym.get("/api/body")) == [("manual", 80.0, None)]
    assert await db_session.scalar(select(func.count()).select_from(BodyMeasurement)) == 1


async def test_what_makes_no_sense_is_dropped(gym: Gym) -> None:
    ahead = (MONDAY + timedelta(days=3)).isoformat().replace("+00:00", "Z")
    payload = {
        "weight": [
            {"kilograms": 4.2, "time": android.utc(MORNING)},  # the cat
            {"kilograms": 78.45, "time": ahead},  # a clock set wrong
            {"kilograms": 78.45, "time": android.utc(MORNING - 60)},
        ],
        "body_fat": [{"percentage": 99, "time": android.utc(MORNING - 60)}],
    }

    assert (await sync(gym, await android.connect(gym), payload))["weighings"] == 1
    assert weighings(await gym.get("/api/body")) == [("health_connect", 78.45, None)]


@pytest.mark.parametrize(
    "body",
    [
        {"bm_t": [shortcut.at(1)], "bm_v": ["78"], "bm_u": "pedras"},
        {"bm_t": [shortcut.at(1), shortcut.at(2)], "bm_v": ["78"]},
        {"bf_t": ["2026-09-28"], "bf_v": ["0.2"]},
    ],
)
async def test_a_badly_built_shortcut_is_told(gym: Gym, body: dict[str, Any]) -> None:
    response = await gym.client.post(
        "/api/health/sync", json=body, headers=await shortcut.connect(gym)
    )

    assert (response.status_code, response.json()["code"]) == (422, "validation_error")
    assert "pedras" not in response.text


async def test_the_app_itself_cant_claim_a_data_sources_weighing(gym: Gym) -> None:
    response = await gym.client.post(
        "/api/body/measurements", json={"source": "apple_health", "weight": 78}, headers=gym.headers
    )

    assert (response.status_code, response.json()["code"]) == (422, "validation_error")


async def test_years_of_weighings_arrive_in_one_run(gym: Gym, db_session: AsyncSession) -> None:
    """More rows than one statement takes: they are written in several."""
    count = 6_000
    payload = {
        "weight": [
            {"kilograms": 70 + n % 20, "time": android.utc(MORNING - 30 * n)} for n in range(count)
        ],
        "body_fat": [
            {"percentage": 20 + n % 10, "time": android.utc(MORNING - 30 * n)}
            for n in range(0, count, 2)
        ],
    }

    result = await sync(gym, await android.connect(gym), payload)

    assert result["weighings"] == count
    kept = select(func.count()).select_from(BodyMeasurement)
    assert await db_session.scalar(kept) == count
    with_fat = kept.where(BodyMeasurement.body_fat_pct.is_not(None))
    assert await db_session.scalar(with_fat) == count // 2
