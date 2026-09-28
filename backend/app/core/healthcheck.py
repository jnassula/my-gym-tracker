"""Liveness/readiness probe at ``GET /health`` (not to be confused with the Apple Health domain)."""

import asyncio
import logging
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app import __version__
from app.core.db import SessionDep
from app.core.storage import Storage, get_storage

logger = logging.getLogger(__name__)

CHECK_TIMEOUT_SECONDS = 2.0

ComponentStatus = Literal["ok", "unavailable"]


class HealthStatus(BaseModel):
    status: Literal["ok", "degraded"]
    version: str
    database: ComponentStatus
    storage: ComponentStatus


async def check_database(session: AsyncSession) -> ComponentStatus:
    try:
        async with asyncio.timeout(CHECK_TIMEOUT_SECONDS):
            await session.execute(text("SELECT 1"))
    except (TimeoutError, OSError, SQLAlchemyError):
        logger.warning("Database healthcheck failed", exc_info=True)
        return "unavailable"
    return "ok"


async def check_storage(storage: Storage) -> ComponentStatus:
    try:
        async with asyncio.timeout(CHECK_TIMEOUT_SECONDS):
            return "ok" if await storage.ping() else "unavailable"
    except TimeoutError:
        return "unavailable"


async def check_health(session: AsyncSession, storage: Storage) -> HealthStatus:
    database, storage_status = await asyncio.gather(check_database(session), check_storage(storage))
    return HealthStatus(
        status="ok" if database == storage_status == "ok" else "degraded",
        version=__version__,
        database=database,
        storage=storage_status,
    )


router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthStatus)
async def healthcheck(
    session: SessionDep,
    storage: Annotated[Storage, Depends(get_storage)],
    response: Response,
) -> HealthStatus:
    health = await check_health(session, storage)
    if health.status != "ok":
        response.status_code = 503
    return health
