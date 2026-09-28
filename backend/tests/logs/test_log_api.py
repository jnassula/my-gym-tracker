from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.logs import service
from app.users.models import User
from tests.helpers import signup

MONDAY = datetime(2026, 9, 28, 17, 30, tzinfo=UTC)  # 18:30 in Lisbon

PLAN: dict[str, Any] = {
    "name": "Treino 01",
    "days": [
        {"weekday": 0, "label": "Quadríceps e Glúteos", "exercises": [
            {"name": "Esteira", "muscle_group": "warmup", "reps": "30 min"},
            {"name": "Cadeira Extensora", "muscle_group": "warmup", "sets": 2, "reps": "20"},
            {"name": "Cadeira Extensora", "muscle_group": "quads", "sets": 3, "reps": "12"},
            {"name": "Agachamento Livre", "muscle_group": "quads", "sets": 2, "reps": "8-12"},
        ]},
        {"weekday": 2, "label": "Costas", "exercises": [
            {"name": "Remada Curvada", "muscle_group": "back", "sets": 3, "reps": "12"},
        ]},
    ],
}  # fmt: skip


@dataclass
class Clock:
    now: datetime

    def advance(self, **delta: float) -> None:
        self.now += timedelta(**delta)


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> Clock:
    clock = Clock(MONDAY)
    monkeypatch.setattr(service, "now", lambda: clock.now)
    return clock


@dataclass
class Gym:
    """A signed-in user with PLAN imported; exercises by "day/index", e.g. ``ex["0/2"]``."""

    client: AsyncClient
    headers: dict[str, str]
    plan: dict[str, Any]
    ex: dict[str, str]

    def day(self, index: int) -> str:
        return str(self.plan["days"][index]["id"])

    async def log(self, exercise: str, weight: float, reps: int) -> dict[str, Any]:
        response = await self.client.post(
            f"/api/logs/exercises/{self.ex[exercise]}/sets",
            json={"weight": weight, "reps": reps},
            headers=self.headers,
        )
        assert response.status_code == 201, response.text
        result: dict[str, Any] = response.json()
        return result

    async def get(self, path: str) -> Any:
        response = await self.client.get(path, headers=self.headers)
        assert response.status_code == 200, response.text
        return response.json()


async def open_gym(client: AsyncClient, email: str = "atleta@example.pt", plan: Any = None) -> Gym:
    headers = await signup(client, email)
    response = await client.post("/api/workouts", json=plan or PLAN, headers=headers)
    assert response.status_code == 201, response.text
    created = response.json()
    exercises = {
        f"{d}/{e}": exercise["id"]
        for d, day in enumerate(created["days"])
        for e, exercise in enumerate(day["exercises"])
    }
    return Gym(client, headers, created, exercises)


@pytest.fixture
async def gym(client: AsyncClient, clock: Clock) -> Gym:
    return await open_gym(client)


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
    }
    assert wednesday["session_id"] is None
    assert wednesday["exercises_done"] == 0


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
