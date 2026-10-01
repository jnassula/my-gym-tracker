"""Who may use the backoffice: the accounts made administrators with ``app.admin.grant``."""

from typing import Annotated

from fastapi import Depends

from app.auth.dependencies import CurrentUser
from app.core.errors import ForbiddenError
from app.users.models import User


async def get_current_admin(user: CurrentUser) -> User:
    # Read from the database on every request: revoking takes effect at once.
    if not user.is_admin:
        raise ForbiddenError
    return user


CurrentAdmin = Annotated[User, Depends(get_current_admin)]
