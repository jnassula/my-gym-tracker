"""Business logic for the auth domain. Routers only map HTTP to these functions.

Sessions are a short-lived JWT access token (kept in memory by the client) plus an opaque
refresh token (httpOnly cookie) stored hashed. Every refresh rotates the token; presenting
an already-rotated token revokes its whole family (theft detection).
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import BackgroundTasks
from sqlalchemy import delete, exists, null, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import passwords, security
from app.auth.emails import (
    account_exists_email,
    confirm_email,
    password_reset_email,
    welcome_email,
)
from app.auth.errors import (
    AccountDisabledError,
    EmailNotVerifiedError,
    EmailTakenError,
    InvalidCredentialsError,
    InvalidCurrentPasswordError,
    InvalidRefreshTokenError,
    InvalidResetTokenError,
    InvalidVerifyTokenError,
    LoginThrottledError,
    RefreshTokenReusedError,
    TokenRevokedError,
)
from app.auth.models import RefreshToken
from app.auth.schemas import RegisterRequest
from app.auth.throttle import LoginThrottle
from app.core.config import get_settings
from app.core.email import EmailMessage, Mailer
from app.files.models import StoredFile
from app.users.models import User
from app.users.service import get_user, get_user_by_email


@dataclass(frozen=True)
class IssuedSession:
    user: User
    access_token: str
    expires_in: int
    refresh_token: str
    persistent: bool


login_throttle = LoginThrottle()
# An account nobody confirmed is deleted after this long: nobody holds an address that isn't
# theirs, and a mistyped one doesn't stay.
UNCONFIRMED_FOR = timedelta(days=7)


def _now() -> datetime:
    return datetime.now(UTC)


async def _issue_session(
    session: AsyncSession,
    user: User,
    *,
    persistent: bool,
    family_id: uuid.UUID | None = None,
    started_at: datetime | None = None,
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
            session_started_at=started_at or now,
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


async def _set_password(user: User, password: str) -> None:
    user.password_hash = await passwords.hash_password(password)
    user.password_changed_at = _now()


# --- public API ------------------------------------------------------------------------------


def _site() -> str:
    return get_settings().frontend_url.rstrip("/")


def _welcome(user: User) -> EmailMessage:
    return welcome_email(
        to=user.email, name=user.name, language=user.language, link=f"{_site()}/workouts/import"
    )


def _confirmation(user: User) -> EmailMessage:
    # Fragment, not query string: it never reaches server logs or Referer headers.
    link = f"{_site()}/verify-email#token={security.create_verify_token(user.id)}"
    return confirm_email(
        to=user.email,
        name=user.name,
        language=user.language,
        link=link,
        hours=int(security.VERIFY_TTL.total_seconds() // 3600),
    )


async def signup(
    session: AsyncSession, data: RegisterRequest, *, mailer: Mailer, background: BackgroundTasks
) -> None:
    """Creates the account, which opens once the link sent to its address is used. Says the
    same, and takes as long, whether or not the address already has an account: its owner is
    told by email instead, so signing up tells nobody which addresses are here."""
    existing = await get_user_by_email(session, data.email)
    # Hashed either way: an address that has an account must not answer faster.
    password_hash = await passwords.hash_password(data.password)
    if existing is None:
        user = User(
            email=data.email,
            password_hash=password_hash,
            name=data.name,
            language=data.language,
            timezone=data.timezone,
            email_verified_at=null(),  # not the column's default: this one is not confirmed
        )
        session.add(user)
        try:
            await session.commit()
        except IntegrityError:  # lost a race with a concurrent sign-up: that one sent the email
            await session.rollback()
            return
        background.add_task(mailer.send, _confirmation(user))
    elif existing.deactivated_at is not None:
        return
    elif existing.email_verified_at is None:
        # Asked again before confirming (the email got lost): the link again. The password of
        # the first sign-up stays, or anyone could set it.
        background.add_task(mailer.send, _confirmation(existing))
    else:
        message = account_exists_email(
            to=existing.email,
            name=existing.name,
            language=existing.language,
            link=f"{_site()}/login",
        )
        background.add_task(mailer.send, message)


async def resend_verification(
    session: AsyncSession, email: str, *, mailer: Mailer, background: BackgroundTasks
) -> None:
    """The confirmation link again, if the address has an account waiting for it. Callers must
    not reveal which case it was."""
    user = await get_user_by_email(session, email)
    if user is None or user.deactivated_at is not None or user.email_verified_at is not None:
        return
    background.add_task(mailer.send, _confirmation(user))


async def verify_email(
    session: AsyncSession, token: str, *, mailer: Mailer, background: BackgroundTasks
) -> IssuedSession:
    """The link in the confirmation email was opened: the account is its address's owner's.
    It signs them in, and works once (a confirmed account is no longer waiting for a link)."""
    user = await get_user(session, security.decode_verify_token(token))
    if user is None or user.deactivated_at is not None or user.email_verified_at is not None:
        raise InvalidVerifyTokenError
    user.email_verified_at = _now()
    issued = await _issue_session(session, user, persistent=True)
    await session.commit()
    background.add_task(mailer.send, _welcome(user))
    return issued


async def register(
    session: AsyncSession, data: RegisterRequest, *, mailer: Mailer, background: BackgroundTasks
) -> IssuedSession:
    """What apps installed before email confirmation still call: the account is usable at once,
    as it was then. Remove with the endpoint, a release after ``signup``."""
    if await get_user_by_email(session, data.email):
        raise EmailTakenError
    user = User(
        email=data.email,
        password_hash=await passwords.hash_password(data.password),
        name=data.name,
        language=data.language,
        timezone=data.timezone,
        email_verified_at=_now(),
    )
    session.add(user)
    try:
        await session.flush()
    except IntegrityError as exc:  # lost a race with a concurrent sign-up
        raise EmailTakenError from exc
    issued = await _issue_session(session, user, persistent=True)
    await session.commit()
    background.add_task(mailer.send, _welcome(user))
    return issued


async def login(
    session: AsyncSession, email: str, password: str, *, remember: bool
) -> IssuedSession:
    if (wait := login_throttle.retry_after(email, _now())) is not None:
        raise LoginThrottledError(wait)
    user = await get_user_by_email(session, email)
    # Always run a hash verification so unknown emails are not faster to reject.
    password_ok, stronger_hash = await passwords.verify(
        password, user.password_hash if user else None
    )
    if user is None or not password_ok:
        login_throttle.failed(email, _now())
        raise InvalidCredentialsError
    login_throttle.succeeded(email)
    if stronger_hash is not None:
        # Hashed with older parameters: stored again with today's. The password didn't change,
        # so nobody is signed out (password_changed_at stays).
        user.password_hash = stronger_hash
    # Only after the right password: strangers don't learn which accounts are deactivated,
    # or still waiting for their confirmation.
    if user.deactivated_at is not None:
        raise AccountDisabledError
    if user.email_verified_at is None:
        raise EmailNotVerifiedError
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
    started_at = token.session_started_at or token.created_at
    if _now() - started_at > timedelta(days=get_settings().session_max_days):
        await _revoke_family(session, token.family_id)
        await session.commit()
        raise InvalidRefreshTokenError
    user = await get_user(session, token.user_id)
    if user is None or user.deactivated_at is not None:
        raise InvalidRefreshTokenError
    token.revoked = True
    issued = await _issue_session(
        session,
        user,
        persistent=token.persistent,
        family_id=token.family_id,
        started_at=started_at,
    )
    await session.commit()
    return issued


async def logout(session: AsyncSession, raw_refresh_token: str | None) -> None:
    token = await _find_refresh_token(session, raw_refresh_token)
    if token is not None:
        await _revoke_family(session, token.family_id)
        await session.commit()


async def forget_expired_sessions(session: AsyncSession) -> None:
    """Expired refresh tokens are no use to anyone, not even to detect reuse. A sign-in clears
    its own account's; this clears everyone's (``janitor`` runs it every hour)."""
    await session.execute(delete(RefreshToken).where(RefreshToken.expires_at < _now()))
    await session.commit()


async def forget_unconfirmed_accounts(session: AsyncSession) -> None:
    """Accounts whose address nobody confirmed in ``UNCONFIRMED_FOR``. They never had a session,
    so they hold nothing; the check on files is only there to never leave an object behind."""
    await session.execute(
        delete(User).where(
            User.email_verified_at.is_(None),
            User.created_at < _now() - UNCONFIRMED_FOR,
            ~exists().where(StoredFile.user_id == User.id),
        )
    )
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
    await _set_password(user, new_password)
    # The link came to the address: that confirms it, for an account that hadn't yet.
    user.email_verified_at = user.email_verified_at or _now()
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
    if not (await passwords.verify(current_password, user.password_hash))[0]:
        raise InvalidCurrentPasswordError
    await _set_password(user, new_password)
    current = await _find_refresh_token(session, raw_refresh_token)
    keep_family = current.family_id if current and current.user_id == user.id else None
    await revoke_all_sessions(session, user.id, except_family=keep_family)
    await session.commit()
    return security.create_access_token(user.id)
