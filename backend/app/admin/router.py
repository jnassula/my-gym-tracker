from typing import Annotated

from fastapi import APIRouter, Query

from app.admin import service
from app.admin.dependencies import CurrentAdmin
from app.admin.schemas import AdminOverview, AdminUsers, Growth, Range
from app.core.db import SessionDep

router = APIRouter(prefix="/admin", tags=["admin"])


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
