from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.health.models import HealthConnection
from app.users.models import User
from tests.helpers import signup
from tests.training import Clock, Gym

# The clock starts on Monday 2026-09-28, 18:30 in Lisbon (tests/training.py).
ADMIN = "dona@example.pt"
ENDPOINTS = ["/api/admin/overview", "/api/admin/growth", "/api/admin/users"]
SQUAT = "0/3"


@pytest.fixture
async def admin(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    """The administrator's Authorization header: an account first, listed afterwards."""
    headers = await signup(client, ADMIN)
    monkeypatch.setattr(get_settings(), "admin_emails", "Dona@Example.pt, outra@example.pt")
    return headers


async def joined(session: AsyncSession, email: str, at: datetime, **values: Any) -> None:
    """Moves an account's sign-up to ``at``."""
    await session.execute(update(User).where(User.email == email).values(created_at=at, **values))


async def get(client: AsyncClient, path: str, headers: dict[str, str]) -> Any:
    response = await client.get(path, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize("path", ENDPOINTS)
async def test_the_backoffice_is_for_administrators(client: AsyncClient, path: str) -> None:
    headers = await signup(client)

    assert (await client.get(path)).status_code == 401
    response = await client.get(path, headers=headers)
    assert response.status_code == 403
    assert response.json()["code"] == "forbidden"


async def test_the_account_says_whether_it_is_an_administrator(
    client: AsyncClient, admin: dict[str, str]
) -> None:
    athlete = await signup(client)

    assert (await get(client, "/api/users/me", admin))["is_admin"] is True
    assert (await get(client, "/api/users/me", athlete))["is_admin"] is False


async def test_an_administrators_email_cannot_be_registered(
    client: AsyncClient, admin: dict[str, str]
) -> None:
    response = await client.post(
        "/api/auth/register",
        json={"email": "Outra@example.pt", "password": "Treino2026!", "name": "Outra"},
    )

    assert response.status_code == 409
    assert response.json()["code"] == "email_taken"


async def test_overview(
    client: AsyncClient, admin: dict[str, str], gym: Gym, clock: Clock, db_session: AsyncSession
) -> None:
    await signup(client, "bruno@example.pt")
    await signup(client, "carla@example.pt")
    await joined(db_session, ADMIN, clock.now - timedelta(days=40))
    await joined(db_session, "carla@example.pt", clock.now - timedelta(days=45), language="en")
    await joined(db_session, "bruno@example.pt", clock.now - timedelta(days=10))
    await joined(db_session, "atleta@example.pt", clock.now - timedelta(days=3))
    athlete = await db_session.scalar(select(User.id).where(User.email == "atleta@example.pt"))
    db_session.add(HealthConnection(user_id=athlete, token_hash="a" * 64))
    await db_session.flush()
    clock.advance(days=-7)  # last Monday
    await gym.log(SQUAT, 80, 10)
    clock.advance(days=7)
    await gym.log(SQUAT, 82.5, 8)
    clock.advance(minutes=30)

    overview = await get(client, "/api/admin/overview", admin)

    assert overview == {
        "total_users": 4,
        "deactivated_users": 0,
        "new_users_7d": {"current": 1, "previous": 1},
        "new_users_30d": {"current": 2, "previous": 2},
        "active_users_7d": {"current": 1, "previous": 1},
        "active_users_30d": {"current": 1, "previous": 0},
        "workouts_total": 2,
        "workouts_7d": {"current": 1, "previous": 1},
        "funnel": {"registered": 4, "with_plan": 1, "trained": 1, "active_30d": 1},
        "adoption": {"apple_health": 1, "notifications": 0},
        "languages": [{"language": "pt", "users": 3}, {"language": "en", "users": 1}],
    }


async def test_growth_by_day_in_the_administrators_time_zone(
    client: AsyncClient, admin: dict[str, str], gym: Gym, clock: Clock, db_session: AsyncSession
) -> None:
    await signup(client, "bruno@example.pt")
    await joined(db_session, ADMIN, datetime(2026, 7, 1, 9, tzinfo=UTC))  # before the chart
    # 23:30 UTC on Saturday is already Sunday in Lisbon (UTC+1 in summer).
    await joined(db_session, "bruno@example.pt", datetime(2026, 9, 26, 23, 30, tzinfo=UTC))
    await joined(db_session, "atleta@example.pt", datetime(2026, 9, 28, 8, tzinfo=UTC))
    await gym.log(SQUAT, 80, 10)

    growth = await get(client, "/api/admin/growth", admin)

    assert (growth["range"], growth["unit"], len(growth["points"])) == ("30d", "day", 30)
    assert growth["points"][0] == {
        "start": "2026-08-30",
        "new_users": 0,
        "total_users": 1,
        "active_users": 0,
    }
    assert growth["points"][-3:] == [
        {"start": "2026-09-26", "new_users": 0, "total_users": 1, "active_users": 0},
        {"start": "2026-09-27", "new_users": 1, "total_users": 2, "active_users": 0},
        {"start": "2026-09-28", "new_users": 1, "total_users": 3, "active_users": 1},
    ]


async def test_growth_by_week_and_by_month(
    client: AsyncClient, admin: dict[str, str], gym: Gym, clock: Clock, db_session: AsyncSession
) -> None:
    await joined(db_session, ADMIN, datetime(2025, 3, 10, 9, tzinfo=UTC))  # before both charts
    await joined(db_session, "atleta@example.pt", datetime(2026, 9, 17, 9, tzinfo=UTC))
    clock.advance(days=-5)  # Wednesday 23 September
    await gym.log("1/0", 40, 12)
    clock.advance(days=1)  # the same person, the same week: one active account
    await gym.log(SQUAT, 80, 10)
    clock.advance(days=4)

    weeks = await get(client, "/api/admin/growth?range=12w", admin)
    months = await get(client, "/api/admin/growth?range=12m", admin)

    assert (weeks["unit"], len(weeks["points"])) == ("week", 12)
    assert weeks["points"][0]["start"] == "2026-07-13"
    assert weeks["points"][-3:] == [
        {"start": "2026-09-14", "new_users": 1, "total_users": 2, "active_users": 0},
        {"start": "2026-09-21", "new_users": 0, "total_users": 2, "active_users": 1},
        {"start": "2026-09-28", "new_users": 0, "total_users": 2, "active_users": 0},
    ]
    assert (months["unit"], len(months["points"])) == ("month", 12)
    assert months["points"][0]["start"] == "2025-10-01"
    assert months["points"][-1] == {
        "start": "2026-09-01",
        "new_users": 1,
        "total_users": 2,
        "active_users": 1,
    }


async def test_growth_refuses_an_unknown_range(client: AsyncClient, admin: dict[str, str]) -> None:
    response = await client.get("/api/admin/growth?range=5y", headers=admin)

    assert response.status_code == 422


async def test_accounts_newest_first_with_how_much_they_train(
    client: AsyncClient, admin: dict[str, str], gym: Gym, clock: Clock, db_session: AsyncSession
) -> None:
    await joined(db_session, ADMIN, clock.now - timedelta(days=40))
    await joined(db_session, "atleta@example.pt", clock.now - timedelta(days=3))
    await gym.log(SQUAT, 80, 10)

    accounts = await get(client, "/api/admin/users", admin)

    assert accounts["total"] == 2
    assert [account["email"] for account in accounts["items"]] == ["atleta@example.pt", ADMIN]
    athlete = accounts["items"][0]
    # Account data and counts only: nothing of what the person trains.
    assert set(athlete) == {
        "id",
        "name",
        "email",
        "language",
        "created_at",
        "deactivated_at",
        "is_admin",
        "plans",
        "workouts",
        "last_workout_date",
    }
    assert (athlete["plans"], athlete["workouts"], athlete["last_workout_date"]) == (
        1,
        1,
        "2026-09-28",
    )
    assert (accounts["items"][1]["plans"], accounts["items"][1]["last_workout_date"]) == (0, None)


async def test_accounts_are_searched_and_paged(
    client: AsyncClient, admin: dict[str, str], db_session: AsyncSession
) -> None:
    for days, email in enumerate(["ana@example.pt", "bruno@ginasio.pt", "carla@example.pt"]):
        await signup(client, email)
        await joined(db_session, email, datetime(2026, 9, 1 + days, tzinfo=UTC), name=email[:3])
    await joined(db_session, ADMIN, datetime(2026, 8, 1, tzinfo=UTC))

    async def emails(query: str) -> tuple[int, list[str]]:
        page = await get(client, f"/api/admin/users?{query}", admin)
        return page["total"], [account["email"] for account in page["items"]]

    assert await emails("q=GINASIO") == (1, ["bruno@ginasio.pt"])
    assert await emails("q=car") == (1, ["carla@example.pt"])  # the name
    assert await emails("q=%25") == (0, [])  # a literal "%", not a wildcard
    assert await emails("limit=2") == (4, ["carla@example.pt", "bruno@ginasio.pt"])
    assert await emails("limit=2&offset=2") == (4, ["ana@example.pt", ADMIN])
    assert (await client.get("/api/admin/users?limit=500", headers=admin)).status_code == 422
