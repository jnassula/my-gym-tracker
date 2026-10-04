"""Runs the auth housekeeping every hour from the app's lifespan: expired sessions and
accounts nobody confirmed."""

import asyncio
import logging

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.auth import service

logger = logging.getLogger(__name__)

TICK_SECONDS = 3600


async def run_forever(sessions: async_sessionmaker[AsyncSession]) -> None:
    while True:
        try:
            async with sessions() as session:
                await service.forget_expired_sessions(session)
                await service.forget_unconfirmed_accounts(session)
        except Exception:  # one bad tick must not stop the housekeeping
            logger.exception("Auth housekeeping failed")
        await asyncio.sleep(TICK_SECONDS)
