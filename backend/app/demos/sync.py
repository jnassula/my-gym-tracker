"""Brings the demonstrations to this server by hand: the catalogue of ExerciseDB's free dataset
into the database and each exercise's animation into the object storage (see ``source.py`` for
its terms). The backend does this by itself on its first start (``copier``); the command reads
the catalogue again and also asks again for the animations the source didn't have.

    python -m app.demos.sync              everything missing
    python -m app.demos.sync --limit 40   the catalogue and the first 40, to try it
    python -m app.demos.sync --again      all of them once more (a storage restored without them)
"""

import argparse
import asyncio

from app.core.db import SessionLocal, engine
from app.core.storage import ensure_bucket, get_storage
from app.demos import service
from app.demos.source import ExerciseDb


async def main(limit: int | None, again: bool) -> None:
    await ensure_bucket()
    async with SessionLocal() as session:
        copied = await service.sync(
            session, get_storage(), ExerciseDb(), limit=limit, again=again, report=print
        )
        total, here = await service.counts(session)
    await engine.dispose()
    print(f"copied {copied}; {here} of {total} animations are in the storage")


if __name__ == "__main__":
    arguments = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    arguments.add_argument("--limit", type=int, default=None, help="copy at most this many")
    arguments.add_argument("--again", action="store_true", help="copy every animation again")
    chosen = arguments.parse_args()
    asyncio.run(main(chosen.limit, chosen.again))
