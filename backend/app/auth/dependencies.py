"""Reusable auth dependencies for every protected router."""

from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth import security, service
from app.auth.errors import NotAuthenticatedError
from app.core.db import SessionDep
from app.users.models import User

_bearer = HTTPBearer(auto_error=False, description="Access token from /api/auth/login")


async def get_current_user(
    session: SessionDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None:
        raise NotAuthenticatedError
    claims = security.decode_access_token(credentials.credentials)
    return await service.authenticate(session, claims)


CurrentUser = Annotated[User, Depends(get_current_user)]
