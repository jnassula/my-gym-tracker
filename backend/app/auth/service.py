"""Business logic for the auth domain. Routers only map HTTP to these functions.

Sessions are a short-lived JWT access token (kept in memory by the client) plus an opaque
refresh token (httpOnly cookie) stored hashed. Every refresh rotates the token; presenting
an already-rotated token revokes its whole family (theft detection).
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import BackgroundTasks
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import security
from app.auth.emails import password_reset_email, welcome_email
from app.auth.errors import (
    AccountDisabledError,
    EmailTakenError,
    InvalidCredentialsError,
    InvalidCurrentPasswordError,
    InvalidRefreshTokenError,
    InvalidResetTokenError,
    RefreshTokenReusedError,
    TokenRevokedError,
)
from app.auth.models import RefreshToken
from app.auth.schemas import RegisterRequest
from app.core.config import get_settings
from app.core.email import Mailer
from app.users.models import User
from app.users.service import get_user, get_user_by_email


@dataclass(frozen=True)
class IssuedSession:
    user: User
    access_token: str
    expires_in: int
    refresh_token: str
    persistent: bool


def _now() -> datetime:
    return datetime.now(UTC)


async def _issue_session(
    session: AsyncSession,
    user: User,
    *,
    persistent: bool,
    family_id: uuid.UUID | None = None,
) -> IssuedSession:
    now = _now()
    raw_refresh = security.new_refresh_token()
    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=security.hash_token(raw_refresh),
            family_id=family_id or uuid.uuid4(),
            expires_at=now + timedelta(days=get_settings().refresh_token_ttl_days),
            persistent=persistent,
        )
    )
    access = security.create_access_token(user.id, now)
    return IssuedSession(
        user=user,
        access_token=access.token,
        expires_in=access.expires_in,
        refresh_token=raw_refresh,
        persistent=persistent,
    )


async def _revoke_family(session: AsyncSession, family_id: uuid.UUID) -> None:
    await session.execute(
        update(RefreshToken).where(RefreshToken.family_id == family_id).values(revoked=True)
    )


async def revoke_all_sessions(
    session: AsyncSession, user_id: uuid.UUID, *, except_family: uuid.UUID | None = None
) -> None:
    stmt = update(RefreshToken).where(RefreshToken.user_id == user_id).values(revoked=True)
    if except_family is not None:
        stmt = stmt.where(RefreshToken.family_id != except_family)
    await session.execute(stmt)


async def _find_refresh_token(
    session: AsyncSession, raw: str | None, *, for_update: bool = False
) -> RefreshToken | None:
    if not raw:
        return None
    stmt = select(RefreshToken).where(RefreshToken.token_hash == security.hash_token(raw))
    if for_update:
        # Serialises concurrent refreshes of the same token: the loser sees it revoked.
        stmt = stmt.with_for_update()
    return await session.scalar(stmt)


def _set_password(user: User, password: str) -> None:
    user.password_hash = security.hash_password(password)
    user.password_changed_at = _now()


# --- public API ------------------------------------------------------------------------------


async def register(
    session: AsyncSession, data: RegisterRequest, *, mailer: Mailer, background: BackgroundTasks
) -> IssuedSession:
    if await get_user_by_email(session, data.email):
        raise EmailTakenError
    user = User(
        email=data.email,
        password_hash=security.hash_password(data.password),
        name=data.name,
        language=data.language,
        timezone=data.timezone,
    )
    session.add(user)
    try:
        await session.flush()
    except IntegrityError as exc:  # lost a race with a concurrent sign-up
        raise EmailTakenError from exc
    issued = await _issue_session(session, user, persistent=True)
    await session.commit()
    message = welcome_email(
        to=user.email,
        name=user.name,
        language=user.language,
        link=f"{get_settings().frontend_url.rstrip('/')}/workouts/import",
    )
    background.add_task(mailer.send, message)
    return issued


async def login(
    session: AsyncSession, email: str, password: str, *, remember: bool
) -> IssuedSession:
    user = await get_user_by_email(session, email)
    # Always run a hash verification so unknown emails are not faster to reject.
    password_ok = security.verify_password(password, user.password_hash if user else None)
    if user is None or not password_ok:
        raise InvalidCredentialsError
    # Only after the right password: strangers don't learn which accounts are deactivated.
    if user.deactivated_at is not None:
        raise AccountDisabledError
    # Housekeeping: expired tokens are useless, even for reuse detection.
    await session.execute(
        delete(RefreshToken).where(
            RefreshToken.user_id == user.id, RefreshToken.expires_at < _now()
        )
    )
    issued = await _issue_session(session, user, persistent=remember)
    await session.commit()
    return issued


async def refresh(session: AsyncSession, raw_refresh_token: str | None) -> IssuedSession:
    token = await _find_refresh_token(session, raw_refresh_token, for_update=True)
    if token is None or token.expires_at <= _now():
        raise InvalidRefreshTokenError
    if token.revoked:
        await _revoke_family(session, token.family_id)
        await session.commit()
        raise RefreshTokenReusedError
    user = await get_user(session, token.user_id)
    if user is None or user.deactivated_at is not None:
        raise InvalidRefreshTokenError
    token.revoked = True
    issued = await _issue_session(
        session, user, persistent=token.persistent, family_id=token.family_id
    )
    await session.commit()
    return issued


async def logout(session: AsyncSession, raw_refresh_token: str | None) -> None:
    token = await _find_refresh_token(session, raw_refresh_token)
    if token is not None:
        await _revoke_family(session, token.family_id)
        await session.commit()


async def authenticate(session: AsyncSession, claims: security.AccessClaims) -> User:
    """Resolve the user behind a decoded access token (used by ``get_current_user``)."""
    user = await get_user(session, claims.user_id)
    # A deactivated account is signed out at once, not when its access token expires.
    if user is None or user.deactivated_at is not None:
        raise TokenRevokedError
    changed_at = user.password_changed_at
    if changed_at is not None and claims.issued_at < changed_at.timestamp():
        raise TokenRevokedError
    return user


async def request_password_reset(
    session: AsyncSession, email: str, *, mailer: Mailer, background: BackgroundTasks
) -> None:
    """Emails a reset link if the account exists. Callers must not reveal which case it was."""
    user = await get_user_by_email(session, email)
    if user is None or user.deactivated_at is not None:
        return
    settings = get_settings()
    token = security.create_reset_token(user.id, user.password_hash)
    # Fragment, not query string: it never reaches server logs or Referer headers.
    link = f"{settings.frontend_url.rstrip('/')}/reset-password#token={token}"
    message = password_reset_email(
        to=user.email,
        name=user.name,
        language=user.language,
        link=link,
        minutes=settings.password_reset_ttl_minutes,
    )
    background.add_task(mailer.send, message)


async def _user_for_reset_token(session: AsyncSession, token: str) -> User:
    claims = security.decode_reset_token(token)
    user = await get_user(session, claims.user_id)
    if user is None or security.password_fingerprint(user.password_hash) != claims.fingerprint:
        raise InvalidResetTokenError
    if user.deactivated_at is not None:  # a link sent before the account was deactivated
        raise InvalidResetTokenError
    return user


async def check_reset_token(session: AsyncSession, token: str) -> str:
    """Returns the email the link belongs to, so the UI can show it before the user types."""
    user = await _user_for_reset_token(session, token)
    return user.email


async def reset_password(session: AsyncSession, token: str, new_password: str) -> IssuedSession:
    user = await _user_for_reset_token(session, token)
    _set_password(user, new_password)
    await revoke_all_sessions(session, user.id)
    issued = await _issue_session(session, user, persistent=False)
    await session.commit()
    return issued


async def change_password(
    session: AsyncSession,
    user: User,
    *,
    current_password: str,
    new_password: str,
    raw_refresh_token: str | None,
) -> security.AccessToken:
    """Changes the password and signs out every other device.

    The session cookie of the calling device stays valid. Access tokens issued before the
    change are revoked, so a fresh one is returned for this device.
    """
    if not security.verify_password(current_password, user.password_hash):
        raise InvalidCurrentPasswordError
    _set_password(user, new_password)
    current = await _find_refresh_token(session, raw_refresh_token)
    keep_family = current.family_id if current and current.user_id == user.id else None
    await revoke_all_sessions(session, user.id, except_family=keep_family)
    await session.commit()
    return security.create_access_token(user.id)
