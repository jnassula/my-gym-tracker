from datetime import UTC, datetime
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.workouts.models import WorkoutPlan
from tests.helpers import signup
from tests.training import Clock, Gym

# PLAN (tests/training.py): Monday "0/…" = treadmill, warm-up extension, extension, squat;
# Wednesday "1/0" = row. The clock starts on Monday 2026-09-28.
WARMUP_EXTENSION, EXTENSION, SQUAT, ROW = "0/1", "0/2", "0/3", "1/0"


async def train(gym: Gym, clock: Clock, sets: list[tuple[str, float, int]]) -> None:
    for exercise, weight, reps in sets:
        await gym.log(exercise, weight, reps)
        clock.advance(minutes=3)


async def test_an_empty_log_has_no_progress(gym: Gym) -> None:
    assert await gym.get("/api/progress") == {
        "week_streak": 0,
        "week_volume": 0.0,
        "records_this_month": 0,
        "last_record": None,
        "sets_by_group": [],
        "exercises": [],
    }


async def test_overview(gym: Gym, clock: Clock) -> None:
    await train(gym, clock, [(WARMUP_EXTENSION, 20, 20), (EXTENSION, 45, 12), (SQUAT, 80, 10)])
    clock.advance(days=7)  # Monday 5 October
    await train(gym, clock, [(WARMUP_EXTENSION, 20, 20), (EXTENSION, 50, 10), (SQUAT, 80, 8)])
    await train(gym, clock, [(EXTENSION, 50, 9)])

    overview = await gym.get("/api/progress")

    assert overview["week_streak"] == 2
    assert overview["week_volume"] == 50 * 10 + 80 * 8 + 50 * 9  # warm-ups left out
    assert overview["records_this_month"] == 1  # the extension, 50 > 45; the squat only tied
    assert overview["last_record"] == {
        "exercise_id": gym.ex[EXTENSION],
        "name": "Cadeira Extensora",
        "weight": 50.0,
        "date": "2026-10-05",
    }
    assert overview["sets_by_group"] == [{"muscle_group": "quads", "sets": 3}]
    trends = [(e["name"], e["best_weight"], e["trend"], [p["weight"] for p in e["recent"]])
              for e in overview["exercises"]]  # fmt: skip
    assert trends == [
        ("Agachamento Livre", 80.0, 0.0, [80.0, 80.0]),
        ("Cadeira Extensora", 50.0, 5.0, [45.0, 50.0]),
    ]
    assert overview["exercises"][1]["exercise_id"] == gym.ex[EXTENSION]
    assert overview["exercises"][1]["last_date"] == "2026-10-05"


async def test_bodyweight_exercises_have_no_trend(gym: Gym, clock: Clock) -> None:
    await train(gym, clock, [(ROW, 0, 12)])

    assert (await gym.get("/api/progress"))["exercises"] == []


async def test_one_exercise_over_a_range(gym: Gym, clock: Clock) -> None:
    clock.advance(days=-35)  # 24 August, five weeks back
    await train(gym, clock, [(EXTENSION, 40, 12)])
    clock.advance(days=35)  # 28 September
    await train(gym, clock, [(EXTENSION, 45, 12), (EXTENSION, 45, 10)])
    clock.advance(days=2)  # Wednesday: same week
    await train(gym, clock, [(EXTENSION, 47.5, 8)])
    path = f"/api/progress/exercises/{gym.ex[EXTENSION]}"

    four_weeks = await gym.get(f"{path}?range=4w")
    three_months = await gym.get(f"{path}?range=3m")
    year = await gym.get(f"{path}?range=1y")

    assert [p["date"] for p in four_weeks["points"]] == ["2026-09-28", "2026-09-30"]
    assert four_weeks["volume"] == 45 * 12 + 45 * 10 + 47.5 * 8
    assert four_weeks["trend"] == 2.5
    assert four_weeks["best_weight"] == 47.5
    assert four_weeks["sessions"] == [
        {"date": "2026-09-30", "weight": 47.5, "reps": 8, "volume": 380.0},
        {"date": "2026-09-28", "weight": 45.0, "reps": 12, "volume": 990.0},
    ]
    assert [p["weight"] for p in three_months["points"]] == [40.0, 45.0, 47.5]
    # A year is weekly: the heaviest set of each week, dated by its Monday.
    assert year["points"] == [
        {"date": "2026-08-24", "weight": 40.0},
        {"date": "2026-09-28", "weight": 47.5},
    ]


async def test_progress_follows_an_exercise_into_the_next_plan(
    gym: Gym, clock: Clock, client: AsyncClient
) -> None:
    from tests.training import PLAN  # noqa: PLC0415

    await train(gym, clock, [(EXTENSION, 45, 12)])
    clock.advance(days=7)
    response = await client.post(
        "/api/workouts", json=PLAN | {"name": "Treino 02"}, headers=gym.headers
    )
    new_extension = response.json()["days"][0]["exercises"][2]["id"]
    await client.post(
        f"/api/logs/exercises/{new_extension}/sets",
        json={"weight": 50, "reps": 10},
        headers=gym.headers,
    )

    progress = await gym.get(f"/api/progress/exercises/{gym.ex[EXTENSION]}")
    [extension] = (await gym.get("/api/progress"))["exercises"]

    assert [p["weight"] for p in progress["points"]] == [45.0, 50.0]
    assert extension["exercise_id"] == new_extension  # the one trained last


async def test_calendar(gym: Gym, clock: Clock, db_session: AsyncSession) -> None:
    await db_session.execute(
        update(WorkoutPlan).values(created_at=datetime(2026, 9, 1, 10, tzinfo=UTC))
    )
    await train(gym, clock, [(EXTENSION, 45, 12), (WARMUP_EXTENSION, 20, 20), (SQUAT, 80, 10)])
    clock.advance(days=2)  # Wednesday 30, a planned day not trained yet

    calendar = await gym.get("/api/progress/calendar")

    status = {day["date"]: day["status"] for day in calendar["days"]}
    assert len(status) == 30
    assert status["2026-09-01"] == "rest"  # Tuesday
    # A Wednesday of the plan with no workout: a day off like any other, nothing "missed".
    assert status["2026-09-02"] == "rest"
    assert "missed" not in status.values()
    assert status["2026-09-28"] == "trained"
    assert status["2026-09-29"] == "rest"
    assert status["2026-09-30"] == "today"  # the week's second workout is waiting
    assert calendar["today"] == "2026-09-30"
    assert (calendar["week_streak"], calendar["sessions_total"]) == (1, 1)
    # Two workouts a week since the plan came on 1 September: the weeks of 7, 14 and 21 are
    # whole and had none (this one isn't done yet, so it doesn't count against anything).
    assert calendar["adherence_30d"] == 0
    [monday] = calendar["this_week"]
    assert monday | {"session_id": None} == {
        "session_id": None,
        "date": "2026-09-28",
        "weekday": 0,
        "label": "Quadríceps e Glúteos",
        "duration_seconds": 6 * 60,  # first set to last, unfinished
        "sets": 2,  # warm-up left out
        "exercises_done": 0,
        "exercises_total": 4,
    }
    october = await gym.get("/api/progress/calendar?month=2026-10-15")
    assert october["month"] == "2026-10-01"
    assert {day["status"] for day in october["days"]} == {"future"}


async def test_adherence_counts_workouts_whatever_their_weekday(
    gym: Gym, clock: Clock, db_session: AsyncSession
) -> None:
    await db_session.execute(
        update(WorkoutPlan).values(created_at=datetime(2026, 9, 1, 10, tzinfo=UTC))
    )
    clock.advance(days=-13)  # Tuesday 15 September
    await train(gym, clock, [(EXTENSION, 45, 12)])  # Monday's workout, on a Tuesday
    clock.advance(days=2)  # Thursday 17
    await train(gym, clock, [(ROW, 40, 12)])  # Wednesday's, on a Thursday: the week is whole
    clock.advance(days=6)  # Wednesday 23
    await train(gym, clock, [(ROW, 40, 12)])  # one of two that week
    clock.advance(days=5)  # Monday 28: the plan's day, nothing trained yet

    calendar = await gym.get("/api/progress/calendar")

    # Weeks of 7 (none), 14 (two of two) and 21 (one of two): 3 of 6.
    assert calendar["adherence_30d"] == 3 / 6
    status = {day["date"]: day["status"] for day in calendar["days"]}
    assert (status["2026-09-14"], status["2026-09-15"]) == ("rest", "trained")
    assert status["2026-09-28"] == "today"
    await gym.client.put(f"/api/logs/days/{gym.day(1)}/done", headers=gym.headers)
    await gym.client.put(f"/api/logs/days/{gym.day(0)}/done", headers=gym.headers)
    # Both of this week's on its Monday: the week counts at once (7, 14, 21 and 28: 5 of 8).
    assert (await gym.get("/api/progress/calendar"))["adherence_30d"] == 5 / 8


async def test_a_rest_day_or_a_finished_week_is_not_waiting_for_a_workout(
    gym: Gym, clock: Clock
) -> None:
    await gym.client.put(f"/api/logs/days/{gym.day(0)}/done", headers=gym.headers)
    clock.advance(days=1)  # Tuesday: the other day is Wednesday's

    def today(calendar: dict[str, Any]) -> str:
        return str(next(d["status"] for d in calendar["days"] if d["date"] == calendar["today"]))

    assert today(await gym.get("/api/progress/calendar")) == "rest"
    clock.advance(days=1)
    assert today(await gym.get("/api/progress/calendar")) == "today"
    await gym.client.put(f"/api/logs/days/{gym.day(1)}/done", headers=gym.headers)
    assert today(await gym.get("/api/progress/calendar")) == "trained"
    clock.advance(days=1)  # Thursday: the week is done
    assert today(await gym.get("/api/progress/calendar")) == "rest"


async def test_without_a_plan_there_is_nothing_to_adhere_to(
    client: AsyncClient, clock: Clock
) -> None:
    headers = await signup(client, "novo@example.pt")

    calendar = (await client.get("/api/progress/calendar", headers=headers)).json()

    assert calendar["adherence_30d"] is None
    assert {day["status"] for day in calendar["days"]} <= {"rest", "future"}


async def test_today_is_compared_whatever_weekday_the_workout_is_done_on(
    gym: Gym, clock: Clock
) -> None:
    clock.advance(days=-5)  # Wednesday 23 September
    await train(gym, clock, [(EXTENSION, 45, 12)])  # Monday's workout, that Wednesday
    clock.advance(days=6)  # Tuesday 29: Monday's again, a day late
    weeks = await gym.get("/api/progress/weeks")
    assert weeks["today"]["day_id"] == gym.day(0)  # suggested, nothing lifted yet
    await train(gym, clock, [(EXTENSION, 50, 10)])

    weeks = await gym.get("/api/progress/weeks")

    assert weeks["today"]["day_id"] == gym.day(0)
    [extension, squat] = weeks["today"]["exercises"]
    # Last week's was on another weekday: it is still what today is compared with.
    assert (extension["last_week"], extension["this_week"]) == (45.0, 50.0)
    assert (squat["last_week"], squat["this_week"]) == (None, None)


async def test_no_comparison_when_nothing_is_due_today(gym: Gym, clock: Clock) -> None:
    await gym.client.put(f"/api/logs/days/{gym.day(0)}/done", headers=gym.headers)
    clock.advance(days=1)  # Tuesday, Wednesday's day still ahead

    assert (await gym.get("/api/progress/weeks"))["today"] is None


async def test_a_workout_only_marked_as_done_says_how_much_of_it(gym: Gym) -> None:
    await gym.log(SQUAT, 80, 10)
    session = (
        await gym.client.put(f"/api/logs/days/{gym.day(0)}/done", headers=gym.headers)
    ).json()

    detail = await gym.get(f"/api/progress/sessions/{session['id']}")

    assert (detail["exercises_done"], detail["exercises_total"]) == (4, 4)
    assert (detail["sets"], len(detail["exercises"])) == (1, 1)  # only what was really logged


async def test_week_against_week(gym: Gym, clock: Clock) -> None:
    await train(gym, clock, [(EXTENSION, 45, 12)])  # Monday 28 September
    clock.advance(days=2)
    await train(gym, clock, [(ROW, 40, 12)])  # Wednesday 30
    clock.advance(days=5)
    await train(gym, clock, [(EXTENSION, 50, 10), (SQUAT, 80, 10)])  # Monday 5 October
    clock.advance(days=2)  # Wednesday 7: the row isn't done yet

    weeks = await gym.get("/api/progress/weeks")

    assert (weeks["iso_week"], weeks["last_iso_week"], weeks["until_weekday"]) == (41, 40, 2)
    assert weeks["this_week"] | {"duration_seconds": 0} == {
        "volume": 50 * 10 + 80 * 10, "sets": 2, "duration_seconds": 0,
    }  # fmt: skip
    assert weeks["last_week"]["volume"] == 45 * 12 + 40 * 12
    assert weeks["days"] == [
        {"weekday": 0, "this_week": 1300.0, "last_week": 540.0},
        {"weekday": 2, "this_week": 0.0, "last_week": 480.0},
    ]
    assert weeks["today"] == {
        "day_id": gym.day(1),
        "label": "Costas",
        "exercises": [
            {
                "exercise_id": gym.ex[ROW],
                "name": "Remada Curvada",
                "last_week": 40.0,
                "this_week": None,
            }
        ],
    }


async def test_progress_is_private(gym: Gym, clock: Clock, client: AsyncClient) -> None:
    await train(gym, clock, [(EXTENSION, 45, 12)])
    bob = await signup(client, "bob@example.pt")

    stolen = await client.get(f"/api/progress/exercises/{gym.ex[EXTENSION]}", headers=bob)
    overview: dict[str, Any] = (await client.get("/api/progress", headers=bob)).json()

    assert stolen.status_code == 404
    assert stolen.json()["code"] == "exercise_not_found"
    assert overview["exercises"] == []


@pytest.mark.parametrize("path", ["/api/progress", "/api/progress/calendar", "/api/progress/weeks"])
async def test_progress_needs_a_signed_in_user(client: AsyncClient, path: str) -> None:
    assert (await client.get(path)).status_code == 401
