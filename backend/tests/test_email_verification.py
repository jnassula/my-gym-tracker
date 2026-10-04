"""Signing up with an address that has to be confirmed before the account opens."""

import re
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from httpx import AsyncClient, Response
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import security, service
from app.users.models import User
from tests.conftest import Outbox
from tests.helpers import signup as register  # what apps from before confirmation call

EMAIL = "ana@example.pt"
PASSWORD = "Treino2026!"
NOTHING = b"null"  # what a 202 without content says


async def sign_up(client: AsyncClient, email: str = EMAIL, password: str = PASSWORD) -> Response:
    body = {"email": email, "password": password, "name": "Ana", "language": "pt"}
    return await client.post("/api/auth/signup", json=body)


async def login(client: AsyncClient, email: str = EMAIL, password: str = PASSWORD) -> Response:
    return await client.post("/api/auth/login", json={"email": email, "password": password})


def token_in(message: Any) -> str:
    match = re.search(r"#token=(\S+)", message.text)
    assert match, message.text
    return match.group(1)


async def confirm(client: AsyncClient, token: str) -> Response:
    return await client.post("/api/auth/verify-email", json={"token": token})


async def users(db_session: AsyncSession) -> list[User]:
    db_session.expire_all()
    return list(await db_session.scalars(select(User).order_by(User.created_at)))


async def test_signing_up_opens_nothing_until_the_address_is_confirmed(
    client: AsyncClient, db_session: AsyncSession, outbox: Outbox
) -> None:
    response = await sign_up(client)

    assert response.status_code == 202
    assert response.content == NOTHING
    assert "set-cookie" not in response.headers
    [user] = await users(db_session)
    assert (user.email, user.email_verified_at) == (EMAIL, None)
    [message] = outbox.messages
    assert message.to == EMAIL
    assert "Confirma o teu email" in message.subject
    assert "/verify-email#token=" in message.text
    assert message.html is not None


async def test_the_link_confirms_the_account_and_signs_in(
    client: AsyncClient, db_session: AsyncSession, outbox: Outbox
) -> None:
    await sign_up(client)

    response = await confirm(client, token_in(outbox.messages[-1]))

    assert response.status_code == 200
    assert response.json()["user"]["email"] == EMAIL
    assert "mgt_refresh=" in response.headers["set-cookie"]
    session = {"Authorization": f"Bearer {response.json()['access_token']}"}
    assert (await client.get("/api/users/me", headers=session)).status_code == 200
    [user] = await users(db_session)
    assert user.email_verified_at is not None
    # Now that the address is its owner's, the welcome goes out.
    assert "conta está pronta" in outbox.messages[-1].subject
    assert (await login(client)).status_code == 200


async def test_the_link_works_once(client: AsyncClient, outbox: Outbox) -> None:
    await sign_up(client)
    token = token_in(outbox.messages[-1])
    assert (await confirm(client, token)).status_code == 200

    again = await confirm(client, token)

    assert again.status_code == 400
    assert again.json()["code"] == "invalid_verify_token"


async def test_an_unconfirmed_account_cannot_sign_in(client: AsyncClient) -> None:
    await sign_up(client)

    refused = await login(client)
    wrong = await login(client, password="not-the-password")

    assert (refused.status_code, refused.json()["code"]) == (403, "email_not_verified")
    # Only the right password is told that much.
    assert (wrong.status_code, wrong.json()["code"]) == (401, "invalid_credentials")


async def test_an_address_that_has_an_account_gets_the_same_answer(
    client: AsyncClient, db_session: AsyncSession, outbox: Outbox
) -> None:
    await register(client, EMAIL)
    sent = len(outbox.messages)

    response = await sign_up(client, password="Another-password-1")

    # Byte for byte what a new address gets.
    assert (response.status_code, response.content) == (202, NOTHING)
    assert "set-cookie" not in response.headers
    assert len(await users(db_session)) == 1
    [notice] = outbox.messages[sent:]
    assert notice.to == EMAIL
    assert "Já tens conta" in notice.subject
    assert "#token=" not in notice.text
    # The account is as it was: its password, not the one just sent.
    assert (await login(client)).status_code == 200
    assert (await login(client, password="Another-password-1")).status_code == 401


async def test_signing_up_again_before_confirming_sends_the_link_again(
    client: AsyncClient, db_session: AsyncSession, outbox: Outbox
) -> None:
    await sign_up(client)

    response = await sign_up(client, password="Another-password-1")

    assert response.status_code == 202
    assert len(await users(db_session)) == 1
    assert len(outbox.messages) == 2
    assert (await confirm(client, token_in(outbox.messages[-1]))).status_code == 200
    # The first sign-up's password stays: a second one can't set it.
    assert (await login(client)).status_code == 200
    assert (await login(client, password="Another-password-1")).status_code == 401


async def test_a_deactivated_account_hears_nothing(
    client: AsyncClient, db_session: AsyncSession, outbox: Outbox
) -> None:
    await register(client, EMAIL)
    await db_session.execute(update(User).values(deactivated_at=datetime.now(UTC)))
    sent = len(outbox.messages)

    assert (await sign_up(client)).status_code == 202
    assert len(outbox.messages) == sent


async def test_the_link_can_be_asked_for_again(client: AsyncClient, outbox: Outbox) -> None:
    await sign_up(client)
    await register(client, "confirmada@example.pt")
    sent = len(outbox.messages)

    answers = [
        await client.post("/api/auth/verify-email/resend", json={"email": email})
        for email in (EMAIL, "confirmada@example.pt", "ninguem@example.pt")
    ]

    assert [answer.status_code for answer in answers] == [202, 202, 202]
    [again] = outbox.messages[sent:]  # only the account that is waiting for one
    assert again.to == EMAIL
    assert (await confirm(client, token_in(again))).status_code == 200


async def test_only_a_confirmation_link_confirms(
    client: AsyncClient, db_session: AsyncSession, outbox: Outbox
) -> None:
    await sign_up(client)
    [user] = await users(db_session)
    expired = security.create_verify_token(user.id, datetime.now(UTC) - timedelta(hours=25))
    for token in (
        "not-a-token",
        expired,
        security.create_reset_token(user.id, user.password_hash),
        security.create_access_token(user.id).token,
        security.create_verify_token(uuid.uuid4()),  # nobody's
    ):
        response = await confirm(client, token)
        assert (response.status_code, response.json()["code"]) == (400, "invalid_verify_token")

    assert (await users(db_session))[0].email_verified_at is None


async def test_recovering_the_password_confirms_the_address_too(
    client: AsyncClient, db_session: AsyncSession, outbox: Outbox
) -> None:
    await sign_up(client)
    await client.post("/api/auth/forgot-password", json={"email": EMAIL})

    response = await client.post(
        "/api/auth/reset-password",
        json={"token": token_in(outbox.messages[-1]), "password": "A-new-password-1"},
    )

    assert response.status_code == 200
    assert (await users(db_session))[0].email_verified_at is not None
    assert (await login(client, password="A-new-password-1")).status_code == 200


async def test_accounts_nobody_confirmed_are_deleted_after_a_week(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await sign_up(client, "esquecida@example.pt")
    await sign_up(client, "recente@example.pt")
    await register(client, "confirmada@example.pt")
    old = datetime.now(UTC) - service.UNCONFIRMED_FOR - timedelta(hours=1)
    await db_session.execute(
        update(User)
        .where(User.email.in_(["esquecida@example.pt", "confirmada@example.pt"]))
        .values(created_at=old)
    )

    await service.forget_unconfirmed_accounts(db_session)

    assert sorted(user.email for user in await users(db_session)) == [
        "confirmada@example.pt",
        "recente@example.pt",
    ]


async def test_apps_from_before_confirmation_still_register(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    session = await register(client, EMAIL)

    assert (await client.get("/api/users/me", headers=session)).status_code == 200
    assert (await users(db_session))[0].email_verified_at is not None
    assert (await login(client)).status_code == 200


async def test_an_account_written_by_the_previous_release_counts_as_confirmed(
    db_session: AsyncSession,
) -> None:
    """After a rollback the old code creates accounts without knowing the column."""
    await db_session.execute(
        text(
            "INSERT INTO users (id, email, password_hash, name)"
            " VALUES (gen_random_uuid(), 'antiga@example.pt', 'x', 'Antiga')"
        )
    )

    [user] = await users(db_session)
    assert user.email_verified_at is not None


async def test_signing_up_is_limited(client: AsyncClient) -> None:
    for number in range(10):
        assert (await sign_up(client, f"conta{number}@example.pt")).status_code == 202

    assert (await sign_up(client, "mais-uma@example.pt")).status_code == 429
