from collections.abc import AsyncIterator

import pytest
from fastapi import FastAPI, Request
from httpx import ASGITransport, AsyncClient

from app.core.body_limit import BodyLimitMiddleware
from app.core.errors import register_exception_handlers
from app.main import DEFAULT_BODY_BYTES

TOO_LARGE = {"detail": "Request body too large", "code": "payload_too_large"}


def build_app() -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.add_middleware(BodyLimitMiddleware, default=10, limits={("POST", "/upload"): 100})

    @app.post("/note")
    @app.post("/upload")
    async def size(request: Request) -> dict[str, int]:
        return {"size": len(await request.body())}

    return app


@pytest.fixture
async def small() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=build_app())
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def chunks(*parts: bytes) -> AsyncIterator[bytes]:
    """A body sent without saying how long it is."""
    for part in parts:
        yield part


async def test_a_body_within_the_limit_gets_through(small: AsyncClient) -> None:
    response = await small.post("/note", content=b"x" * 10)

    assert response.status_code == 200
    assert response.json() == {"size": 10}


async def test_a_body_over_the_limit_is_refused_by_its_declared_size(small: AsyncClient) -> None:
    response = await small.post("/note", content=b"x" * 11)

    assert response.status_code == 413
    assert response.json() == TOO_LARGE


async def test_a_route_has_the_room_its_payload_needs(small: AsyncClient) -> None:
    assert (await small.post("/upload", content=b"x" * 100)).status_code == 200
    assert (await small.post("/upload", content=b"x" * 101)).status_code == 413


async def test_a_body_of_undeclared_size_is_counted_as_it_arrives(small: AsyncClient) -> None:
    within = await small.post("/note", content=chunks(b"x" * 5, b"x" * 5))
    over = await small.post("/note", content=chunks(b"x" * 6, b"x" * 6))

    assert "content-length" not in over.request.headers
    assert within.json() == {"size": 10}
    assert over.status_code == 413
    assert over.json() == TOO_LARGE


async def test_the_api_refuses_a_large_body_before_asking_who_sends_it(
    client: AsyncClient,
) -> None:
    response = await client.patch("/api/users/me", content=b"x" * (DEFAULT_BODY_BYTES + 1))

    assert response.status_code == 413  # not the 401 a request without a session gets
    assert response.json() == TOO_LARGE


async def test_the_api_gives_a_plan_more_room_than_other_json(client: AsyncClient) -> None:
    body = b"x" * (DEFAULT_BODY_BYTES + 1)

    response = await client.post("/api/workouts", content=body)

    assert response.status_code == 401
