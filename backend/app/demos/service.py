"""Business logic of the demonstrations: the catalogue and its animations, and which of them
shows each exercise of the plans there are.

Read-only for users, and nothing here is theirs: the catalogue is one for everyone, and a link
is keyed by an exercise's name and group, so the same exercise in another plan (or another
account) is already linked.
"""

import logging
import uuid
from collections import Counter
from collections.abc import Callable

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import Storage
from app.demos.errors import DemoNotFoundError
from app.demos.matcher import BATCH, DemoMatcher, MatchExercise
from app.demos.models import ExerciseDemo, ExerciseDemoLink
from app.demos.source import DemoSource, SourceError
from app.exercises.key import ExerciseKey, exercise_key
from app.exercises.models import Exercise, MuscleGroup
from app.logs import service as logs
from app.users.models import User
from app.workouts.models import WorkoutDay, WorkoutPlan

logger = logging.getLogger(__name__)

GIF_TYPE = "image/gif"


def object_key(demo_id: str) -> str:
    return f"demos/{demo_id}.gif"


def _group(group: MuscleGroup | None) -> str:
    return group.value if group else ""


# --- the catalogue and its animations ----------------------------------------------------------


async def sync(
    session: AsyncSession,
    storage: Storage,
    source: DemoSource,
    *,
    limit: int | None = None,
    again: bool = False,
    report: Callable[[str], None] = lambda _line: None,
) -> int:
    """Copies the source's catalogue into the database and the animations still missing into
    the object storage; how many were copied. Safe to run again: it goes on from where it
    stopped, and an animation the source refuses is left for the next run. A run that brought
    new animations has every exercise linked again. ``again`` copies them all once more, for
    a storage that lost them (restored from a backup without them)."""
    catalogue = await source.catalogue()
    for exercise in catalogue:
        row = insert(ExerciseDemo).values(
            id=exercise.id,
            name=exercise.name,
            body_parts=exercise.body_parts,
            equipments=exercise.equipments,
            target_muscles=exercise.target_muscles,
        )
        await session.execute(
            row.on_conflict_do_update(
                index_elements=["id"],
                set_={
                    key: row.excluded[key]
                    for key in ("name", "body_parts", "equipments", "target_muscles")
                },
            )
        )
    if again:
        await session.execute(update(ExerciseDemo).values(size_bytes=None))
    await session.commit()
    report(f"catalogue: {len(catalogue)} exercises")

    missing = list(
        await session.scalars(
            select(ExerciseDemo)
            .where(ExerciseDemo.size_bytes.is_(None))
            .order_by(ExerciseDemo.id)
            .limit(limit)
        )
    )
    copied = 0
    for number, demo in enumerate(missing, 1):
        try:
            data = await source.gif(demo.id)
        except SourceError as error:
            report(f"skipped {demo.id}: {error}")
            continue
        await storage.put(object_key(demo.id), data, GIF_TYPE)
        demo.size_bytes = len(data)
        await session.commit()  # one at a time: an interrupted run keeps what it copied
        copied += 1
        if number % 50 == 0 or number == len(missing):
            report(f"animations: {number}/{len(missing)}")
    if copied:
        # What was decided meanwhile was chosen from a smaller catalogue (the linker runs while
        # the copy does): every exercise is asked about again, with all of it to choose from.
        await session.execute(delete(ExerciseDemoLink))
        await session.commit()
    return copied


async def read_gif(session: AsyncSession, storage: Storage, demo_id: str) -> bytes:
    demo = await session.get(ExerciseDemo, demo_id)
    if demo is None or demo.size_bytes is None:
        raise DemoNotFoundError
    return await storage.get(object_key(demo.id))


# --- which animation shows an exercise ----------------------------------------------------------


async def _pending(session: AsyncSession) -> list[ExerciseKey]:
    """The exercises of the plans there are (not the deleted ones) that nobody decided yet.
    Compared in Python, by the same key the rest of the app uses: the database's own lower()
    need not agree with it on accented letters."""
    rows = await session.execute(
        select(Exercise.name, Exercise.muscle_group)
        .join(WorkoutDay, Exercise.day_id == WorkoutDay.id)
        .join(WorkoutPlan, WorkoutDay.plan_id == WorkoutPlan.id)
        .where(WorkoutPlan.deleted_at.is_(None))
        .distinct()
    )
    keys = {exercise_key(name, group) for name, group in rows}
    decided = {
        (row.name, row.muscle_group)
        for row in await session.execute(
            select(ExerciseDemoLink.name, ExerciseDemoLink.muscle_group)
        )
    }
    return sorted(
        (key for key in keys if (key[0], _group(key[1])) not in decided),
        key=lambda key: (_group(key[1]), key[0]),
    )


async def link_pending(session: AsyncSession, matcher: DemoMatcher) -> int:
    """Decides one batch of the exercises still waiting for an animation, and says how many it
    decided (0: nothing waits, or there is no catalogue to choose from yet, in which case they
    go on waiting). Raises ``LlmUnavailableError``: the batch waits for the next call."""
    catalogue = {
        demo_id: name
        for demo_id, name in await session.execute(
            select(ExerciseDemo.id, ExerciseDemo.name).where(ExerciseDemo.size_bytes.is_not(None))
        )
    }
    if not catalogue:
        return 0
    pending = await _pending(session)
    if not pending:
        return 0
    # One muscle group at a time, the one with most waiting: a question about like exercises.
    group = Counter(key[1] for key in pending).most_common(1)[0][0]
    batch = [key for key in pending if key[1] == group][:BATCH]
    await session.commit()  # the question can take a minute: no transaction waits on it
    answers = await matcher.match(
        [MatchExercise(name=name, group=_group(group) or None) for name, _ in batch], catalogue
    )
    for (name, _), demo_id in zip(batch, answers, strict=True):
        await session.execute(
            insert(ExerciseDemoLink)
            .values(
                name=name,
                muscle_group=_group(group),
                demo_id=demo_id if demo_id in catalogue else None,
            )
            .on_conflict_do_nothing()
        )
    await session.commit()
    linked = sum(1 for demo_id in answers if demo_id in catalogue)
    logger.info("Demonstrations: %d of %d %s exercises linked", linked, len(batch), _group(group))
    return len(batch)


async def demo_of(session: AsyncSession, user: User, exercise_id: uuid.UUID) -> ExerciseDemo | None:
    """The animation of one of the user's exercises, if it has one (and its GIF is here)."""
    exercise = await logs.get_exercise(session, user.id, exercise_id, include_deleted=True)
    name, group = exercise_key(exercise.name, exercise.muscle_group)
    return await session.scalar(
        select(ExerciseDemo)
        .join(ExerciseDemoLink, ExerciseDemoLink.demo_id == ExerciseDemo.id)
        .where(
            ExerciseDemoLink.name == name,
            ExerciseDemoLink.muscle_group == _group(group),
            ExerciseDemo.size_bytes.is_not(None),
        )
    )


async def counts(session: AsyncSession) -> tuple[int, int]:
    """How many exercises the catalogue has, and how many of their animations are here."""
    total = await session.scalar(select(func.count()).select_from(ExerciseDemo)) or 0
    here = await session.scalar(
        select(func.count()).select_from(ExerciseDemo).where(ExerciseDemo.size_bytes.is_not(None))
    )
    return total, here or 0
