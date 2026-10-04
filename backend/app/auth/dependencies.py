"""Reusable auth dependencies for every protected router."""

from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from slowapi.util import get_remote_address

from app.auth import security, service
from app.auth.errors import CrossSiteRequestError, NotAuthenticatedError
from app.core.config import get_settings
from app.core.db import SessionDep
from app.core.errors import UnauthorizedError
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


def require_same_origin(request: Request) -> None:
    """For the endpoints that act on the refresh cookie alone: the browser says where a request
    was made from, and only the app's own pages may make these. ``SameSite=Lax`` already keeps
    other sites out; this also keeps out a sibling subdomain, which the cookie doesn't.
    A client that sends neither header (not a browser) has no cookie to be tricked into sending."""
    site = request.headers.get("sec-fetch-site")
    if site is not None:
        if site not in ("same-origin", "none"):
            raise CrossSiteRequestError
        return
    origin = request.headers.get("origin")
    if origin is not None and origin.rstrip("/") != get_settings().frontend_url.rstrip("/"):
        raise CrossSiteRequestError


def client_key(request: Request) -> str:
    """Who a rate limit counts against: the account when the request carries an access token
    this server signed, the address otherwise. A gym's members share its Wi-Fi's address, so
    signed-in requests mustn't share one counter; the signature is what makes the account
    something a client can't pick."""
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() == "bearer" and token:
        try:
            return f"user:{security.decode_access_token(token).user_id}"
        except UnauthorizedError:  # expired or forged: it counts against the address
            pass
    return f"ip:{get_remote_address(request)}"
