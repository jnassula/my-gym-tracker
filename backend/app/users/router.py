from fastapi import APIRouter

from app.auth.dependencies import CurrentUser
from app.core.db import SessionDep
from app.users import service
from app.users.schemas import UserRead, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me")
async def read_me(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)


@router.patch("/me")
async def update_me(body: UserUpdate, user: CurrentUser, session: SessionDep) -> UserRead:
    """Change the name or a preference (language, time zone, unit, automatic rest)."""
    return UserRead.model_validate(await service.update_user(session, user, body))
