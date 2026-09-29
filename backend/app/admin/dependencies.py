"""Who may use the backoffice: the accounts listed in ``ADMIN_EMAILS``."""

from typing import Annotated

from fastapi import Depends

from app.auth.dependencies import CurrentUser
from app.core.config import get_settings
from app.core.errors import ForbiddenError
from app.users.models import User


async def get_current_admin(user: CurrentUser) -> User:
    if not get_settings().is_admin(user.email):
        raise ForbiddenError
    return user


CurrentAdmin = Annotated[User, Depends(get_current_admin)]
