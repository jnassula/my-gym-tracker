import uuid

import pytest
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

from app.auth import security
from app.auth.errors import InvalidResetTokenError, InvalidTokenError


def test_passwords_are_hashed_with_argon2id_and_verified() -> None:
    hashed = security.hash_password("Treino2026!")

    assert hashed.startswith("$argon2id$")
    assert security.verify_password("Treino2026!", hashed)
    assert not security.verify_password("treino2026!", hashed)


def test_verify_without_a_hash_always_fails() -> None:
    assert not security.verify_password("anything", None)
    assert security.verify_and_update("anything", None) == (False, None)


def test_a_hash_made_with_older_parameters_is_made_again() -> None:
    older = PasswordHash((Argon2Hasher(time_cost=1, memory_cost=1024),)).hash("Treino2026!")

    right, stronger = security.verify_and_update("Treino2026!", older)

    assert right
    assert stronger is not None
    assert stronger != older
    assert security.verify_and_update("Treino2026!", stronger) == (True, None)
    assert security.verify_and_update("treino2026!", older) == (False, None)


def test_access_token_round_trip() -> None:
    user_id = uuid.uuid4()

    claims = security.decode_access_token(security.create_access_token(user_id).token)

    assert claims.user_id == user_id


def test_access_token_signed_with_another_secret_is_rejected() -> None:
    import jwt  # noqa: PLC0415

    forged = jwt.encode(
        {"sub": str(uuid.uuid4()), "typ": "access", "iat": 0, "exp": 9_999_999_999},
        "another-secret-that-is-long-enough-for-hs256",
        algorithm="HS256",
    )

    with pytest.raises(InvalidTokenError):
        security.decode_access_token(forged)


def test_reset_token_is_bound_to_the_password_it_was_issued_for() -> None:
    user_id = uuid.uuid4()
    old_hash = security.hash_password("old-password")
    token = security.create_reset_token(user_id, old_hash)

    claims = security.decode_reset_token(token)

    assert claims.user_id == user_id
    assert claims.fingerprint == security.password_fingerprint(old_hash)
    assert claims.fingerprint != security.password_fingerprint(security.hash_password("new"))


def test_access_token_is_not_a_reset_token() -> None:
    access = security.create_access_token(uuid.uuid4()).token

    with pytest.raises(InvalidResetTokenError):
        security.decode_reset_token(access)


def test_refresh_tokens_are_random_and_stored_hashed() -> None:
    first, second = security.new_refresh_token(), security.new_refresh_token()

    assert first != second
    assert len(security.hash_token(first)) == 64
    assert security.hash_token(first) == security.hash_token(first)
