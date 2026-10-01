"""Runs ``service.sweep`` every minute from the app's lifespan."""

import asyncio
import logging

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.health import service

logger = logging.getLogger(__name__)

TICK_SECONDS = 60


async def run_forever(sessions: async_sessionmaker[AsyncSession]) -> None:
    while True:
        try:
            async with sessions() as session:
                await service.sweep(session)
        except Exception:  # one bad tick must not stop the sweeps
            logger.exception("Health samples sweep failed")
        await asyncio.sleep(TICK_SECONDS)
