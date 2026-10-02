"""The exercise library: what the user's plans hold (with the last weight logged on each),
then the base list in their language. The client searches it; it is a few hundred rows."""

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.ext.asyncio import AsyncSession

from app.exercises.library import base_entries
from app.exercises.models import Exercise, MuscleGroup
from app.exercises.schemas import Library, LibraryEntry, LibrarySource
from app.logs.models import ExerciseLog
from app.logs.service import ExerciseKey, exercise_key
from app.users.models import User
from app.workouts.models import WorkoutDay, WorkoutPlan


async def _last_weights(session: AsyncSession, user: User) -> dict[ExerciseKey, Decimal]:
    """The newest set's weight per exercise key, deleted plans included (history outlives them)."""
    rows = await session.execute(
        select(Exercise.name, Exercise.muscle_group, ExerciseLog.weight)
        .join(Exercise, ExerciseLog.exercise_id == Exercise.id)
        .where(ExerciseLog.user_id == user.id)
        .ext(distinct_on(func.lower(Exercise.name), Exercise.muscle_group))
        .order_by(func.lower(Exercise.name), Exercise.muscle_group, ExerciseLog.performed_at.desc())
    )
    return {exercise_key(name, group): weight for name, group, weight in rows.all()}


async def library(session: AsyncSession, user: User) -> Library:
    rows = await session.execute(
        select(Exercise.name, Exercise.muscle_group, WorkoutPlan.name)
        .join(WorkoutDay, Exercise.day_id == WorkoutDay.id)
        .join(WorkoutPlan, WorkoutDay.plan_id == WorkoutPlan.id)
        .where(WorkoutPlan.user_id == user.id, WorkoutPlan.deleted_at.is_(None))
        .order_by(WorkoutPlan.created_at.desc(), WorkoutDay.position, Exercise.position)
    )
    weights = await _last_weights(session, user)
    entries: dict[ExerciseKey, LibraryEntry] = {}
    for name, group, plan_name in rows.all():
        key = exercise_key(name, group)
        if key not in entries:
            entries[key] = LibraryEntry(
                name=name,
                muscle_group=group or MuscleGroup.OTHER,
                source=LibrarySource.PLAN,
                plan_name=plan_name,
                last_weight=weights.get(key),
            )
    for name, group in base_entries(user.language):
        key = exercise_key(name, group)
        if key not in entries:
            entries[key] = LibraryEntry(
                name=name,
                muscle_group=group,
                source=LibrarySource.BASE,
                last_weight=weights.get(key),
            )
    return Library(entries=list(entries.values()))
