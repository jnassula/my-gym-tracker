from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Cookie, Depends, Request, Response, status

from app.auth import service
from app.auth.cookies import REFRESH_COOKIE, clear_refresh_cookie, set_refresh_cookie
from app.auth.dependencies import CurrentUser, require_same_origin
from app.auth.schemas import (
    AccessTokenResponse,
    AuthResponse,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    ResetTokenInfo,
    ResetTokenRequest,
)
from app.core.db import SessionDep
from app.core.email import Mailer, get_mailer
from app.core.rate_limit import limiter
from app.users.schemas import UserRead

router = APIRouter(prefix="/auth", tags=["auth"])

RefreshCookie = Annotated[str | None, Cookie(alias=REFRESH_COOKIE)]
MailerDep = Annotated[Mailer, Depends(get_mailer)]


def _start_session(response: Response, issued: service.IssuedSession) -> AuthResponse:
    set_refresh_cookie(response, issued.refresh_token, persistent=issued.persistent)
    return AuthResponse(
        access_token=issued.access_token,
        expires_in=issued.expires_in,
        user=UserRead.model_validate(issued.user),
    )


@router.post("/register", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(
    request: Request,
    response: Response,
    body: RegisterRequest,
    session: SessionDep,
    *,
    mailer: MailerDep,
    background: BackgroundTasks,
) -> AuthResponse:
    issued = await service.register(session, body, mailer=mailer, background=background)
    return _start_session(response, issued)


@router.post("/login")
@limiter.limit("10/minute;50/hour")
async def login(
    request: Request, response: Response, body: LoginRequest, session: SessionDep
) -> AuthResponse:
    issued = await service.login(session, body.email, body.password, remember=body.remember)
    return _start_session(response, issued)


@router.post("/refresh", dependencies=[Depends(require_same_origin)])
@limiter.limit("30/minute")
async def refresh(
    request: Request, response: Response, session: SessionDep, refresh_token: RefreshCookie = None
) -> AuthResponse:
    return _start_session(response, await service.refresh(session, refresh_token))


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_same_origin)],
)
@limiter.limit("30/minute")
async def logout(
    request: Request, response: Response, session: SessionDep, refresh_token: RefreshCookie = None
) -> None:
    await service.logout(session, refresh_token)
    clear_refresh_cookie(response)


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("5 per 15 minutes")
async def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    session: SessionDep,
    mailer: MailerDep,
    background: BackgroundTasks,
) -> None:
    """Always 202, whether or not the email has an account (no user enumeration)."""
    await service.request_password_reset(session, body.email, mailer=mailer, background=background)


@router.post("/reset-password/check")
@limiter.limit("10/minute")
async def check_reset_token(
    request: Request, body: ResetTokenRequest, session: SessionDep
) -> ResetTokenInfo:
    return ResetTokenInfo(email=await service.check_reset_token(session, body.token))


@router.post("/reset-password")
@limiter.limit("10/minute")
async def reset_password(
    request: Request, response: Response, body: ResetPasswordRequest, session: SessionDep
) -> AuthResponse:
    issued = await service.reset_password(session, body.token, body.password)
    return _start_session(response, issued)


@router.post("/change-password")
@limiter.limit("10/minute")
async def change_password(
    request: Request,
    body: ChangePasswordRequest,
    user: CurrentUser,
    session: SessionDep,
    refresh_token: RefreshCookie = None,
) -> AccessTokenResponse:
    access = await service.change_password(
        session,
        user,
        current_password=body.current_password,
        new_password=body.new_password,
        raw_refresh_token=refresh_token,
    )
    return AccessTokenResponse(access_token=access.token, expires_in=access.expires_in)
