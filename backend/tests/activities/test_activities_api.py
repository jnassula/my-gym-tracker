"""Activities besides the gym: keeping them, marking their days, and what the week makes of
them. The clock starts on Monday 2026-09-28; PLAN trains legs on Monday and back on Wednesday."""

from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.activities.models import Activity, ActivityDay
from tests.helpers import signup
from tests.training import Clock, Gym, open_gym

MONDAY, TUESDAY, WEDNESDAY, THURSDAY = "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"
FOOTVOLLEY = {"name": "Futevôlei", "weekdays": [2], "avoid": ["lower"]}
SURF = {"name": "Surf", "avoid": ["upper"]}


async def add(gym: Gym, activity: dict[str, Any]) -> dict[str, Any]:
    response = await gym.client.post("/api/activities", json=activity, headers=gym.headers)
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


async def put(gym: Gym, activity: dict[str, Any], day: str) -> int:
    path = f"/api/activities/{activity['id']}/days/{day}"
    return (await gym.client.put(path, headers=gym.headers)).status_code


async def take_off(gym: Gym, activity: dict[str, Any], day: str) -> int:
    path = f"/api/activities/{activity['id']}/days/{day}"
    return (await gym.client.delete(path, headers=gym.headers)).status_code


async def week(gym: Gym) -> dict[str, Any]:
    result: dict[str, Any] = await gym.get(f"/api/logs/plans/{gym.plan['id']}/week")
    return result


async def on(gym: Gym) -> list[tuple[str, str, bool]]:
    return [(a["date"], a["name"], a["fixed"]) for a in (await week(gym))["activities"]]


# --- keeping them --------------------------------------------------------------------------------


async def test_an_activity_is_kept_with_its_days_and_what_it_avoids(gym: Gym) -> None:
    created = await add(gym, FOOTVOLLEY)

    assert created | {"id": None} == {
        "id": None,
        "name": "Futevôlei",
        "weekdays": [2],
        "avoid": ["lower"],
    }
    overview = await gym.get("/api/activities")
    assert overview["activities"] == [created]
    # The plan's days by the regions they work: what "avoid" will keep the activity away from.
    assert [(day["label"], day["weekday"], day["regions"]) for day in overview["plan_days"]] == [
        ("Quadríceps e Glúteos", 0, ["lower"]),
        ("Costas", 2, ["upper"]),
    ]


async def test_what_is_sent_is_tidied(gym: Gym) -> None:
    created = await add(
        gym, {"name": "  Padel ", "weekdays": [4, 1, 4], "avoid": ["upper", "core", "upper"]}
    )

    assert (created["name"], created["weekdays"], created["avoid"]) == (
        "Padel",
        [1, 4],
        ["core", "upper"],
    )


@pytest.mark.parametrize(
    "body",
    [
        {"name": ""},
        {"name": "x" * 41},
        {"name": "Surf", "weekdays": [7]},
        {"name": "Surf", "avoid": ["arms"]},
        {},
    ],
)
async def test_an_activity_is_validated(gym: Gym, body: dict[str, Any]) -> None:
    response = await gym.client.post("/api/activities", json=body, headers=gym.headers)

    assert response.status_code == 422


async def test_a_name_is_used_once_whatever_its_capitals(gym: Gym) -> None:
    await add(gym, SURF)
    other = await add(gym, FOOTVOLLEY)

    again = await gym.client.post("/api/activities", json={"name": "SURF"}, headers=gym.headers)
    renamed = await gym.client.patch(
        f"/api/activities/{other['id']}", json={"name": "surf"}, headers=gym.headers
    )

    assert (again.status_code, again.json()["code"]) == (409, "activity_name_taken")
    assert (renamed.status_code, renamed.json()["code"]) == (409, "activity_name_taken")
    # Its own name, written another way, is not somebody else's.
    same = await gym.client.patch(
        f"/api/activities/{other['id']}", json={"name": "FUTEVÔLEI"}, headers=gym.headers
    )
    assert (same.status_code, same.json()["name"]) == (200, "FUTEVÔLEI")


async def test_there_is_room_for_twenty(gym: Gym) -> None:
    for number in range(20):
        await add(gym, {"name": f"Atividade {number}"})

    full = await gym.client.post("/api/activities", json={"name": "Mais uma"}, headers=gym.headers)

    assert (full.status_code, full.json()["code"]) == (409, "activity_limit")


async def test_an_activity_is_changed_a_field_at_a_time(gym: Gym) -> None:
    surf = await add(gym, SURF)

    changed = await gym.client.patch(
        f"/api/activities/{surf['id']}", json={"avoid": ["upper", "core"]}, headers=gym.headers
    )

    assert changed.json() == surf | {"avoid": ["core", "upper"]}


# --- its days ------------------------------------------------------------------------------------


async def test_a_fixed_weekday_puts_it_on_the_week_by_itself(gym: Gym) -> None:
    await add(gym, FOOTVOLLEY)

    assert await on(gym) == [(WEDNESDAY, "Futevôlei", True)]


async def test_an_activity_without_a_fixed_day_is_where_it_is_marked(gym: Gym) -> None:
    surf = await add(gym, SURF)
    assert await on(gym) == []

    assert await put(gym, surf, MONDAY) == 204
    assert await put(gym, surf, MONDAY) == 204  # twice is once
    assert await put(gym, surf, THURSDAY) == 204  # and ahead: "surf on Thursday"

    assert await on(gym) == [(MONDAY, "Surf", False), (THURSDAY, "Surf", False)]
    assert await take_off(gym, surf, MONDAY) == 204
    assert await take_off(gym, surf, MONDAY) == 204
    assert await on(gym) == [(THURSDAY, "Surf", False)]


async def test_a_fixed_day_that_did_not_happen_is_said_so(
    gym: Gym, db_session: AsyncSession
) -> None:
    footvolley = await add(gym, FOOTVOLLEY)

    assert await take_off(gym, footvolley, WEDNESDAY) == 204  # "não fui"

    assert await on(gym) == []
    assert await db_session.scalar(select(ActivityDay.skipped)) is True  # kept, so it stays off
    assert await put(gym, footvolley, WEDNESDAY) == 204  # went after all
    assert await on(gym) == [(WEDNESDAY, "Futevôlei", False)]


async def test_a_day_is_marked_within_two_weeks_of_today(gym: Gym) -> None:
    surf = await add(gym, SURF)

    assert await put(gym, surf, "2026-10-12") == 204  # in two weeks
    assert await put(gym, surf, "2026-09-14") == 204  # two weeks ago
    for too_far in ("2026-10-13", "2026-09-13"):
        response = await gym.client.put(
            f"/api/activities/{surf['id']}/days/{too_far}", headers=gym.headers
        )
        assert (response.status_code, response.json()["code"]) == (400, "activity_date_invalid")
    not_a_date = await gym.client.put(
        f"/api/activities/{surf['id']}/days/tomorrow", headers=gym.headers
    )
    assert not_a_date.status_code == 422


async def test_changing_the_fixed_days_moves_no_day_gone_by(gym: Gym, clock: Clock) -> None:
    footvolley = await add(gym, FOOTVOLLEY)  # Wednesdays, from Monday 28 September
    clock.advance(days=10)  # Thursday 8 October: two Wednesdays went by

    await gym.client.patch(
        f"/api/activities/{footvolley['id']}", json={"weekdays": [4]}, headers=gym.headers
    )

    def days_of(calendar: dict[str, Any]) -> list[str]:
        return [day["date"] for day in calendar["days"] if day["activities"]]

    assert days_of(await gym.get("/api/progress/calendar?month=2026-09-01")) == ["2026-09-30"]
    # October: the Wednesday that went by, then Fridays from now on (not the Friday before).
    assert days_of(await gym.get("/api/progress/calendar")) == [
        "2026-10-07",
        "2026-10-09",
        "2026-10-16",
        "2026-10-23",
        "2026-10-30",
    ]


async def test_an_archived_activity_keeps_its_past_and_leaves_the_days_to_come(
    gym: Gym, clock: Clock, db_session: AsyncSession
) -> None:
    footvolley = await add(gym, FOOTVOLLEY)
    surf = await add(gym, SURF)
    await put(gym, surf, MONDAY)
    await put(gym, surf, "2026-10-03")  # marked for Saturday
    clock.advance(days=3)  # Thursday 1 October

    for activity in (footvolley, surf):
        gone = await gym.client.delete(f"/api/activities/{activity['id']}", headers=gym.headers)
        assert gone.status_code == 204

    assert (await gym.get("/api/activities"))["activities"] == []
    assert await on(gym) == [(MONDAY, "Surf", False), (WEDNESDAY, "Futevôlei", False)]
    assert await put(gym, surf, THURSDAY) == 404  # nothing more is marked on it
    assert await db_session.scalar(select(func.count()).select_from(Activity)) == 2  # kept
    await add(gym, SURF)  # and its name is free again


# --- the week works around them --------------------------------------------------------------


def exercise(name: str, group: str) -> dict[str, Any]:
    return {"name": name, "muscle_group": group, "sets": 3, "reps": "12"}


ABC = {
    "name": "ABC",
    "days": [
        {"weekday": None, "label": "Treino A", "exercises": [exercise("Supino", "chest")]},
        {"weekday": None, "label": "Treino C", "exercises": [exercise("Prancha", "abs")]},
        {"weekday": None, "label": "Treino B", "exercises": [exercise("Agachamento", "quads")]},
    ],
}


async def done(gym: Gym, day: str) -> None:
    await gym.client.put(f"/api/logs/days/{day}/done", headers=gym.headers)


async def test_the_users_week(client: AsyncClient, clock: Clock) -> None:
    """A on Monday; on Tuesday the legs, because Wednesday is footvolley; C on Wednesday."""
    gym = await open_gym(client, "jonatan@example.pt", ABC)
    upper, abs_, legs = (gym.day(index) for index in range(3))
    await add(gym, FOOTVOLLEY)

    assert (await week(gym))["suggestion"]["day_id"] == upper  # Monday: nothing in the way
    await done(gym, upper)
    clock.advance(days=1)

    tuesday = await week(gym)
    assert tuesday["suggestion"] == {
        "kind": "suggest",
        "day_id": legs,  # not C, which the plan has next
        "reason": "before_activity",
        "because": ["Futevôlei"],
    }
    assert [day["avoid"] for day in tuesday["days"]] == [[], [], []]  # today, nothing clashes
    await done(gym, legs)
    clock.advance(days=1)

    wednesday = await week(gym)
    assert wednesday["suggestion"] == {
        "kind": "suggest",
        "day_id": abs_,
        "reason": "next",
        "because": [],
    }
    assert [day["avoid"] for day in wednesday["days"]] == [[], [], ["Futevôlei"]]


async def test_a_workout_is_not_suggested_with_an_activity_it_clashes_with(
    client: AsyncClient, clock: Clock
) -> None:
    gym = await open_gym(client, "jonatan@example.pt", ABC)
    upper, abs_, legs = (gym.day(index) for index in range(3))
    surf = await add(gym, SURF)

    await put(gym, surf, MONDAY)  # the sea is good today

    monday = await week(gym)
    assert monday["suggestion"] == {
        "kind": "suggest",
        "day_id": abs_,
        "reason": "instead",
        "because": ["Surf"],
    }
    assert monday["days"][0]["avoid"] == ["Surf"]
    # With only the upper-body workout left, a surf day has nothing to suggest.
    await done(gym, abs_)
    clock.advance(days=1)
    await done(gym, legs)
    clock.advance(days=1)
    await put(gym, surf, WEDNESDAY)
    assert (await week(gym))["suggestion"] == {
        "kind": "rest",
        "day_id": upper,
        "reason": "clash",
        "because": ["Surf"],
    }
    await take_off(gym, surf, WEDNESDAY)  # no surf after all
    assert (await week(gym))["suggestion"]["kind"] == "suggest"


async def test_an_activity_that_avoids_nothing_changes_nothing(gym: Gym) -> None:
    padel = await add(gym, {"name": "Padel"})
    await put(gym, padel, MONDAY)

    monday = await week(gym)

    assert monday["suggestion"]["reason"] == "plan"
    assert [day["avoid"] for day in monday["days"]] == [[], []]
    assert await on(gym) == [(MONDAY, "Padel", False)]


async def test_sunday_looks_at_next_weeks_monday(client: AsyncClient, clock: Clock) -> None:
    gym = await open_gym(client, "jonatan@example.pt", ABC)
    await add(gym, {"name": "Corrida", "weekdays": [0], "avoid": ["lower"]})
    clock.advance(days=6)  # Sunday 4 October; A, C and B all still to do

    sunday = await week(gym)

    assert sunday["suggestion"]["reason"] == "before_activity"  # the legs, before Monday's run
    assert sunday["suggestion"]["day_id"] == gym.day(2)
    assert ("2026-10-05", "Corrida", True) in await on(gym)


# --- the calendar, the export, and whose they are ------------------------------------------------


async def test_the_calendar_names_each_days_activities(gym: Gym) -> None:
    surf = await add(gym, SURF)
    await add(gym, FOOTVOLLEY)
    await put(gym, surf, WEDNESDAY)
    await gym.log("0/2", 45, 12)  # and a workout on Monday

    calendar = await gym.get("/api/progress/calendar")

    days = {day["date"]: day for day in calendar["days"]}
    assert days[WEDNESDAY]["activities"] == ["Surf", "Futevôlei"]  # in the order they were added
    assert (days[MONDAY]["status"], days[MONDAY]["activities"]) == ("trained", [])
    # An activity is not a workout: the day isn't "trained", nor the week's count any higher.
    assert days[WEDNESDAY]["status"] in ("rest", "future")
    assert (calendar["sessions_total"], calendar["week_streak"]) == (1, 1)


async def test_the_export_holds_the_activities(gym: Gym, clock: Clock) -> None:
    surf = await add(gym, SURF)
    footvolley = await add(gym, FOOTVOLLEY)
    await put(gym, surf, MONDAY)
    await take_off(gym, footvolley, WEDNESDAY)
    await gym.client.delete(f"/api/activities/{surf['id']}", headers=gym.headers)

    data = (await gym.client.get("/api/users/me/export", headers=gym.headers)).json()

    by_name = {activity["name"]: activity for activity in data["activities"]}
    assert by_name["Futevôlei"] | {"created_at": None} == {
        "name": "Futevôlei",
        "weekdays": [2],
        "weekdays_since": MONDAY,
        "avoid": ["lower"],
        "created_at": None,
        "archived_at": None,
        "days": [{"date": WEDNESDAY, "skipped": True}],
    }
    assert by_name["Surf"]["archived_at"] is not None
    assert by_name["Surf"]["days"] == []  # marked for today, and today went with it


async def test_activities_go_with_the_account(gym: Gym, db_session: AsyncSession) -> None:
    surf = await add(gym, SURF)
    await put(gym, surf, MONDAY)

    gone = await gym.client.request(
        "DELETE", "/api/users/me", json={"password": "Treino2026!"}, headers=gym.headers
    )

    assert gone.status_code == 204, gone.text
    assert await db_session.scalar(select(func.count()).select_from(Activity)) == 0
    assert await db_session.scalar(select(func.count()).select_from(ActivityDay)) == 0


async def test_activities_are_ones_own(gym: Gym, client: AsyncClient) -> None:
    surf = await add(gym, SURF)
    other = await signup(client, "outro@example.pt")
    path = f"/api/activities/{surf['id']}"

    assert (await client.get("/api/activities", headers=other)).json()["activities"] == []
    for method, url in (("PATCH", path), ("DELETE", path), ("PUT", f"{path}/days/{MONDAY}")):
        theirs = await client.request(method, url, json={"name": "Meu"}, headers=other)
        assert (theirs.status_code, theirs.json()["code"]) == (404, "activity_not_found")
        assert (await client.request(method, url, json={})).status_code == 401
    assert (await client.get("/api/activities")).status_code == 401
    assert (await gym.get("/api/activities"))["activities"] == [surf]
