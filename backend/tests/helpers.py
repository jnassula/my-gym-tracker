from httpx import AsyncClient


async def signup(client: AsyncClient, email: str = "atleta@example.pt") -> dict[str, str]:
    """Register a user and return its Authorization header."""
    response = await client.post(
        "/api/auth/register",
        json={"email": email, "password": "Treino2026!", "name": "Atleta"},
    )
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}
