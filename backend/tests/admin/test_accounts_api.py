"""Closing accounts from the backoffice: deactivating (reversible) and deleting (for good)."""

import re
import uuid
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.files.models import FileKind, StoredFile
from app.logs.models import ExerciseLog, WorkoutSession
from app.notifications.scheduler import run_due
from app.users.models import User
from app.workouts.models import WorkoutPlan
from tests.conftest import FakePushSender, MemoryStorage, Outbox
from tests.helpers import make_admin, signup
from tests.training import MONDAY, Gym

ADMIN = "dona@example.pt"
ATHLETE = "atleta@example.pt"
PASSWORD = "Treino2026!"
SQUAT = "0/3"
DEVICE = {
    "endpoint": "https://push.example/v1/abc",
    "keys": {"p256dh": "BNcRdreALR", "auth": "tBHItJI5sv"},
}


@pytest.fixture
async def admin(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    headers = await signup(client, ADMIN)
    await signup(client, "outra@example.pt")
    for email in (ADMIN, "outra@example.pt"):
        await make_admin(db_session, email)
    return headers


async def account(client: AsyncClient, admin: dict[str, str], email: str) -> dict[str, Any]:
    response = await client.get(f"/api/admin/users?q={email}", headers=admin)
    [found] = response.json()["items"]
    result: dict[str, Any] = found
    return result


async def set_active(
    client: AsyncClient, admin: dict[str, str], email: str, active: bool
) -> dict[str, Any]:
    user_id = (await account(client, admin, email))["id"]
    response = await client.patch(
        f"/api/admin/users/{user_id}", json={"active": active}, headers=admin
    )
    assert response.status_code == 200, response.text
    result: dict[str, Any] = response.json()
    return result


async def login(client: AsyncClient, email: str = ATHLETE, password: str = PASSWORD) -> Any:
    return await client.post("/api/auth/login", json={"email": email, "password": password})


async def test_a_deactivated_account_is_signed_out_and_cannot_sign_in(
    client: AsyncClient, admin: dict[str, str], gym: Gym
) -> None:
    await gym.log(SQUAT, 80, 10)

    deactivated = await set_active(client, admin, ATHLETE, active=False)

    assert deactivated["deactivated_at"] is not None
    # Its data stays, for when it comes back.
    assert (deactivated["plans"], deactivated["workouts"]) == (1, 1)
    me = await client.get("/api/users/me", headers=gym.headers)
    assert (me.status_code, me.json()["code"]) == (401, "token_revoked")
    assert (await client.post("/api/auth/refresh")).status_code == 401
    refused = await login(client)
    assert (refused.status_code, refused.json()["code"]) == (403, "account_disabled")
    # A stranger guessing passwords doesn't learn that the account is deactivated.
    assert (await login(client, password="Errada2026!")).json()["code"] == "invalid_credentials"
    overview = await client.get("/api/admin/overview", headers=admin)
    assert (overview.json()["total_users"], overview.json()["deactivated_users"]) == (3, 1)


async def test_a_reactivated_account_signs_in_again(
    client: AsyncClient, admin: dict[str, str], gym: Gym
) -> None:
    await set_active(client, admin, ATHLETE, active=False)

    reactivated = await set_active(client, admin, ATHLETE, active=True)

    assert reactivated["deactivated_at"] is None
    response = await login(client)
    assert response.status_code == 200
    headers = {"Authorization": f"Bearer {response.json()['access_token']}"}
    plans = await client.get("/api/workouts", headers=headers)
    assert [plan["name"] for plan in plans.json()] == ["Treino 01"]


async def test_deactivating_twice_keeps_the_first_date(
    client: AsyncClient, admin: dict[str, str], gym: Gym
) -> None:
    first = await set_active(client, admin, ATHLETE, active=False)
    again = await set_active(client, admin, ATHLETE, active=False)

    assert again["deactivated_at"] == first["deactivated_at"]


async def test_a_deactivated_account_cannot_reset_its_password(
    client: AsyncClient, admin: dict[str, str], gym: Gym, outbox: Outbox
) -> None:
    await client.post("/api/auth/forgot-password", json={"email": ATHLETE})
    [match] = re.findall(r"#token=(\S+)", outbox.messages[-1].text)
    await set_active(client, admin, ATHLETE, active=False)
    sent = len(outbox.messages)  # the welcomes of each sign-up and the first link

    asked = await client.post("/api/auth/forgot-password", json={"email": ATHLETE})
    reset = await client.post(
        "/api/auth/reset-password", json={"token": match, "password": "NovaPasse#2026"}
    )

    assert asked.status_code < 300  # the same answer as for any email
    assert len(outbox.messages) == sent  # but no second link
    assert reset.json()["code"] == "invalid_reset_token"


async def test_a_deactivated_account_gets_no_health_sync_and_no_reminders(
    client: AsyncClient,
    admin: dict[str, str],
    gym: Gym,
    db_session: AsyncSession,
    push_sender: FakePushSender,
) -> None:
    connection = await client.post("/api/health/connection", headers=gym.headers)
    token = connection.json()["token"]
    await client.post("/api/notifications/subscriptions", json=DEVICE, headers=gym.headers)
    await set_active(client, admin, ATHLETE, active=False)

    sync = await client.post(
        "/api/health/sync", json={}, headers={"Authorization": f"Bearer {token}"}
    )

    assert (sync.status_code, sync.json()["code"]) == (401, "health_token_invalid")
    # 17:40 in Lisbon on a training day: the reminder would be due.
    assert await run_due(db_session, push_sender, MONDAY.replace(hour=16, minute=40)) == 0


async def test_deleting_an_account_removes_everything_it_owns(
    client: AsyncClient,
    admin: dict[str, str],
    gym: Gym,
    db_session: AsyncSession,
    storage: MemoryStorage,
) -> None:
    await gym.log(SQUAT, 80, 10)
    athlete = (await account(client, admin, ATHLETE))["id"]
    key = f"users/{athlete}/workout_pdf/{uuid.uuid4()}"
    await storage.put(key, b"%PDF-1.7", "application/pdf")
    await storage.put("users/someone-else/workout_pdf/1", b"%PDF-1.7", "application/pdf")
    db_session.add(
        StoredFile(
            user_id=uuid.UUID(athlete),
            kind=FileKind.WORKOUT_PDF,
            object_key=key,
            filename="treino.pdf",
            content_type="application/pdf",
            size_bytes=8,
        )
    )
    await db_session.flush()

    response = await client.delete(f"/api/admin/users/{athlete}", headers=admin)

    assert response.status_code == 204
    assert list(storage.objects) == ["users/someone-else/workout_pdf/1"]
    for table in (WorkoutPlan, WorkoutSession, ExerciseLog, StoredFile):
        assert await db_session.scalar(select(func.count()).select_from(table)) == 0
    assert await db_session.scalar(select(User.id).where(User.email == ATHLETE)) is None
    assert (await client.get("/api/users/me", headers=gym.headers)).status_code == 401
    assert (await login(client)).json()["code"] == "invalid_credentials"
    assert (await client.get("/api/admin/users", headers=admin)).json()["total"] == 2
    # The address is free again.
    await signup(client, ATHLETE)


async def test_a_failing_storage_deletes_nothing(
    client: AsyncClient,
    admin: dict[str, str],
    gym: Gym,
    db_session: AsyncSession,
    storage: MemoryStorage,
) -> None:
    athlete = (await account(client, admin, ATHLETE))["id"]
    db_session.add(
        StoredFile(
            user_id=uuid.UUID(athlete),
            kind=FileKind.WORKOUT_PDF,
            object_key="users/x/workout_pdf/1",
            filename="treino.pdf",
            content_type="application/pdf",
            size_bytes=8,
        )
    )
    await db_session.flush()

    async def unavailable(key: str) -> None:
        raise ConnectionError("storage is down")

    storage.delete = unavailable  # type: ignore[method-assign]

    with pytest.raises(ConnectionError):
        await client.delete(f"/api/admin/users/{athlete}", headers=admin)

    assert (await account(client, admin, ATHLETE))["plans"] == 1  # still there, try again


@pytest.mark.parametrize("email", [ADMIN, "outra@example.pt"])
async def test_administrators_are_not_closed_from_the_backoffice(
    client: AsyncClient, admin: dict[str, str], email: str
) -> None:
    found = await account(client, admin, email)
    path = f"/api/admin/users/{found['id']}"

    deactivate = await client.patch(path, json={"active": False}, headers=admin)
    delete = await client.delete(path, headers=admin)

    assert found["is_admin"] is True
    for response in (deactivate, delete):
        assert (response.status_code, response.json()["code"]) == (403, "admin_account_protected")
    assert (await account(client, admin, email))["deactivated_at"] is None


async def test_closing_accounts_is_for_administrators(
    client: AsyncClient, admin: dict[str, str], gym: Gym
) -> None:
    other = await signup(client, "bruno@example.pt")
    athlete = await account(client, admin, ATHLETE)
    path = f"/api/admin/users/{athlete['id']}"

    assert athlete["is_admin"] is False
    assert (await client.delete(path)).status_code == 401
    assert (await client.delete(path, headers=other)).json()["code"] == "forbidden"
    assert (await client.patch(path, json={"active": False}, headers=other)).json()[
        "code"
    ] == "forbidden"
    assert (await client.get("/api/users/me", headers=gym.headers)).status_code == 200


async def test_an_unknown_account(client: AsyncClient, admin: dict[str, str]) -> None:
    path = f"/api/admin/users/{uuid.uuid4()}"

    for response in (
        await client.patch(path, json={"active": False}, headers=admin),
        await client.delete(path, headers=admin),
    ):
        assert (response.status_code, response.json()["code"]) == (404, "user_not_found")
    assert (await client.patch(path, json={}, headers=admin)).status_code == 422
