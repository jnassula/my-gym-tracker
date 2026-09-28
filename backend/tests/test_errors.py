from collections.abc import AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import BaseModel, Field

from app.core.errors import NotFoundError, register_exception_handlers


class Credentials(BaseModel):
    email: str
    password: str = Field(min_length=8)


def build_app() -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)

    @app.post("/login")
    async def login(credentials: Credentials) -> Credentials:
        return credentials

    @app.get("/plans/{plan_id}")
    async def get_plan(plan_id: int) -> None:
        raise NotFoundError("Plan not found", code="plan_not_found")

    @app.get("/boom")
    async def boom() -> None:
        raise RuntimeError("unexpected")

    return app


@pytest.fixture
async def api() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=build_app(), raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def test_app_error_uses_its_status_detail_and_code(api: AsyncClient) -> None:
    response = await api.get("/plans/1")

    assert response.status_code == 404
    assert response.json() == {"detail": "Plan not found", "code": "plan_not_found"}


async def test_unknown_route_has_consistent_shape(api: AsyncClient) -> None:
    response = await api.get("/nope")

    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found", "code": "not_found"}


async def test_method_not_allowed_has_consistent_shape(api: AsyncClient) -> None:
    response = await api.delete("/login")

    assert response.status_code == 405
    assert response.json()["code"] == "method_not_allowed"


async def test_validation_error_lists_fields_without_echoing_input(api: AsyncClient) -> None:
    response = await api.post("/login", json={"email": "a@b.pt", "password": "hunter2"})

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "validation_error"
    assert body["detail"] == "Invalid request"
    assert [e["loc"] for e in body["errors"]] == [["body", "password"]]
    assert "hunter2" not in response.text


async def test_unhandled_exception_returns_generic_500(api: AsyncClient) -> None:
    response = await api.get("/boom")

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error", "code": "internal_error"}
    assert "unexpected" not in response.text
