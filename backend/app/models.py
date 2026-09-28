"""Imports every domain's models so ``Base.metadata`` is complete (Alembic, tests)."""

from app.auth.models import RefreshToken
from app.core.db import Base
from app.exercises.models import Exercise
from app.health.models import HealthSample
from app.logs.models import ExerciseLog, WorkoutSession
from app.users.models import User
from app.workouts.models import WorkoutDay, WorkoutPlan

__all__ = [
    "Base",
    "Exercise",
    "ExerciseLog",
    "HealthSample",
    "RefreshToken",
    "User",
    "WorkoutDay",
    "WorkoutPlan",
    "WorkoutSession",
]
