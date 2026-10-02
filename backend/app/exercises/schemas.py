from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel

from app.exercises.models import MuscleGroup


class LibrarySource(StrEnum):
    PLAN = "plan"  # one of the user's plans
    BASE = "base"  # the app's own list


class LibraryEntry(BaseModel):
    name: str
    muscle_group: MuscleGroup
    source: LibrarySource
    # The newest plan of the user's that has it (``plan`` entries).
    plan_name: str | None = None
    # The weight of the last set logged on it, in kg, across plans.
    last_weight: Decimal | None = None


class Library(BaseModel):
    """Every exercise the user can pick from: theirs first, then the base list."""

    entries: list[LibraryEntry]
