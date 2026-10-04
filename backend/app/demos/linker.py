"""Links the exercises of new plans to their animations, from the app's lifespan: every minute,
and at once when a plan is saved (``nudge``). One LLM question per batch of exercises nobody
decided yet, so a name is asked about once, whoever's plan it is in."""

import asyncio
import contextlib
import logging
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.db import utcnow
from app.core.llm import LlmUnavailableError
from app.demos import service
from app.demos.matcher import DemoMatcher

logger = logging.getLogger(__name__)

TICK_SECONDS = 60
# A plan is a handful of muscle groups, each a question: enough rounds to finish one at once.
ROUNDS = 12
# Each question is a paid call: no more than this many a day, whatever the plans created.
MAX_QUESTIONS_PER_DAY = 300

_wake = asyncio.Event()


def nudge() -> None:
    """A plan was saved: don't wait for the next minute."""
    _wake.set()


class _Budget:
    def __init__(self) -> None:
        self.day: date | None = None
        self.asked = 0

    def take(self) -> bool:
        today = utcnow().date()
        if self.day != today:
            self.day, self.asked = today, 0
        if self.asked >= MAX_QUESTIONS_PER_DAY:
            return False
        self.asked += 1
        return True


async def run_forever(sessions: async_sessionmaker[AsyncSession], matcher: DemoMatcher) -> None:
    budget = _Budget()
    while True:
        _wake.clear()
        try:
            for _ in range(ROUNDS):
                if not budget.take():
                    logger.warning("Demonstrations: the day's questions are spent")
                    break
                async with sessions() as session:
                    if not await service.link_pending(session, matcher):
                        budget.asked -= 1  # nothing was asked
                        break
        except LlmUnavailableError as error:
            logger.warning("Demonstrations: the matcher is unavailable (%s)", error)
        except Exception:  # one bad tick must not stop the linking
            logger.exception("Linking demonstrations failed")
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(_wake.wait(), TICK_SECONDS)
