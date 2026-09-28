from dataclasses import dataclass, field
from datetime import date
from enum import StrEnum

from app.exercises.models import MuscleGroup


@dataclass(frozen=True)
class Word:
    text: str
    x0: float
    x1: float
    top: float

    @property
    def center(self) -> float:
        return (self.x0 + self.x1) / 2


@dataclass(frozen=True)
class Line:
    """One visual line of the PDF, words ordered left to right."""

    words: tuple[Word, ...]

    @property
    def text(self) -> str:
        return " ".join(word.text for word in self.words)

    @property
    def top(self) -> float:
        return self.words[0].top


class ParseWarning(StrEnum):
    """Why an exercise deserves a second look in the preview."""

    UNKNOWN_MUSCLE_GROUP = "unknown_muscle_group"
    NO_SETS = "no_sets"
    TECHNIQUE_SETS = "technique_sets"  # drop set, rest pause, cluster…: confirm the sets
    COMBINED_EXERCISE = "combined_exercise"  # "A 3x12 + B 3x até a falha"
    ALTERNATIVE_EXERCISE = "alternative_exercise"  # "A 3x12 ou B 3x12"


@dataclass
class ParsedExercise:
    name: str
    muscle_group: MuscleGroup | None
    sets: int | None
    reps: str | None
    rest_seconds: int | None = None
    rest_max_seconds: int | None = None
    notes: str | None = None
    warnings: list[ParseWarning] = field(default_factory=list)


@dataclass
class ParsedDay:
    weekday: int  # 0 = Monday
    label: str  # the day's focus, e.g. "Peitoral, Ombros e Abdômen"
    exercises: list[ParsedExercise]


@dataclass
class ParsedPlan:
    title: str | None
    valid_until: date | None
    days: list[ParsedDay]
    rest_days: list[int]
