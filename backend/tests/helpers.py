from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


async def signup(client: AsyncClient, email: str = "atleta@example.pt") -> dict[str, str]:
    """Register a user and return its Authorization header."""
    response = await client.post(
        "/api/auth/register",
        json={"email": email, "password": "Treino2026!", "name": "Atleta"},
    )
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def make_admin(session: AsyncSession, email: str) -> None:
    """What `python -m app.admin.grant <email>` does on the server."""
    from app.admin import service  # noqa: PLC0415  # imported after conftest sets the env

    await service.set_admin(session, email, admin=True)
