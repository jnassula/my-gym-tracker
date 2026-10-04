"""Hashing and checking passwords from async code.

argon2 takes tens of milliseconds and 64 MiB each time: it runs in a thread, a few at once, so a
burst of sign-ins neither stalls every other request nor takes the memory. Never call
``security.hash_password`` or ``verify_and_update`` straight from a coroutine.
"""

import asyncio

from app.auth import security

_hashing = asyncio.Semaphore(4)


async def hash_password(password: str) -> str:
    async with _hashing:
        return await asyncio.to_thread(security.hash_password, password)


async def verify(password: str, password_hash: str | None) -> tuple[bool, str | None]:
    """Whether the password is right, and the hash to store instead when the one given was made
    with older parameters."""
    async with _hashing:
        return await asyncio.to_thread(security.verify_and_update, password, password_hash)
