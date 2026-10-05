from datetime import UTC, datetime
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.users.models import User
from tests.helpers import signup
from tests.training import PLAN, Clock, Gym, open_gym


def sets_of(session: dict[str, Any], exercise_id: str) -> list[tuple[int, float, int]]:
    return [
        (s["set_number"], s["weight"], s["reps"])
        for s in session["sets"]
        if s["exercise_id"] == exercise_id
    ]


# --- logging sets --------------------------------------------------------------------------------


async def test_the_first_set_starts_todays_session(gym: Gym) -> None:
    assert (await gym.get(f"/api/logs/days/{gym.day(0)}"))["session"] is None

    session = await gym.log("0/2", 45, 12)

    assert session["day_id"] == gym.day(0)
    assert session["local_date"] == "2026-09-28"
    assert session["ended_at"] is None
    assert sets_of(session, gym.ex["0/2"]) == [(1, 45.0, 12)]
    day = await gym.get(f"/api/logs/days/{gym.day(0)}")
    assert day["today"] == "2026-09-28"
    assert day["session"] == session


async def test_set_numbers_count_per_exercise(gym: Gym, clock: Clock) -> None:
    await gym.log("0/2", 45, 12)
    clock.advance(minutes=2)
    await gym.log("0/3", 80, 10)
    clock.advance(minutes=2)
    session = await gym.log("0/2", 47.5, 11)

    assert sets_of(session, gym.ex["0/2"]) == [(1, 45.0, 12), (2, 47.5, 11)]
    assert sets_of(session, gym.ex["0/3"]) == [(1, 80.0, 10)]
    # Sets come back in the order they were done.
    assert [s["exercise_id"] for s in session["sets"]] == [
        gym.ex["0/2"],
        gym.ex["0/3"],
        gym.ex["0/2"],
    ]


async def test_each_date_gets_its_own_session(gym: Gym, clock: Clock) -> None:
    first = await gym.log("0/2", 45, 12)
    clock.advance(days=7)

    second = await gym.log("0/2", 47.5, 12)

    assert second["id"] != first["id"]
    assert second["local_date"] == "2026-10-05"
    assert sets_of(second, gym.ex["0/2"]) == [(1, 47.5, 12)]


async def test_today_is_the_users_local_date(
    gym: Gym, clock: Clock, db_session: AsyncSession
) -> None:
    clock.now = datetime(2026, 9, 28, 23, 30, tzinfo=UTC)  # already Tuesday in Lisbon (UTC+1)

    assert (await gym.log("0/2", 45, 12))["local_date"] == "2026-09-29"

    await db_session.execute(update(User).values(timezone="America/Sao_Paulo"))  # UTC-3
    assert (await gym.get(f"/api/logs/days/{gym.day(0)}"))["today"] == "2026-09-28"


@pytest.mark.parametrize(
    "body",
    [{"weight": -1, "reps": 10}, {"weight": 20.125, "reps": 10}, {"weight": 1001, "reps": 10},
     {"weight": 20, "reps": 0}, {"weight": 20}],
)  # fmt: skip
async def test_sets_are_validated(gym: Gym, body: dict[str, Any]) -> None:
    response = await gym.client.post(
        f"/api/logs/exercises/{gym.ex['0/2']}/sets", json=body, headers=gym.headers
    )

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


async def test_a_set_heavier_than_every_earlier_date_is_a_record(gym: Gym, clock: Clock) -> None:
    assert (await gym.log("0/2", 45, 12))["new_record"] is False  # a first time isn't one
    clock.advance(days=7)

    assert (await gym.log("0/2", 45, 12))["new_record"] is False  # equal
    assert (await gym.log("0/2", 50, 10))["new_record"] is True
    assert (await gym.log("0/2", 50, 8))["new_record"] is False  # already today
    assert (await gym.log("0/2", 52.5, 6))["new_record"] is True  # heavier again


# --- editing and undoing -------------------------------------------------------------------------


async def test_a_set_can_be_corrected(gym: Gym) -> None:
    set_id = (await gym.log("0/2", 45, 12))["sets"][0]["id"]

    response = await gym.client.patch(
        f"/api/logs/sets/{set_id}", json={"reps": 10}, headers=gym.headers
    )

    assert response.status_code == 200
    assert sets_of(response.json(), gym.ex["0/2"]) == [(1, 45.0, 10)]
    empty = await gym.client.patch(f"/api/logs/sets/{set_id}", json={}, headers=gym.headers)
    assert empty.status_code == 422


async def test_deleting_a_set_renumbers_the_ones_after_it(gym: Gym, clock: Clock) -> None:
    for weight in (40, 45, 50):
        session = await gym.log("0/2", weight, 12)
        clock.advance(minutes=2)
    middle = session["sets"][1]["id"]

    response = await gym.client.delete(f"/api/logs/sets/{middle}", headers=gym.headers)

    assert sets_of(response.json(), gym.ex["0/2"]) == [(1, 40.0, 12), (2, 50.0, 12)]
    assert (await gym.log("0/2", 55, 12))["sets"][-1]["set_number"] == 3


async def test_undoing_the_only_set_removes_the_session(gym: Gym) -> None:
    set_id = (await gym.log("0/2", 45, 12))["sets"][0]["id"]

    response = await gym.client.delete(f"/api/logs/sets/{set_id}", headers=gym.headers)

    assert response.status_code == 200
    assert response.json() is None
    assert (await gym.get(f"/api/logs/days/{gym.day(0)}"))["session"] is None


async def test_exercises_can_be_ticked_off_without_sets(gym: Gym) -> None:
    treadmill = gym.ex["0/0"]

    ticked = await gym.client.put(f"/api/logs/exercises/{treadmill}/done", headers=gym.headers)
    again = await gym.client.put(f"/api/logs/exercises/{treadmill}/done", headers=gym.headers)

    assert ticked.status_code == again.status_code == 200
    assert again.json()["done_exercise_ids"] == [treadmill]
    unticked = await gym.client.delete(f"/api/logs/exercises/{treadmill}/done", headers=gym.headers)
    assert unticked.json() is None  # nothing else was logged: the session goes away
    nothing = await gym.client.delete(f"/api/logs/exercises/{treadmill}/done", headers=gym.headers)
    assert nothing.status_code == 200
    assert nothing.json() is None


# --- history -------------------------------------------------------------------------------------


async def test_last_time_and_history(gym: Gym, clock: Clock) -> None:
    await gym.log("0/2", 45, 12)
    await gym.log("0/2", 45, 11)
    clock.advance(days=7)
    await gym.log("0/2", 47.5, 12)
    clock.advance(days=7)
    await gym.log("0/2", 50, 8)  # today: not history yet

    day = await gym.get(f"/api/logs/days/{gym.day(0)}")
    history = await gym.get(f"/api/logs/exercises/{gym.ex['0/2']}/history")

    assert day["last"] == {
        gym.ex["0/2"]: {"date": "2026-10-05", "sets": [{"weight": 47.5, "reps": 12}]}
    }
    assert history == {
        "sessions": [
            {"date": "2026-10-05", "sets": [{"weight": 47.5, "reps": 12}]},
            {
                "date": "2026-09-28",
                "sets": [{"weight": 45.0, "reps": 12}, {"weight": 45.0, "reps": 11}],
            },
        ],
        "best_weight": 47.5,
        # The "Progressão" sparkline: heaviest set per session, oldest first.
        "recent": [{"date": "2026-09-28", "weight": 45.0}, {"date": "2026-10-05", "weight": 47.5}],
    }


async def test_history_carries_over_to_the_next_plan(
    client: AsyncClient, gym: Gym, clock: Clock
) -> None:
    await gym.log("0/1", 20, 20)  # the warm-up "Cadeira Extensora"
    await gym.log("0/2", 45, 12)  # the working one
    clock.advance(days=35)
    response = await client.post(
        "/api/workouts", json=PLAN | {"name": "Treino 02"}, headers=gym.headers
    )
    new_day = response.json()["days"][0]
    warmup, working = new_day["exercises"][1]["id"], new_day["exercises"][2]["id"]

    day = await gym.get(f"/api/logs/days/{new_day['id']}")

    # Same name, same group: the new plan's exercise remembers the old one's sets.
    assert day["last"][working] == {"date": "2026-09-28", "sets": [{"weight": 45.0, "reps": 12}]}
    assert day["last"][warmup] == {"date": "2026-09-28", "sets": [{"weight": 20.0, "reps": 20}]}


async def test_a_machine_listed_twice_keeps_its_own_history(gym: Gym, clock: Clock) -> None:
    plan = {"name": "Pernas", "days": [{"weekday": 0, "exercises": [
        {"name": "Cadeira Extensora", "muscle_group": "quads", "sets": 3},
        {"name": "Cadeira Extensora", "muscle_group": "quads", "sets": 2},  # rest pause at the end
    ]}]}  # fmt: skip
    legs = await open_gym(gym.client, "pernas@example.pt", plan)
    await legs.log("0/0", 45, 12)
    await legs.log("0/1", 30, 15)
    clock.advance(days=7)

    day = await legs.get(f"/api/logs/days/{legs.day(0)}")

    assert day["last"][legs.ex["0/0"]]["sets"] == [{"weight": 45.0, "reps": 12}]
    assert day["last"][legs.ex["0/1"]]["sets"] == [{"weight": 30.0, "reps": 15}]


# --- week and finishing --------------------------------------------------------------------------


async def test_the_week_shows_what_was_trained(gym: Gym, clock: Clock) -> None:
    clock.advance(days=-7)
    await gym.log("0/2", 45, 12)  # last week: doesn't count
    clock.advance(days=7)
    await gym.client.put(f"/api/logs/exercises/{gym.ex['0/0']}/done", headers=gym.headers)
    await gym.log("0/1", 20, 20)
    await gym.log("0/1", 20, 20)
    await gym.log("0/2", 45, 12)

    week = await gym.get(f"/api/logs/plans/{gym.plan['id']}/week")

    assert (week["today"], week["week_start"]) == ("2026-09-28", "2026-09-28")
    monday, wednesday = week["days"]
    assert monday | {"session_id": None} == {
        "day_id": gym.day(0),
        "session_id": None,
        "date": "2026-09-28",
        "finished": False,
        "exercises_done": 2,  # treadmill ticked, warm-up extension 2/2; working one 1/3
        "exercises_total": 4,
        "sets": 3,
        "trained": False,  # started today, not complete yet
        "avoid": [],
    }
    assert wednesday["session_id"] is None
    assert wednesday["exercises_done"] == 0
    assert (week["workouts_done"], week["target"]) == (0, 2)
    [workout] = week["sessions"]  # last week's isn't this week's
    assert workout == {
        "session_id": monday["session_id"],
        "day_id": gym.day(0),
        "date": "2026-09-28",
        "complete": False,
    }
    assert week["suggestion"] == suggests("continue", gym.day(0), None)


def suggests(
    kind: str, day_id: str, reason: str | None = None, because: tuple[str, ...] = ()
) -> dict[str, Any]:
    return {"kind": kind, "day_id": day_id, "reason": reason, "because": list(because)}


async def week_of(gym: Gym) -> dict[str, Any]:
    week: dict[str, Any] = await gym.get(f"/api/logs/plans/{gym.plan['id']}/week")
    return week


async def test_mondays_workout_can_be_done_on_wednesday(gym: Gym, clock: Clock) -> None:
    """The plan's weekdays are a suggestion: nothing is missed, and the week counts workouts."""
    assert (await week_of(gym))["suggestion"] == suggests("suggest", gym.day(0), "plan")
    clock.advance(days=1)  # Tuesday: Monday's is still to do
    assert (await week_of(gym))["suggestion"] == suggests("suggest", gym.day(0), "catch_up")
    clock.advance(days=1)  # Wednesday: its own day first; Monday's is done instead
    assert (await week_of(gym))["suggestion"]["day_id"] == gym.day(1)
    await gym.client.put(f"/api/logs/days/{gym.day(0)}/done", headers=gym.headers)

    week = await week_of(gym)

    monday, wednesday = week["days"]
    assert (monday["trained"], monday["date"]) == (True, "2026-09-30")
    assert wednesday["trained"] is False
    assert (week["workouts_done"], week["target"]) == (1, 2)
    assert week["suggestion"] == suggests("done", gym.day(0), None)
    clock.advance(days=1)  # Thursday: what is left of the week
    assert (await week_of(gym))["suggestion"] == suggests("suggest", gym.day(1), "catch_up")


async def test_the_week_is_complete_when_each_day_was_trained(gym: Gym, clock: Clock) -> None:
    await gym.client.put(f"/api/logs/days/{gym.day(1)}/done", headers=gym.headers)
    clock.advance(days=1)
    await gym.log("0/2", 45, 12)  # one set of the other day, left there
    clock.advance(days=1)

    week = await week_of(gym)

    assert (week["workouts_done"], week["target"]) == (2, 2)  # yesterday's counts as it was left
    assert week["suggestion"]["kind"] == "complete"
    assert [day["trained"] for day in week["days"]] == [True, True]
    assert [workout["complete"] for workout in week["sessions"]] == [True, False]


async def test_a_rotating_plan_suggests_the_day_trained_longest_ago(
    client: AsyncClient, clock: Clock
) -> None:
    exercise = {"name": "Prancha", "muscle_group": "abs", "sets": 3, "reps": "30 s"}
    rotating = {
        "name": "ABC",
        "days": [
            {"weekday": None, "label": f"Treino {letter}", "exercises": [exercise]}
            for letter in "ABC"
        ],
    }
    gym = await open_gym(client, "rotativo@example.pt", rotating)
    a, b, c = (gym.day(index) for index in range(3))

    assert (await week_of(gym))["suggestion"] == suggests("suggest", a, "next")
    await gym.client.put(f"/api/logs/days/{c}/done", headers=gym.headers)  # C instead, today
    clock.advance(days=1)
    assert (await week_of(gym))["suggestion"]["day_id"] == a
    await gym.client.put(f"/api/logs/days/{a}/done", headers=gym.headers)
    clock.advance(days=6)  # next week: B was never trained, then C (longest ago), then A

    assert (await week_of(gym))["suggestion"] == suggests("suggest", b, "next")
    await gym.client.put(f"/api/logs/days/{b}/done", headers=gym.headers)
    clock.advance(days=1)
    assert (await week_of(gym))["suggestion"]["day_id"] == c


async def test_a_new_plan_mid_week_keeps_the_weeks_workouts(
    client: AsyncClient, gym: Gym, clock: Clock
) -> None:
    await gym.client.put(f"/api/logs/days/{gym.day(0)}/done", headers=gym.headers)
    clock.advance(days=1)
    response = await client.post("/api/workouts", json=PLAN | {"name": "Novo"}, headers=gym.headers)
    new = response.json()

    week = await gym.get(f"/api/logs/plans/{new['id']}/week")

    assert (week["workouts_done"], week["target"]) == (1, 2)
    assert [day["trained"] for day in week["days"]] == [False, False]  # its own days: none yet
    assert week["sessions"][0]["day_id"] == gym.day(0)  # the old plan's, still on its date
    assert week["suggestion"]["day_id"] == new["days"][0]["id"]


# --- the whole workout, done ---------------------------------------------------------------------


async def test_a_whole_workout_is_marked_done_at_once(gym: Gym, clock: Clock) -> None:
    response = await gym.client.put(f"/api/logs/days/{gym.day(0)}/done", headers=gym.headers)

    assert response.status_code == 200
    session = response.json()
    assert sorted(session["done_exercise_ids"]) == sorted(gym.ex[f"0/{n}"] for n in range(4))
    assert session["ended_at"] is not None
    assert (session["local_date"], session["sets"]) == ("2026-09-28", [])
    monday = (await week_of(gym))["days"][0]
    assert (monday["finished"], monday["exercises_done"], monday["trained"]) == (True, 4, True)


async def test_marking_done_keeps_the_sets_already_logged(gym: Gym, clock: Clock) -> None:
    for _ in range(3):
        await gym.log("0/2", 45, 12)  # all its sets: done by them, no tick needed
    await gym.log("0/3", 80, 10)  # one of two

    session = (
        await gym.client.put(f"/api/logs/days/{gym.day(0)}/done", headers=gym.headers)
    ).json()

    assert len(session["sets"]) == 4
    assert gym.ex["0/2"] not in session["done_exercise_ids"]
    assert sorted(session["done_exercise_ids"]) == sorted(gym.ex[f"0/{n}"] for n in (0, 1, 3))
    again = await gym.client.put(f"/api/logs/days/{gym.day(0)}/done", headers=gym.headers)
    assert again.json()["done_exercise_ids"] == session["done_exercise_ids"]  # nothing twice
    assert again.json()["ended_at"] == session["ended_at"]


async def test_marking_done_can_be_taken_back(gym: Gym) -> None:
    await gym.client.put(f"/api/logs/days/{gym.day(0)}/done", headers=gym.headers)

    undone = await gym.client.delete(f"/api/logs/days/{gym.day(0)}/done", headers=gym.headers)

    assert (undone.status_code, undone.json()) == (200, None)  # nothing was logged: no session
    assert (await gym.get(f"/api/logs/days/{gym.day(0)}"))["session"] is None
    assert (await week_of(gym))["suggestion"]["kind"] == "suggest"
    nothing = await gym.client.delete(f"/api/logs/days/{gym.day(0)}/done", headers=gym.headers)
    assert (nothing.status_code, nothing.json()) == (200, None)


async def test_taking_it_back_leaves_the_sets_and_reopens_the_workout(gym: Gym) -> None:
    await gym.log("0/3", 80, 10)
    await gym.client.put(f"/api/logs/days/{gym.day(0)}/done", headers=gym.headers)

    session = (
        await gym.client.delete(f"/api/logs/days/{gym.day(0)}/done", headers=gym.headers)
    ).json()

    assert (session["done_exercise_ids"], session["ended_at"]) == ([], None)
    assert len(session["sets"]) == 1
    assert (await week_of(gym))["suggestion"] == suggests("continue", gym.day(0), None)


async def test_only_ones_own_days_are_marked(gym: Gym, client: AsyncClient) -> None:
    other = await signup(client, "outro@example.pt")
    for method in (client.put, client.delete):
        theirs = await method(f"/api/logs/days/{gym.day(0)}/done", headers=other)
        assert (theirs.status_code, theirs.json()["code"]) == (404, "day_not_found")
        assert (await method(f"/api/logs/days/{gym.day(0)}/done")).status_code == 401
    assert (await gym.get(f"/api/logs/days/{gym.day(0)}"))["session"] is None


async def test_finishing_sums_up_the_session(gym: Gym, clock: Clock) -> None:
    await gym.log("0/2", 45, 12)
    clock.advance(days=7)
    session = await gym.log("0/2", 50, 10)
    clock.advance(minutes=20)
    await gym.log("0/2", 50, 8)
    await gym.log("0/3", 80, 10)  # first time: no record to beat
    clock.advance(minutes=25)

    response = await gym.client.post(
        f"/api/logs/sessions/{session['id']}/finish", headers=gym.headers
    )

    assert response.status_code == 200
    assert response.json() == {
        "session_id": session["id"],
        "sets": 3,
        "volume": 50 * 10 + 50 * 8 + 80 * 10,
        "duration_seconds": 45 * 60,
        "records": [{"exercise_id": gym.ex["0/2"], "name": "Cadeira Extensora", "weight": 50.0}],
    }
    day = await gym.get(f"/api/logs/days/{gym.day(0)}")
    assert day["session"]["ended_at"] is not None
    week = await gym.get(f"/api/logs/plans/{gym.plan['id']}/week")
    assert week["days"][0]["finished"] is True


async def test_finishing_twice_keeps_the_end_and_a_new_set_reopens(gym: Gym, clock: Clock) -> None:
    session = await gym.log("0/2", 45, 12)
    clock.advance(minutes=30)
    finish = f"/api/logs/sessions/{session['id']}/finish"
    first = (await gym.client.post(finish, headers=gym.headers)).json()
    clock.advance(minutes=30)

    assert (await gym.client.post(finish, headers=gym.headers)).json() == first
    assert (await gym.log("0/2", 45, 12))["ended_at"] is None


# --- isolation -----------------------------------------------------------------------------------


async def test_users_never_touch_each_others_training(gym: Gym, client: AsyncClient) -> None:
    session = await gym.log("0/2", 45, 12)
    set_id = session["sets"][0]["id"]
    bob = await signup(client, "bob@example.pt")

    attempts = [
        (await client.get(f"/api/logs/days/{gym.day(0)}", headers=bob), "day_not_found"),
        (await client.post(f"/api/logs/exercises/{gym.ex['0/2']}/sets",
                           json={"weight": 1, "reps": 1}, headers=bob), "exercise_not_found"),
        (await client.put(f"/api/logs/exercises/{gym.ex['0/0']}/done", headers=bob),
         "exercise_not_found"),
        (await client.get(f"/api/logs/exercises/{gym.ex['0/2']}/history", headers=bob),
         "exercise_not_found"),
        (await client.patch(f"/api/logs/sets/{set_id}", json={"reps": 1}, headers=bob),
         "set_not_found"),
        (await client.delete(f"/api/logs/sets/{set_id}", headers=bob), "set_not_found"),
        (await client.post(f"/api/logs/sessions/{session['id']}/finish", headers=bob),
         "session_not_found"),
        (await client.get(f"/api/logs/plans/{gym.plan['id']}/week", headers=bob),
         "plan_not_found"),
    ]  # fmt: skip

    assert [(r.status_code, r.json()["code"]) for r, _ in attempts] == [
        (404, code) for _, code in attempts
    ]
    day = await gym.get(f"/api/logs/days/{gym.day(0)}")
    assert sets_of(day["session"], gym.ex["0/2"]) == [(1, 45.0, 12)]


async def test_logging_needs_a_signed_in_user(gym: Gym, client: AsyncClient) -> None:
    response = await client.post(
        f"/api/logs/exercises/{gym.ex['0/2']}/sets", json={"weight": 1, "reps": 1}
    )

    assert response.status_code == 401
