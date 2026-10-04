from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Request, Response, UploadFile, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from app.auth.cookies import clear_refresh_cookie
from app.auth.dependencies import CurrentUser, client_key
from app.core.db import SessionDep, utcnow
from app.core.email import Mailer, get_mailer
from app.core.rate_limit import limiter
from app.core.storage import Storage, get_storage
from app.users import export, service
from app.users.schemas import AccountDelete, UserRead, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])

StorageDep = Annotated[Storage, Depends(get_storage)]
MailerDep = Annotated[Mailer, Depends(get_mailer)]


@router.get("/me")
async def read_me(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)


@router.patch("/me")
async def update_me(body: UserUpdate, user: CurrentUser, session: SessionDep) -> UserRead:
    """Change the name or a preference (language, time zone, unit, automatic rest)."""
    return UserRead.model_validate(await service.update_user(session, user, body))


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/hour", key_func=client_key)
async def delete_me(
    request: Request,
    response: Response,
    body: AccountDelete,
    *,
    user: CurrentUser,
    session: SessionDep,
    storage: StorageDep,
    mailer: MailerDep,
    background: BackgroundTasks,
) -> None:
    """Delete one's own account with its plans, workouts, weighings, health data and files.
    Takes the password again; can't be undone."""
    await service.delete_own_account(
        session, storage, user, body.password, mailer=mailer, background=background
    )
    clear_refresh_cookie(response)


@router.get("/me/export")
@limiter.limit("5/hour", key_func=client_key)
async def export_me(request: Request, user: CurrentUser, session: SessionDep) -> JSONResponse:
    """Everything the app holds about the account, as one JSON document to keep."""
    data = await export.export_data(session, user)
    return JSONResponse(
        jsonable_encoder(data),
        headers={"Content-Disposition": f'attachment; filename="{export.file_name(utcnow())}"'},
    )


@router.put("/me/avatar")
@limiter.limit("30/hour")
async def set_avatar(
    request: Request,
    *,
    user: CurrentUser,
    session: SessionDep,
    storage: StorageDep,
    file: Annotated[UploadFile, File(description="Profile photo: JPEG, PNG or WebP, up to 1 MB")],
) -> UserRead:
    """Set or replace the profile photo: kept as a square JPEG of at most 512 px, without
    metadata. Only its owner can read it back."""
    return UserRead.model_validate(await service.set_avatar(session, storage, user, file))


@router.delete("/me/avatar")
async def remove_avatar(user: CurrentUser, session: SessionDep, storage: StorageDep) -> UserRead:
    return UserRead.model_validate(await service.remove_avatar(session, storage, user))
