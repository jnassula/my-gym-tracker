"""What the application as a whole does with a request, whatever the endpoint."""

from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.main import create_app
from tests.test_config import SAFE_PRODUCTION

DOCS = ("/docs", "/redoc", "/openapi.json")


async def statuses(settings: Settings) -> list[int]:
    transport = ASGITransport(app=create_app(settings))
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return [(await client.get(path)).status_code for path in DOCS]


async def test_production_does_not_hand_out_the_api_description() -> None:
    assert await statuses(Settings(**SAFE_PRODUCTION)) == [404, 404, 404]


async def test_development_serves_the_api_description() -> None:
    development = Settings(**{**SAFE_PRODUCTION, "environment": "development"})

    assert await statuses(development) == [200, 200, 200]


async def test_api_answers_are_never_kept_by_a_cache(client: AsyncClient) -> None:
    refused = await client.get("/api/users/me")
    missing = await client.get("/api/nothing-here")

    assert refused.headers["Cache-Control"] == "no-store"
    assert missing.headers["Cache-Control"] == "no-store"
    assert "Cache-Control" not in (await client.get("/health")).headers
