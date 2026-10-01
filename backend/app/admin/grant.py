"""Who may open the backoffice (/admin). Run it on the server, in the backend container:

    python -m app.admin.grant you@example.com            make the account an administrator
    python -m app.admin.grant you@example.com --revoke   make it an ordinary account again
    python -m app.admin.grant --list                     the administrators

The account has to exist: sign up in the app first. It takes effect on the next request.
"""

import asyncio
import sys

from sqlalchemy.ext.asyncio import AsyncSession

from app.admin import service
from app.admin.errors import UserNotFoundError
from app.core.db import SessionLocal, engine


class UsageError(Exception):
    """Arguments the command can't make sense of, or an account that doesn't exist."""


async def run(session: AsyncSession, args: list[str]) -> str:
    """What the command answers; raises ``UsageError`` with what to print instead."""
    if args == ["--list"]:
        emails = await service.administrators(session)
        return "\n".join(emails) if emails else "No administrators yet."
    revoke = "--revoke" in args
    emails = [arg for arg in args if arg != "--revoke"]
    if len(emails) != 1 or emails[0].startswith("-"):
        raise UsageError(__doc__)
    try:
        user = await service.set_admin(session, emails[0], admin=not revoke)
    except UserNotFoundError:
        raise UsageError(
            f"No account with the email {emails[0]!r}: sign up in the app first."
        ) from None
    if revoke:
        return f"{user.email} is no longer an administrator."
    note = " (the account is deactivated: it can't sign in)" if user.deactivated_at else ""
    return f"{user.email} is now an administrator{note}."


async def main(args: list[str]) -> None:
    try:
        async with SessionLocal() as session:
            print(await run(session, args))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    try:
        asyncio.run(main(sys.argv[1:]))
    except UsageError as error:
        sys.exit(str(error))
