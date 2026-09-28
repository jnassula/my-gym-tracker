"""Imports every domain's models so ``Base.metadata`` is complete (Alembic, tests)."""

from app.auth.models import RefreshToken
from app.core.db import Base
from app.exercises.models import Exercise
from app.files.models import StoredFile
from app.health.models import HealthConnection, HealthSample
from app.logs.models import ExerciseLog, WorkoutSession
from app.notifications.models import NotificationDelivery, NotificationSettings, PushSubscription
from app.users.models import User
from app.workouts.models import WorkoutDay, WorkoutPlan

__all__ = [
    "Base",
    "Exercise",
    "ExerciseLog",
    "HealthConnection",
    "HealthSample",
    "NotificationDelivery",
    "NotificationSettings",
    "PushSubscription",
    "RefreshToken",
    "StoredFile",
    "User",
    "WorkoutDay",
    "WorkoutPlan",
    "WorkoutSession",
]
