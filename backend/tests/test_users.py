from typing import Any

import pytest
from httpx import AsyncClient

from tests.helpers import signup


async def test_preferences_can_be_changed(client: AsyncClient) -> None:
    headers = await signup(client)
    me = (await client.get("/api/users/me", headers=headers)).json()
    assert (me["language"], me["unit"], me["timezone"], me["auto_rest"]) == (
        "pt",
        "kg",
        "Europe/Lisbon",
        True,
    )

    response = await client.patch(
        "/api/users/me",
        json={"language": "en", "unit": "lb", "timezone": "America/Sao_Paulo", "auto_rest": False},
        headers=headers,
    )

    assert response.status_code == 200
    updated = (await client.get("/api/users/me", headers=headers)).json()
    assert updated == response.json()
    assert (updated["language"], updated["unit"], updated["timezone"], updated["auto_rest"]) == (
        "en",
        "lb",
        "America/Sao_Paulo",
        False,
    )


async def test_only_the_fields_sent_change(client: AsyncClient) -> None:
    headers = await signup(client)

    response = await client.patch("/api/users/me", json={"name": "  Jonata  "}, headers=headers)

    assert (response.json()["name"], response.json()["unit"]) == ("Jonata", "kg")


@pytest.mark.parametrize(
    "body",
    [{}, {"unit": None}, {"timezone": "Mars/Olympus"}, {"language": "fr"}, {"name": "   "},
     {"unit": "stone"}],
)  # fmt: skip
async def test_preferences_are_validated(client: AsyncClient, body: dict[str, Any]) -> None:
    headers = await signup(client)

    response = await client.patch("/api/users/me", json=body, headers=headers)

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


async def test_changing_preferences_needs_a_session(client: AsyncClient) -> None:
    assert (await client.patch("/api/users/me", json={"unit": "lb"})).status_code == 401
