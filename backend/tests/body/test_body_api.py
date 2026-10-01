from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.body.models import BodyMeasurement
from tests.helpers import signup
from tests.training import Clock, Gym

PROFILE = {"height_cm": 180, "birth_date": "1992-03-15", "sex": "male"}


async def weigh(gym: Gym, **body: Any) -> dict[str, Any]:
    response = await gym.client.post("/api/body/measurements", json=body, headers=gym.headers)
    assert response.status_code == 201, response.text
    result: dict[str, Any] = response.json()
    return result


async def test_nothing_weighed_yet(gym: Gym) -> None:
    assert await gym.get("/api/body") == {
        "latest": None,
        "range": "3m",
        "points": [],
        "change": None,
        "measurements": [],
        "profile_complete": False,
    }


async def test_a_weight_typed_in_today(gym: Gym, clock: Clock) -> None:
    measurement = await weigh(gym, weight=78.4)

    assert measurement == {
        "id": measurement["id"],
        "measured_at": "2026-09-28T17:30:00Z",
        "source": "manual",
        "weight": 78.4,
        "bmi": None,
        "body_fat_pct": None,
        "water_pct": None,
        "muscle_kg": None,
        "bone_kg": None,
        "visceral_fat": None,
        "bmr_kcal": None,
    }
    body = await gym.get("/api/body")
    assert body["latest"] == measurement
    assert body["points"] == [{"date": "2026-09-28", "weight": 78.4, "body_fat_pct": None}]


async def test_a_scales_reading_gets_its_composition_from_the_profile(
    gym: Gym, clock: Clock
) -> None:
    reading = await weigh(gym, source="scale", weight=78.45, impedance=480)
    assert (reading["source"], reading["bmi"], reading["body_fat_pct"]) == ("scale", None, None)

    await gym.client.patch("/api/users/me", json=PROFILE, headers=gym.headers)

    body = await gym.get("/api/body")
    assert body["profile_complete"] is True
    latest = body["latest"]
    assert (latest["bmi"], latest["body_fat_pct"], latest["water_pct"]) == (24.2, 22.5, 53.1)
    assert (latest["muscle_kg"], latest["bone_kg"]) == (57.7, 3.1)
    assert (latest["visceral_fat"], latest["bmr_kcal"]) == (13, 1612)
    assert body["points"][0]["body_fat_pct"] == 22.5

    # Correcting the profile corrects what was already weighed.
    await gym.client.patch("/api/users/me", json={"height_cm": 175}, headers=gym.headers)
    assert (await gym.get("/api/body"))["latest"]["bmi"] == 25.6


async def test_a_scale_that_measured_no_impedance_gives_the_weight_alone(gym: Gym) -> None:
    await gym.client.patch("/api/users/me", json=PROFILE, headers=gym.headers)

    reading = await weigh(gym, source="scale", weight=78.45)

    assert (reading["bmi"], reading["body_fat_pct"], reading["muscle_kg"]) == (24.2, None, None)


async def test_body_fat_can_be_typed_in_with_the_weight(gym: Gym) -> None:
    reading = await weigh(gym, weight=78.4, body_fat_pct=21.5)

    assert (reading["body_fat_pct"], reading["water_pct"]) == (21.5, None)


async def test_an_earlier_day_is_dated_at_its_noon_and_typing_it_again_replaces_it(
    gym: Gym, clock: Clock
) -> None:
    await weigh(gym, weight=79.2, day="2026-09-21")
    await weigh(gym, weight=79.0, day="2026-09-21")
    await weigh(gym, weight=78.4)

    body = await gym.get("/api/body")

    # Noon in Lisbon (UTC+1 in September); newest first.
    assert [(m["measured_at"], m["weight"]) for m in body["measurements"]] == [
        ("2026-09-28T17:30:00Z", 78.4),
        ("2026-09-21T11:00:00Z", 79.0),
    ]
    assert [p["date"] for p in body["points"]] == ["2026-09-21", "2026-09-28"]
    assert body["change"] == -0.6


async def test_a_year_shows_a_point_per_week_and_a_range_leaves_older_weighings_out(
    gym: Gym, clock: Clock
) -> None:
    await weigh(gym, weight=82, day="2026-03-02")  # a Monday, half a year back
    await weigh(gym, weight=79.4, day="2026-09-22")
    await weigh(gym, weight=79.0, day="2026-09-23")
    await weigh(gym, weight=78.4)

    year = await gym.get("/api/body?range=1y")
    month = await gym.get("/api/body?range=4w")

    assert [(p["date"], p["weight"]) for p in year["points"]] == [
        ("2026-03-02", 82.0),
        ("2026-09-21", 79.2),
        ("2026-09-28", 78.4),
    ]
    assert year["change"] == -3.6
    assert len(month["measurements"]) == 3
    assert month["latest"]["weight"] == 78.4


async def test_the_latest_weighing_is_shown_even_when_it_is_older_than_the_range(
    gym: Gym, clock: Clock
) -> None:
    await weigh(gym, weight=82, day="2026-03-02")

    body = await gym.get("/api/body?range=4w")

    assert (body["latest"]["weight"], body["measurements"], body["points"]) == (82.0, [], [])


async def test_the_day_is_the_users_own(gym: Gym, clock: Clock) -> None:
    await gym.client.patch(
        "/api/users/me", json={"timezone": "Pacific/Auckland"}, headers=gym.headers
    )

    await weigh(gym, weight=78.4)  # 17:30 UTC on the 28th is already the 29th in Auckland

    assert (await gym.get("/api/body"))["points"][0]["date"] == "2026-09-29"


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"weight": 5},
        {"weight": 400},
        {"weight": 78.123},
        {"weight": 78, "body_fat_pct": 90},
        {"weight": 78, "impedance": 480},  # typed in, with an impedance
        {"weight": 78, "source": "scale", "day": "2026-09-21"},
        {"weight": 78, "source": "scale", "impedance": 0},
        {"weight": 78, "source": "garmin"},
    ],
)
async def test_a_weighing_is_validated(gym: Gym, body: dict[str, Any]) -> None:
    response = await gym.client.post("/api/body/measurements", json=body, headers=gym.headers)

    assert (response.status_code, response.json()["code"]) == (422, "validation_error")


@pytest.mark.parametrize("day", ["2026-09-29", "1999-12-31"])
async def test_a_weighing_isnt_dated_in_the_future_or_last_century(gym: Gym, day: str) -> None:
    response = await gym.client.post(
        "/api/body/measurements", json={"weight": 78, "day": day}, headers=gym.headers
    )

    assert (response.status_code, response.json()["code"]) == (400, "measurement_date_invalid")


async def test_deleting_a_weighing(gym: Gym, client: AsyncClient) -> None:
    kept = await weigh(gym, weight=79, day="2026-09-21")
    gone = await weigh(gym, weight=78.4)
    other = await signup(client, "outra@example.pt")
    path = f"/api/body/measurements/{gone['id']}"

    theirs = await client.delete(path, headers=other)
    assert (theirs.status_code, theirs.json()["code"]) == (404, "measurement_not_found")
    assert (await client.delete(path, headers=gym.headers)).status_code == 204
    assert (await client.delete(path, headers=gym.headers)).status_code == 404

    assert [m["id"] for m in (await gym.get("/api/body"))["measurements"]] == [kept["id"]]


async def test_weighings_are_each_users_own(gym: Gym, client: AsyncClient) -> None:
    await weigh(gym, weight=78.4)
    other = await signup(client, "outra@example.pt")

    assert (await client.get("/api/body", headers=other)).json()["latest"] is None


async def test_the_body_needs_a_session(client: AsyncClient) -> None:
    assert (await client.get("/api/body")).status_code == 401
    assert (await client.post("/api/body/measurements", json={"weight": 78})).status_code == 401


async def test_stored_in_kg_as_read(gym: Gym, db_session: AsyncSession) -> None:
    await weigh(gym, source="scale", weight=78.45, impedance=480)

    row = (await db_session.execute(select(BodyMeasurement))).scalar_one()
    assert (float(row.weight), row.impedance, row.body_fat_pct) == (78.45, 480, None)
    assert await db_session.scalar(select(func.count()).select_from(BodyMeasurement)) == 1
