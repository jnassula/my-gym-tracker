"""Pure crypto helpers: password hashing, JWTs and opaque refresh tokens. No I/O here."""

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

import jwt
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

from app.auth.errors import InvalidResetTokenError, InvalidTokenError, TokenExpiredError
from app.core.config import get_settings

JWT_ALGORITHM = "HS256"

_password_hash = PasswordHash((Argon2Hasher(),))
# Verified against when the email is unknown, so login takes the same time either way.
_DUMMY_HASH = _password_hash.hash(secrets.token_urlsafe(16))


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    if password_hash is None:
        _password_hash.verify(password, _DUMMY_HASH)
        return False
    return _password_hash.verify(password, password_hash)


def new_refresh_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _secret() -> str:
    return get_settings().jwt_secret.get_secret_value()


def _encode(claims: dict[str, object]) -> str:
    return jwt.encode(claims, _secret(), algorithm=JWT_ALGORITHM)


def _decode(token: str, token_type: Literal["access", "reset"]) -> dict[str, object]:
    claims = jwt.decode(
        token, _secret(), algorithms=[JWT_ALGORITHM], options={"require": ["sub", "exp", "iat"]}
    )
    if claims.get("typ") != token_type:
        raise jwt.InvalidTokenError("wrong token type")
    return claims


# --- access tokens --------------------------------------------------------------------------


@dataclass(frozen=True)
class AccessToken:
    token: str
    expires_in: int  # seconds


@dataclass(frozen=True)
class AccessClaims:
    user_id: uuid.UUID
    issued_at: float  # epoch seconds, sub-second precision (compared with password_changed_at)


def create_access_token(user_id: uuid.UUID, now: datetime | None = None) -> AccessToken:
    now = now or datetime.now(UTC)
    ttl = timedelta(minutes=get_settings().access_token_ttl_minutes)
    token = _encode(
        {
            "sub": str(user_id),
            "typ": "access",
            # Float iat (allowed by RFC 7519) so a password change in the same second still
            # invalidates tokens issued just before it.
            "iat": now.timestamp(),
            "exp": now + ttl,
        }
    )
    return AccessToken(token=token, expires_in=int(ttl.total_seconds()))


def decode_access_token(token: str) -> AccessClaims:
    try:
        claims = _decode(token, "access")
        return AccessClaims(
            user_id=uuid.UUID(str(claims["sub"])), issued_at=float(str(claims["iat"]))
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenExpiredError from exc
    except (jwt.InvalidTokenError, ValueError) as exc:
        raise InvalidTokenError from exc


# --- password reset tokens ------------------------------------------------------------------


def password_fingerprint(password_hash: str) -> str:
    """Changes whenever the password does, which makes reset tokens single-use."""
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


@dataclass(frozen=True)
class ResetClaims:
    user_id: uuid.UUID
    fingerprint: str


def create_reset_token(user_id: uuid.UUID, password_hash: str, now: datetime | None = None) -> str:
    now = now or datetime.now(UTC)
    ttl = timedelta(minutes=get_settings().password_reset_ttl_minutes)
    return _encode(
        {
            "sub": str(user_id),
            "typ": "reset",
            "fp": password_fingerprint(password_hash),
            "iat": now,
            "exp": now + ttl,
        }
    )


def decode_reset_token(token: str) -> ResetClaims:
    try:
        claims = _decode(token, "reset")
        return ResetClaims(user_id=uuid.UUID(str(claims["sub"])), fingerprint=str(claims["fp"]))
    except (jwt.InvalidTokenError, KeyError, ValueError) as exc:
        raise InvalidResetTokenError from exc
