import uuid
from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.admin import service
from app.admin.dependencies import CurrentAdmin
from app.admin.schemas import (
    AccountStatus,
    AdminOverview,
    AdminUser,
    AdminUsers,
    Growth,
    Range,
)
from app.auth.dependencies import client_key
from app.core.db import SessionDep
from app.core.rate_limit import limiter
from app.core.storage import Storage, get_storage

router = APIRouter(prefix="/admin", tags=["admin"])

StorageDep = Annotated[Storage, Depends(get_storage)]


@router.get("/overview")
async def overview(_: CurrentAdmin, session: SessionDep) -> AdminOverview:
    """Accounts, new and active ones against the period before, and how far accounts got."""
    return await service.overview(session)


@router.get("/growth")
async def growth(admin: CurrentAdmin, session: SessionDep, range: Range = "30d") -> Growth:
    """New, total and active accounts per day ("30d"), week ("12w") or month ("12m")."""
    return await service.growth_series(session, admin, range)


@router.get("/users")
async def users(
    _: CurrentAdmin,
    session: SessionDep,
    q: Annotated[str, Query(max_length=100)] = "",
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AdminUsers:
    """Accounts, newest first; ``q`` searches names and emails."""
    return await service.list_users(session, q.strip(), limit, offset)


@router.patch("/users/{user_id}")
@limiter.limit("30/minute", key_func=client_key)
async def set_status(
    request: Request,
    user_id: uuid.UUID,
    body: AccountStatus,
    admin: CurrentAdmin,
    session: SessionDep,
) -> AdminUser:
    """Deactivate an account (it is signed out and can't sign in; its data stays) or bring it
    back."""
    return await service.set_active(session, admin, user_id, active=body.active)


@router.delete("/users/{user_id}", status_code=HTTPStatus.NO_CONTENT)
@limiter.limit("30/minute", key_func=client_key)
async def delete_user(
    request: Request,
    user_id: uuid.UUID,
    admin: CurrentAdmin,
    session: SessionDep,
    storage: StorageDep,
) -> None:
    """Delete an account with its plans, workouts, PDFs and health data. Can't be undone."""
    await service.delete_user(session, storage, admin, user_id)
