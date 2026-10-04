import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from starlette.requests import Request

from app.auth import security
from app.auth.dependencies import client_key
from app.core.rate_limit import GlobalRateLimit
from tests.helpers import signup


def request_with(authorization: str | None = None) -> Request:
    headers = [(b"authorization", authorization.encode())] if authorization else []
    return Request({"type": "http", "headers": headers, "client": ("203.0.113.7", 50000)})


def test_a_signed_in_request_counts_against_its_account() -> None:
    user_id = uuid.uuid4()
    token = security.create_access_token(user_id).token

    assert client_key(request_with(f"Bearer {token}")) == f"user:{user_id}"


@pytest.mark.parametrize(
    "authorization",
    [
        None,
        "Bearer not-a-token",
        "Basic dXNlcjpwYXNz",
        # Signed by this server, but expired: no longer an account's request.
        "Bearer "
        + security.create_access_token(uuid.uuid4(), datetime.now(UTC) - timedelta(hours=1)).token,
    ],
)
def test_anything_else_counts_against_the_address(authorization: str | None) -> None:
    assert client_key(request_with(authorization)) == "ip:203.0.113.7"


def test_a_token_signed_by_someone_else_does_not_pick_an_account() -> None:
    header, payload, _signature = security.create_access_token(uuid.uuid4()).token.split(".")

    assert client_key(request_with(f"Bearer {header}.{payload}.forged")) == "ip:203.0.113.7"


def build_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(GlobalRateLimit, limit="3/minute", prefix="/api/", key=client_key)

    @app.get("/api/a")
    @app.get("/api/b")
    @app.get("/health")
    async def ok() -> dict[str, bool]:
        return {"ok": True}

    return app


@pytest.fixture
async def limited() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=build_app())
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def test_the_ceiling_counts_every_endpoint_together(limited: AsyncClient) -> None:
    for path in ("/api/a", "/api/b", "/api/a"):
        assert (await limited.get(path)).status_code == 200

    response = await limited.get("/api/b")

    assert response.status_code == 429
    assert response.json()["code"] == "rate_limited"
    assert 0 < int(response.headers["Retry-After"]) <= 60


async def test_the_ceiling_is_each_account_s_own(limited: AsyncClient) -> None:
    ana, rui = (
        {"Authorization": f"Bearer {security.create_access_token(uuid.uuid4()).token}"}
        for _ in range(2)
    )
    for _ in range(3):
        await limited.get("/api/a", headers=ana)

    assert (await limited.get("/api/a", headers=ana)).status_code == 429
    assert (await limited.get("/api/a", headers=rui)).status_code == 200
    assert (await limited.get("/api/a")).status_code == 200  # signed out: the address's


async def test_the_ceiling_leaves_the_healthcheck_alone(limited: AsyncClient) -> None:
    for _ in range(5):
        assert (await limited.get("/health")).status_code == 200


async def test_the_api_has_a_ceiling_before_authentication(client: AsyncClient) -> None:
    for _ in range(300):
        await client.get("/api/users/me")

    response = await client.get("/api/users/me")

    assert response.status_code == 429  # not the 401 a request without a session gets
    assert response.json()["code"] == "rate_limited"
    assert (await client.get("/health")).status_code == 200


async def test_a_test_notification_is_limited_per_account(client: AsyncClient) -> None:
    ana = await signup(client, "ana@example.pt")
    rui = await signup(client, "rui@example.pt")
    for _ in range(5):
        assert (await client.post("/api/notifications/test", headers=ana)).status_code == 200

    assert (await client.post("/api/notifications/test", headers=ana)).status_code == 429
    assert (await client.post("/api/notifications/test", headers=rui)).status_code == 200


async def test_a_bridge_s_sync_is_limited(client: AsyncClient) -> None:
    session = await signup(client)
    connection = await client.post("/api/health/connections/apple_health", headers=session)
    bridge = {"Authorization": f"Bearer {connection.json()['token']}"}
    for _ in range(60):
        assert (await client.post("/api/health/sync", json={}, headers=bridge)).status_code == 200

    response = await client.post("/api/health/sync", json={}, headers=bridge)

    assert response.status_code == 429


async def test_a_wrong_bridge_token_only_meets_the_ceiling(client: AsyncClient) -> None:
    """An endpoint's own limit is counted once its caller is known; before that, guesses are
    held by the ceiling alone."""
    for attempt in range(300):
        headers = {"Authorization": f"Bearer guess-{attempt}"}
        assert (await client.post("/api/health/sync", headers=headers)).status_code == 401

    response = await client.post("/api/health/sync", headers={"Authorization": "Bearer guess"})

    assert response.status_code == 429
