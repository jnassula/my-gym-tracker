import uuid
from datetime import date, datetime
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.exercises.models import MuscleGroup
from app.workouts.parser.types import ParseWarning

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Label = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]
Reps = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)]
Notes = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
Weekday = Annotated[int, Field(ge=0, le=6, description="0 = Monday")]
RestSeconds = Annotated[int, Field(ge=0, le=3600)]

MAX_DAYS = 7
MAX_EXERCISES_PER_DAY = 60


class ExerciseDraft(BaseModel):
    """An exercise as edited in the import preview (or sent when creating a plan)."""

    name: Name
    muscle_group: MuscleGroup | None = None
    sets: Annotated[int, Field(ge=1, le=50)] | None = None
    reps: Reps | None = None
    rest_seconds: RestSeconds | None = None
    rest_max_seconds: RestSeconds | None = None
    notes: Notes | None = None

    @model_validator(mode="after")
    def _rest_range(self) -> Self:
        if self.rest_max_seconds is not None and (
            self.rest_seconds is None or self.rest_max_seconds < self.rest_seconds
        ):
            raise ValueError("rest_max_seconds needs rest_seconds and must not be smaller")
        return self


class DayDraft(BaseModel):
    weekday: Weekday | None
    label: Label = ""
    exercises: Annotated[list[ExerciseDraft], Field(min_length=1, max_length=MAX_EXERCISES_PER_DAY)]


class PlanCreate(BaseModel):
    name: Name
    source_file_id: uuid.UUID | None = None
    valid_until: date | None = None
    activate: bool = True
    days: Annotated[list[DayDraft], Field(min_length=1, max_length=MAX_DAYS)]

    @model_validator(mode="after")
    def _unique_weekdays(self) -> Self:
        weekdays = [day.weekday for day in self.days if day.weekday is not None]
        if len(weekdays) != len(set(weekdays)):
            raise ValueError("Each weekday can appear only once")
        return self


# --- import preview (response) -----------------------------------------------------------


class ExercisePreview(ExerciseDraft):
    warnings: list[ParseWarning] = []


class DayPreview(BaseModel):
    weekday: Weekday | None
    label: str
    exercises: list[ExercisePreview]


class ImportPreview(BaseModel):
    """What the parser understood. The client edits it and sends it back as PlanCreate."""

    file_id: uuid.UUID
    filename: str
    name: str
    valid_until: date | None
    rest_days: list[Weekday]
    days: list[DayPreview]


# --- reads ---------------------------------------------------------------------------------


class ExerciseRead(ExerciseDraft):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    position: int


class DayRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    weekday: int | None
    label: str
    position: int
    exercises: list[ExerciseRead]


class SourceFile(BaseModel):
    """The PDF a plan was imported from."""

    id: uuid.UUID
    filename: str
    size_bytes: int


class PlanSummary(BaseModel):
    id: uuid.UUID
    name: str
    is_active: bool
    valid_until: date | None
    source_file_id: uuid.UUID | None
    source_file: SourceFile | None
    created_at: datetime
    weekdays: list[int]
    day_count: int
    exercise_count: int


class PlanUpdate(BaseModel):
    """Rename a plan, or make it the active one (``is_active: false`` leaves none active)."""

    name: Name | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def _something_to_change(self) -> Self:
        if not self.model_fields_set or any(
            getattr(self, field) is None for field in self.model_fields_set
        ):
            raise ValueError("Send a name, is_active or both, not null")
        return self


class PlanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    is_active: bool
    valid_until: date | None
    source_file_id: uuid.UUID | None
    created_at: datetime
    days: list[DayRead]
