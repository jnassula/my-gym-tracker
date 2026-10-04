"""Where the animations come from: ExerciseDB's free dataset (V1), by AscendAPI.

Its terms (the "Usage Restrictions" of https://oss.exercisedb.dev): free for personal and
non-commercial apps, with credit to AscendAPI, in 180 px GIFs; not for a monetised product
without a paid plan. Its endpoints are for exploring the data, not for a live app to lean on:
so the catalogue and the GIFs are copied once into our own database and storage (``sync``),
slowly, and the app never calls them again.
"""

import asyncio
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from http import HTTPStatus
from typing import Protocol

API = "https://oss.exercisedb.dev/api/v1/exercises"
MEDIA = "https://static.exercisedb.dev/media/"
PAGE_SIZE = 25  # the most the API gives at once
# One request a second for the catalogue's pages, a few a second for the files.
PAGE_PAUSE = 1.0
GIF_PAUSE = 0.25
RETRIES = 5
MAX_GIF_BYTES = 2 * 1024 * 1024  # they are about 100 KB
USER_AGENT = "myGymTracker demo sync"
_ID = re.compile(r"^[A-Za-z0-9]{4,32}$")


class SourceError(Exception):
    """The source answered something that isn't the catalogue or an animation."""


@dataclass(frozen=True)
class SourceExercise:
    id: str
    name: str
    body_parts: list[str]
    equipments: list[str]
    target_muscles: list[str]


class DemoSource(Protocol):
    async def catalogue(self) -> list[SourceExercise]: ...
    async def gif(self, demo_id: str) -> bytes: ...


def _get(url: str) -> bytes:
    """A GET of one of the two addresses above, patient with the source's rate limit."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})  # noqa: S310
    for attempt in range(1, RETRIES + 1):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:  # noqa: S310
                return bytes(response.read(MAX_GIF_BYTES + 1))
        except urllib.error.HTTPError as error:
            if error.code != HTTPStatus.TOO_MANY_REQUESTS or attempt == RETRIES:
                raise SourceError(f"{url}: HTTP {error.code}") from error
            time.sleep(15 * attempt)  # its own pace, when it says so (this runs in a thread)
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt == RETRIES:
                raise SourceError(f"{url}: {error}") from error
    raise SourceError(url)


def _strings(value: object) -> list[str]:
    return [str(item)[:60] for item in value] if isinstance(value, list) else []


class ExerciseDb:
    async def catalogue(self) -> list[SourceExercise]:
        exercises: list[SourceExercise] = []
        cursor: str | None = None
        while True:
            query = {"limit": PAGE_SIZE} | ({"after": cursor} if cursor else {})
            body = await asyncio.to_thread(_get, f"{API}?{urllib.parse.urlencode(query)}")
            try:
                page = json.loads(body)
                items, meta = page["data"], page["meta"]
            except (ValueError, KeyError, TypeError) as error:
                raise SourceError("The catalogue isn't in the shape expected") from error
            for item in items:
                demo_id = str(item.get("exerciseId", ""))
                if _ID.match(demo_id) and item.get("name"):
                    exercises.append(
                        SourceExercise(
                            id=demo_id,
                            name=str(item["name"])[:200],
                            body_parts=_strings(item.get("bodyParts")),
                            equipments=_strings(item.get("equipments")),
                            target_muscles=_strings(item.get("targetMuscles")),
                        )
                    )
            if not meta.get("hasNextPage") or not meta.get("nextCursor"):
                return exercises
            cursor = str(meta["nextCursor"])
            await asyncio.sleep(PAGE_PAUSE)

    async def gif(self, demo_id: str) -> bytes:
        if not _ID.match(demo_id):
            raise SourceError(f"Not an id of the source: {demo_id!r}")
        data = await asyncio.to_thread(_get, f"{MEDIA}{demo_id}.gif")
        if not data.startswith(b"GIF8") or len(data) > MAX_GIF_BYTES:
            raise SourceError(f"{demo_id}: not a GIF of a size we take")
        await asyncio.sleep(GIF_PAUSE)
        return data
