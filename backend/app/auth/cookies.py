"""The refresh token's cookie: httpOnly, and sent to the auth endpoints alone."""

from fastapi import Response

from app.core.config import get_settings

REFRESH_COOKIE = "mgt_refresh"
# Only the auth endpoints ever receive the refresh token.
REFRESH_COOKIE_PATH = "/api/auth"


def set_refresh_cookie(response: Response, token: str, *, persistent: bool) -> None:
    settings = get_settings()
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        # No max-age = session cookie, dropped when the browser closes ("remember me" off).
        max_age=settings.refresh_token_ttl_days * 86_400 if persistent else None,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        REFRESH_COOKIE,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=get_settings().cookie_secure,
        samesite="lax",
    )
