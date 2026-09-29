from collections.abc import AsyncIterator

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app import __version__
from app.core.config import get_settings
from app.core.db import get_session
from app.main import app
from tests.conftest import MemoryStorage


async def test_health_reports_ok_when_database_is_reachable(client: AsyncClient) -> None:
    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "version": __version__,
        "release": get_settings().app_release,
        "database": "ok",
        "storage": "ok",
    }


async def test_health_returns_503_when_database_is_unreachable(client: AsyncClient) -> None:
    # Port 1 is never a Postgres server: the connection is refused immediately.
    dead_engine = create_async_engine(
        "postgresql+asyncpg://nobody:nothing@127.0.0.1:1/none", poolclass=NullPool
    )

    async def unreachable_session() -> AsyncIterator[AsyncSession]:
        async with AsyncSession(dead_engine) as session:
            yield session

    app.dependency_overrides[get_session] = unreachable_session
    response = await client.get("/health")
    await dead_engine.dispose()

    assert response.status_code == 503
    assert response.json()["status"] == "degraded"
    assert response.json()["database"] == "unavailable"


async def test_health_returns_503_when_storage_is_unreachable(
    client: AsyncClient, storage: MemoryStorage
) -> None:
    storage.available = False

    response = await client.get("/health")

    assert response.status_code == 503
    assert response.json()["storage"] == "unavailable"
    assert response.json()["database"] == "ok"
