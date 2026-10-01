from typing import Annotated

from fastapi import APIRouter, Depends, File, Request, UploadFile

from app.auth.dependencies import CurrentUser
from app.core.db import SessionDep
from app.core.rate_limit import limiter
from app.core.storage import Storage, get_storage
from app.users import service
from app.users.schemas import UserRead, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])

StorageDep = Annotated[Storage, Depends(get_storage)]


@router.get("/me")
async def read_me(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)


@router.patch("/me")
async def update_me(body: UserUpdate, user: CurrentUser, session: SessionDep) -> UserRead:
    """Change the name or a preference (language, time zone, unit, automatic rest)."""
    return UserRead.model_validate(await service.update_user(session, user, body))


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
    """Set or replace the profile photo. Only its owner can read it back."""
    return UserRead.model_validate(await service.set_avatar(session, storage, user, file))


@router.delete("/me/avatar")
async def remove_avatar(user: CurrentUser, session: SessionDep, storage: StorageDep) -> UserRead:
    return UserRead.model_validate(await service.remove_avatar(session, storage, user))
