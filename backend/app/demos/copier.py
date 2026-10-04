"""Brings the animations to a server by itself, from the app's lifespan: a new server (or one
whose copy was cut short by a deploy) fetches what it was never able to ask the source for, and
a server that has them all does nothing. ``python -m app.demos.sync`` does the same by hand, and
also asks again for what the source said it didn't have.

While it copies, the linker waits: an exercise linked from half a catalogue would get the
nearest animation there was, not the right one.
"""

import asyncio
import logging

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.storage import Storage
from app.demos import linker, service
from app.demos.source import DemoSource, SourceError

logger = logging.getLogger(__name__)

# The source didn't answer for everything (or at all): how long until the next try.
RETRY_SECONDS = 3600


async def copy_missing(session: AsyncSession, storage: Storage, source: DemoSource) -> bool:
    """One run, if there is anything to fetch. Whether nothing is left to fetch after it."""
    if not await service.to_copy(session):
        return True
    logger.info("Demonstrations: copying the animations this server doesn't have yet")
    linker.hold()
    try:
        copied = await service.sync(session, storage, source, untried_only=True, report=_progress)
    except SourceError as error:
        logger.warning("Demonstrations: the source didn't answer (%s)", error)
        return False
    finally:
        linker.release()
    total, here = await service.counts(session)
    logger.info("Demonstrations: copied %d; %d of %d animations are here", copied, here, total)
    return not await service.to_copy(session)


def _progress(line: str) -> None:
    # The animations the source doesn't have are one line each, 176 of them: not in the log.
    if not (line.startswith("skipped") and "HTTP 404" in line):
        logger.info("Demonstrations: %s", line)


def start(
    sessions: async_sessionmaker[AsyncSession], storage: Storage, source: DemoSource
) -> asyncio.Task[None]:
    """The task for the app's lifespan. The linker is held from here, before either task has
    run, until it is known whether there is anything to copy: it starts at the same moment and
    would otherwise ask its first question from whatever part of the catalogue is here."""
    linker.hold()
    return asyncio.create_task(run(sessions, storage, source))


async def run(
    sessions: async_sessionmaker[AsyncSession], storage: Storage, source: DemoSource
) -> None:
    while True:
        done = False
        try:
            async with sessions() as session:
                done = await copy_missing(session, storage, source)
        except Exception:  # a bad run must not end the trying
            logger.exception("Copying the demonstrations failed")
        finally:
            linker.release()  # between tries, exercises are linked to what there is
        if done:
            return
        await _wait()


async def _wait() -> None:
    await asyncio.sleep(RETRY_SECONDS)
