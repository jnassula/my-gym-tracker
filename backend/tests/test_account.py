"""Deleting one's own account, and taking one's data away."""

import json
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.files.models import StoredFile
from app.users.models import User
from tests.conftest import MemoryStorage, Outbox
from tests.helpers import make_admin, signup
from tests.test_avatar import picture
from tests.training import Gym, open_gym

PASSWORD = "Treino2026!"  # what tests.helpers.signup registers with


async def delete_account(
    client: AsyncClient, headers: dict[str, str], password: str = PASSWORD
) -> Any:
    return await client.request(
        "DELETE", "/api/users/me", json={"password": password}, headers=headers
    )


async def accounts(db_session: AsyncSession) -> list[str]:
    return list(await db_session.scalars(select(User.email).order_by(User.email)))


async def test_the_owner_deletes_the_account_and_everything_in_it(
    gym: Gym, db_session: AsyncSession, storage: MemoryStorage, outbox: Outbox
) -> None:
    await gym.log("0/2", 45, 12)
    photo = {"file": ("eu.jpg", picture("JPEG", (600, 600)), "image/jpeg")}
    assert (
        await gym.client.put("/api/users/me/avatar", files=photo, headers=gym.headers)
    ).is_success
    assert len(storage.objects) == 1

    response = await delete_account(gym.client, gym.headers)

    assert response.status_code == 204
    assert await accounts(db_session) == []
    assert storage.objects == {}
    assert await db_session.scalar(select(func.count()).select_from(StoredFile)) == 0
    # Signed out everywhere: the access token and the session cookie are both dead.
    assert (await gym.client.get("/api/users/me", headers=gym.headers)).status_code == 401
    assert 'mgt_refresh=""' in response.headers["set-cookie"]
    assert (await gym.client.post("/api/auth/refresh")).status_code == 401


async def test_the_address_is_told_in_its_language(client: AsyncClient, outbox: Outbox) -> None:
    headers = await signup(client)
    await client.patch("/api/users/me", json={"language": "en"}, headers=headers)

    await delete_account(client, headers)

    goodbye = outbox.messages[-1]
    assert goodbye.to == "atleta@example.pt"
    assert "Your account was deleted" in goodbye.subject
    assert "Wasn't you?" in goodbye.text
    assert goodbye.html is not None


async def test_it_takes_the_password_again(
    client: AsyncClient, db_session: AsyncSession, outbox: Outbox
) -> None:
    headers = await signup(client)
    sent = len(outbox.messages)

    response = await delete_account(client, headers, "not-the-password")

    assert response.status_code == 400
    assert response.json()["code"] == "invalid_current_password"
    assert await accounts(db_session) == ["atleta@example.pt"]
    assert len(outbox.messages) == sent
    assert (await client.request("DELETE", "/api/users/me", headers=headers)).status_code == 422
    assert (await client.request("DELETE", "/api/users/me", json={})).status_code == 401


async def test_nobody_elses_account_is_touched(
    client: AsyncClient, db_session: AsyncSession, storage: MemoryStorage
) -> None:
    ana = await open_gym(client, "ana@example.pt")
    rui = await open_gym(client, "rui@example.pt")
    photo = {"file": ("eu.jpg", picture("JPEG", (600, 600)), "image/jpeg")}
    await client.put("/api/users/me/avatar", files=photo, headers=rui.headers)

    assert (await delete_account(client, ana.headers)).status_code == 204

    assert await accounts(db_session) == ["rui@example.pt"]
    assert len(storage.objects) == 1
    assert len(await rui.get("/api/workouts")) == 1


async def test_an_administrator_steps_down_first(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await signup(client)
    await make_admin(db_session, "atleta@example.pt")

    response = await delete_account(client, headers)

    assert response.status_code == 403
    assert response.json()["code"] == "admin_account_protected"
    assert await accounts(db_session) == ["atleta@example.pt"]


async def test_a_failing_storage_deletes_nothing(
    gym: Gym, db_session: AsyncSession, storage: MemoryStorage, outbox: Outbox
) -> None:
    photo = {"file": ("eu.jpg", picture("JPEG", (600, 600)), "image/jpeg")}
    await gym.client.put("/api/users/me/avatar", files=photo, headers=gym.headers)
    sent = len(outbox.messages)

    async def broken(key: str) -> None:
        raise OSError("storage is down")

    storage.delete = broken  # type: ignore[method-assign]

    with pytest.raises(OSError, match="storage is down"):  # a 500 for the browser
        await delete_account(gym.client, gym.headers)

    assert await accounts(db_session) == ["atleta@example.pt"]
    assert len(outbox.messages) == sent  # no goodbye for a deletion that didn't happen


async def test_deleting_is_limited(client: AsyncClient) -> None:
    headers = await signup(client)
    for _ in range(5):
        assert (await delete_account(client, headers, "wrong")).status_code == 400

    assert (await delete_account(client, headers, "wrong")).status_code == 429


# --- taking the data away --------------------------------------------------------------------


async def test_the_export_holds_what_the_account_has(gym: Gym) -> None:
    await gym.log("0/2", 45, 12)
    await gym.log("0/2", 50, 10)
    await gym.client.post("/api/body/measurements", json={"weight": 78.4}, headers=gym.headers)
    await gym.client.post("/api/health/connections/apple_health", headers=gym.headers)

    response = await gym.client.get("/api/users/me/export", headers=gym.headers)

    assert response.status_code == 200
    assert response.headers["content-disposition"].startswith('attachment; filename="mygymtracker-')
    data = response.json()
    assert data["account"]["email"] == "atleta@example.pt"
    [plan] = data["plans"]
    assert plan["name"] == gym.plan["name"]
    assert [day["label"] for day in plan["days"]] == [day["label"] for day in gym.plan["days"]]
    [workout] = data["workouts"]
    assert [(s["weight_kg"], s["reps"]) for s in workout["sets"]] == [(45.0, 12), (50.0, 10)]
    assert workout["sets"][0]["exercise_id"] == gym.ex["0/2"]
    assert [w["weight_kg"] for w in data["weighings"]] == [78.4]
    assert [source["provider"] for source in data["health"]["sources"]] == ["apple_health"]
    assert data["notifications"]["devices"] == 0


async def test_the_export_leaves_out_what_only_the_server_needs(gym: Gym) -> None:
    await gym.client.post("/api/health/connections/apple_health", headers=gym.headers)
    photo = {"file": ("eu.jpg", picture("JPEG", (600, 600)), "image/jpeg")}
    await gym.client.put("/api/users/me/avatar", files=photo, headers=gym.headers)

    text = (await gym.client.get("/api/users/me/export", headers=gym.headers)).text

    assert [file["name"] for file in json.loads(text)["files"]] == ["avatar.jpg"]
    for secret in ("password", "token", "object_key", "users/", "is_admin", "$argon2"):
        assert secret not in text


async def test_the_export_is_the_accounts_own(client: AsyncClient) -> None:
    ana = await open_gym(client, "ana@example.pt")
    rui = await signup(client, "rui@example.pt")
    await ana.log("0/2", 45, 12)

    data = (await client.get("/api/users/me/export", headers=rui)).json()

    assert data["account"]["email"] == "rui@example.pt"
    assert (data["plans"], data["workouts"], data["weighings"], data["files"]) == ([], [], [], [])
    assert (await client.get("/api/users/me/export")).status_code == 401
