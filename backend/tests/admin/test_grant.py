"""`python -m app.admin.grant`: the only way an account becomes an administrator."""

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.grant import UsageError, run
from app.logs.service import now
from app.users.models import User
from tests.helpers import signup

OVERVIEW = "/api/admin/overview"


async def test_granting_opens_the_backoffice_and_revoking_closes_it_at_once(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await signup(client, "dona@example.pt")
    assert (await client.get(OVERVIEW, headers=headers)).status_code == 403

    granted = await run(db_session, ["  Dona@Example.pt "])  # as typed, not as stored

    assert granted == "dona@example.pt is now an administrator."
    # The same session, no new sign-in: the next request already gets in.
    assert (await client.get(OVERVIEW, headers=headers)).status_code == 200
    assert (await client.get("/api/users/me", headers=headers)).json()["is_admin"] is True

    revoked = await run(db_session, ["dona@example.pt", "--revoke"])

    assert revoked == "dona@example.pt is no longer an administrator."
    assert (await client.get(OVERVIEW, headers=headers)).status_code == 403


async def test_listing_the_administrators(client: AsyncClient, db_session: AsyncSession) -> None:
    for email in ("dona@example.pt", "bruno@example.pt", "ana@example.pt"):
        await signup(client, email)
    assert await run(db_session, ["--list"]) == "No administrators yet."

    await run(db_session, ["dona@example.pt"])
    await run(db_session, ["ana@example.pt"])

    assert await run(db_session, ["--list"]) == "ana@example.pt\ndona@example.pt"


async def test_an_address_without_an_account_says_what_to_do(db_session: AsyncSession) -> None:
    with pytest.raises(UsageError, match="sign up in the app first"):
        await run(db_session, ["ninguem@example.pt"])


async def test_a_deactivated_account_is_pointed_out(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await signup(client, "dona@example.pt")
    await db_session.execute(update(User).values(deactivated_at=now()))

    assert "can't sign in" in await run(db_session, ["dona@example.pt"])


@pytest.mark.parametrize("args", [[], ["--revoke"], ["a@example.pt", "b@example.pt"], ["--help"]])
async def test_anything_else_prints_the_usage(db_session: AsyncSession, args: list[str]) -> None:
    with pytest.raises(UsageError, match=r"python -m app\.admin\.grant"):
        await run(db_session, args)
