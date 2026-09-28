import re
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import security
from app.auth.models import RefreshToken
from app.users.models import User
from tests.conftest import Outbox

PASSWORD = "Treino2026!"
COOKIE = "mgt_refresh"


async def register(
    client: AsyncClient, email: str = "Jonata@Example.pt", password: str = PASSWORD, **extra: Any
) -> Response:
    body = {"email": email, "password": password, "name": "Jonata", **extra}
    return await client.post("/api/auth/register", json=body)


async def login(
    client: AsyncClient, email: str = "jonata@example.pt", password: str = PASSWORD, **extra: Any
) -> Response:
    return await client.post(
        "/api/auth/login", json={"email": email, "password": password, **extra}
    )


def bearer(response: Response) -> dict[str, str]:
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def set_cookie_header(response: Response) -> str:
    return response.headers["set-cookie"]


async def refresh_with(client: AsyncClient, token: str) -> Response:
    """Refresh with an explicit cookie value (bypassing the client's cookie jar)."""
    client.cookies.clear()
    return await client.post("/api/auth/refresh", headers={"Cookie": f"{COOKIE}={token}"})


def reset_token_from(outbox: Outbox) -> str:
    match = re.search(r"#token=(\S+)", outbox.messages[-1].text)
    assert match
    return match.group(1)


# --- register ---------------------------------------------------------------------------------


async def test_register_creates_user_signs_in_and_normalises_email(client: AsyncClient) -> None:
    response = await register(client, language="en", timezone="America/Sao_Paulo")

    assert response.status_code == 201
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 15 * 60
    assert body["user"]["email"] == "jonata@example.pt"
    assert body["user"]["language"] == "en"
    assert body["user"]["timezone"] == "America/Sao_Paulo"
    assert "password" not in str(body)
    cookie = set_cookie_header(response)
    assert f"{COOKIE}=" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Path=/api/auth" in cookie


async def test_register_rejects_duplicate_email_case_insensitively(client: AsyncClient) -> None:
    await register(client)

    response = await register(client, email="JONATA@example.pt")

    assert response.status_code == 409
    assert response.json()["code"] == "email_taken"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("password", "short"),
        ("email", "not-an-email"),
        ("timezone", "Mars/Olympus"),
        ("language", "fr"),
        ("name", "   "),
    ],
)
async def test_register_validates_input(client: AsyncClient, field: str, value: str) -> None:
    response = await register(client, **{field: value})

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
    assert response.json()["errors"][0]["loc"] == ["body", field]


# --- login ------------------------------------------------------------------------------------


async def test_login_returns_access_token_and_user(client: AsyncClient) -> None:
    await register(client)

    response = await login(client, email="JONATA@example.pt")

    assert response.status_code == 200
    me = await client.get("/api/users/me", headers=bearer(response))
    assert me.json()["email"] == "jonata@example.pt"


async def test_login_with_remember_sets_a_persistent_cookie(client: AsyncClient) -> None:
    await register(client)

    remembered = await login(client, remember=True)
    session_only = await login(client, remember=False)

    assert "Max-Age=604800" in set_cookie_header(remembered)
    assert "Max-Age" not in set_cookie_header(session_only)


@pytest.mark.parametrize(
    ("email", "password"),
    [("jonata@example.pt", "wrong-password"), ("nobody@example.pt", PASSWORD)],
)
async def test_login_failures_are_indistinguishable(
    client: AsyncClient, email: str, password: str
) -> None:
    await register(client)

    response = await login(client, email=email, password=password)

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid email or password", "code": "invalid_credentials"}


async def test_login_is_rate_limited(client: AsyncClient) -> None:
    for _ in range(10):
        await login(client, password="wrong-password")

    response = await login(client)

    assert response.status_code == 429
    assert response.json()["code"] == "rate_limited"
    assert int(response.headers["Retry-After"]) > 0


# --- protected routes -------------------------------------------------------------------------


async def test_protected_route_requires_a_token(client: AsyncClient) -> None:
    response = await client.get("/api/users/me")

    assert response.status_code == 401
    assert response.json()["code"] == "not_authenticated"
    assert response.headers["WWW-Authenticate"] == "Bearer"


async def test_protected_route_rejects_a_forged_token(client: AsyncClient) -> None:
    response = await client.get("/api/users/me", headers={"Authorization": "Bearer abc.def.ghi"})

    assert response.status_code == 401
    assert response.json()["code"] == "invalid_token"


async def test_protected_route_rejects_an_expired_token(client: AsyncClient) -> None:
    user_id = uuid.UUID((await register(client)).json()["user"]["id"])
    old = security.create_access_token(user_id, now=datetime.now(UTC) - timedelta(minutes=16))

    response = await client.get("/api/users/me", headers={"Authorization": f"Bearer {old.token}"})

    assert response.status_code == 401
    assert response.json()["code"] == "token_expired"


async def test_reset_token_cannot_be_used_as_access_token(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await register(client)
    user = await db_session.scalar(select(User))
    assert user
    reset = security.create_reset_token(user.id, user.password_hash)

    response = await client.get("/api/users/me", headers={"Authorization": f"Bearer {reset}"})

    assert response.status_code == 401
    assert response.json()["code"] == "invalid_token"


# --- refresh ----------------------------------------------------------------------------------


async def test_refresh_rotates_the_token(client: AsyncClient) -> None:
    first = (await register(client)).cookies[COOKIE]

    response = await refresh_with(client, first)

    assert response.status_code == 200
    second = response.cookies[COOKIE]
    assert second != first
    assert (await client.get("/api/users/me", headers=bearer(response))).status_code == 200


async def test_refresh_keeps_the_remember_me_choice(client: AsyncClient) -> None:
    await register(client)
    session_only = (await login(client, remember=False)).cookies[COOKIE]

    response = await refresh_with(client, session_only)

    assert "Max-Age" not in set_cookie_header(response)


async def test_reusing_a_rotated_token_revokes_the_whole_family(client: AsyncClient) -> None:
    first = (await register(client)).cookies[COOKIE]
    second = (await refresh_with(client, first)).cookies[COOKIE]

    reuse = await refresh_with(client, first)
    after = await refresh_with(client, second)

    assert reuse.status_code == 401
    assert reuse.json()["code"] == "refresh_token_reused"
    assert after.status_code == 401  # the legitimate successor died with its family


async def test_refresh_rejects_missing_unknown_and_expired_tokens(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    token = (await register(client)).cookies[COOKIE]
    await db_session.execute(
        update(RefreshToken).values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
    )

    client.cookies.clear()
    missing = await client.post("/api/auth/refresh")
    unknown = await refresh_with(client, "not-a-real-token")
    expired = await refresh_with(client, token)

    for response in (missing, unknown, expired):
        assert response.status_code == 401
        assert response.json()["code"] == "invalid_refresh_token"


# --- logout -----------------------------------------------------------------------------------


async def test_logout_revokes_the_session_and_clears_the_cookie(client: AsyncClient) -> None:
    token = (await register(client)).cookies[COOKIE]

    client.cookies.clear()
    response = await client.post("/api/auth/logout", headers={"Cookie": f"{COOKIE}={token}"})

    assert response.status_code == 204
    assert f'{COOKIE}=""' in set_cookie_header(response)
    assert "Max-Age=0" in set_cookie_header(response)
    assert (await refresh_with(client, token)).status_code == 401


async def test_logout_without_a_session_is_a_no_op(client: AsyncClient) -> None:
    assert (await client.post("/api/auth/logout")).status_code == 204


# --- forgot / reset password ------------------------------------------------------------------


async def test_forgot_password_emails_a_link_in_the_users_language(
    client: AsyncClient, outbox: Outbox
) -> None:
    await register(client, language="en")

    response = await client.post("/api/auth/forgot-password", json={"email": "JONATA@example.pt"})

    assert response.status_code == 202
    [message] = outbox.messages
    assert message.to == "jonata@example.pt"
    assert "Reset your password" in message.subject
    assert "http://localhost:5173/reset-password#token=" in message.text


async def test_forgot_password_does_not_reveal_unknown_emails(
    client: AsyncClient, outbox: Outbox
) -> None:
    response = await client.post("/api/auth/forgot-password", json={"email": "ghost@example.pt"})

    assert response.status_code == 202
    assert outbox.messages == []


async def test_reset_password_flow(client: AsyncClient, outbox: Outbox) -> None:
    old_session = await register(client)
    await client.post("/api/auth/forgot-password", json={"email": "jonata@example.pt"})
    token = reset_token_from(outbox)

    check = await client.post("/api/auth/reset-password/check", json={"token": token})
    reset = await client.post(
        "/api/auth/reset-password", json={"token": token, "password": "NovaPasse#2026"}
    )
    reused = await client.post(
        "/api/auth/reset-password", json={"token": token, "password": "Outra#2026xx"}
    )

    assert check.json() == {"email": "jonata@example.pt"}
    assert reset.status_code == 200
    assert (await client.get("/api/users/me", headers=bearer(reset))).status_code == 200
    # Single use: the password fingerprint in the token no longer matches.
    assert reused.status_code == 400
    assert reused.json()["code"] == "invalid_reset_token"
    # Everything issued before the reset is dead: access token and refresh token.
    stale = await client.get("/api/users/me", headers=bearer(old_session))
    assert stale.json()["code"] == "token_revoked"
    assert (await refresh_with(client, old_session.cookies[COOKIE])).status_code == 401
    assert (await login(client, password=PASSWORD)).status_code == 401
    assert (await login(client, password="NovaPasse#2026")).status_code == 200


async def test_reset_password_rejects_expired_and_garbage_tokens(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await register(client)
    user = await db_session.scalar(select(User))
    assert user
    expired = security.create_reset_token(
        user.id, user.password_hash, now=datetime.now(UTC) - timedelta(minutes=31)
    )

    for token in (expired, "garbage"):
        response = await client.post("/api/auth/reset-password/check", json={"token": token})
        assert response.status_code == 400
        assert response.json()["code"] == "invalid_reset_token"


# --- change password --------------------------------------------------------------------------


async def test_change_password_keeps_this_device_and_signs_out_the_others(
    client: AsyncClient,
) -> None:
    other_device = await register(client)
    this_device = await login(client)
    this_cookie = this_device.cookies[COOKIE]

    client.cookies.clear()
    response = await client.post(
        "/api/auth/change-password",
        json={"current_password": PASSWORD, "new_password": "NovaPasse#2026"},
        headers={**bearer(this_device), "Cookie": f"{COOKIE}={this_cookie}"},
    )

    assert response.status_code == 200
    assert (await client.get("/api/users/me", headers=bearer(response))).status_code == 200
    assert (await client.get("/api/users/me", headers=bearer(this_device))).status_code == 401
    assert (await refresh_with(client, this_cookie)).status_code == 200
    assert (await refresh_with(client, other_device.cookies[COOKIE])).status_code == 401
    assert (await login(client, password="NovaPasse#2026")).status_code == 200


async def test_change_password_requires_the_current_password(client: AsyncClient) -> None:
    session = await register(client)

    response = await client.post(
        "/api/auth/change-password",
        json={"current_password": "wrong-password", "new_password": "NovaPasse#2026"},
        headers=bearer(session),
    )

    assert response.status_code == 400
    assert response.json()["code"] == "invalid_current_password"


async def test_change_password_requires_authentication(client: AsyncClient) -> None:
    response = await client.post(
        "/api/auth/change-password",
        json={"current_password": PASSWORD, "new_password": "NovaPasse#2026"},
    )

    assert response.status_code == 401
