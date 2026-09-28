"""Liveness/readiness probe at ``GET /health`` (not to be confused with the Apple Health domain)."""

import asyncio
import logging
from typing import Literal

from fastapi import APIRouter, Response
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app import __version__
from app.core.db import SessionDep

logger = logging.getLogger(__name__)

CHECK_TIMEOUT_SECONDS = 2.0

ComponentStatus = Literal["ok", "unavailable"]


class HealthStatus(BaseModel):
    status: Literal["ok", "degraded"]
    version: str
    database: ComponentStatus


async def check_database(session: AsyncSession) -> ComponentStatus:
    try:
        async with asyncio.timeout(CHECK_TIMEOUT_SECONDS):
            await session.execute(text("SELECT 1"))
    except (TimeoutError, OSError, SQLAlchemyError):
        logger.warning("Database healthcheck failed", exc_info=True)
        return "unavailable"
    return "ok"


async def check_health(session: AsyncSession) -> HealthStatus:
    database = await check_database(session)
    return HealthStatus(
        status="ok" if database == "ok" else "degraded",
        version=__version__,
        database=database,
    )


router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthStatus)
async def healthcheck(session: SessionDep, response: Response) -> HealthStatus:
    health = await check_health(session)
    if health.status != "ok":
        response.status_code = 503
    return health
