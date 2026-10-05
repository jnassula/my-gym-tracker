"""Request/response schemas for the logs domain (training sessions and their sets)."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, model_validator

from app.logs.week import Kind, Reason

# Kilograms, as stored (Numeric(6, 2)). JSON carries a number, not Pydantic's default string.
Kg = Annotated[Decimal, PlainSerializer(float, return_type=float, when_used="json")]
WeightIn = Annotated[Decimal, Field(ge=0, le=1000, max_digits=6, decimal_places=2)]
RepsIn = Annotated[int, Field(ge=1, le=200)]


class SetCreate(BaseModel):
    weight: WeightIn
    reps: RepsIn


class SetUpdate(BaseModel):
    weight: WeightIn | None = None
    reps: RepsIn | None = None

    @model_validator(mode="after")
    def _something_to_change(self) -> Self:
        if self.weight is None and self.reps is None:
            raise ValueError("Send weight, reps or both")
        return self


class SetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    exercise_id: uuid.UUID
    set_number: int
    weight: Kg
    reps: int
    performed_at: datetime


class SessionRead(BaseModel):
    id: uuid.UUID
    day_id: uuid.UUID | None
    local_date: date
    started_at: datetime
    ended_at: datetime | None
    done_exercise_ids: list[uuid.UUID]
    sets: list[SetRead]
    # Only on logging a set: it beat the exercise's heaviest on every earlier date.
    new_record: bool = False


class PastSet(BaseModel):
    weight: Kg
    reps: int


class PastSession(BaseModel):
    """An exercise's sets on an earlier date, e.g. "última" or a history row."""

    date: date
    sets: list[PastSet]


class DayLog(BaseModel):
    """What the day and exercise screens need: today's session and each exercise's last time."""

    day_id: uuid.UUID
    today: date
    session: SessionRead | None
    # By exercise id; exercises never trained (in this plan or an earlier one) are left out.
    last: dict[uuid.UUID, PastSession]


class WeightPoint(BaseModel):
    """The heaviest set of a session (or a week), e.g. a point of a progress chart."""

    date: date
    weight: Kg


class ExerciseHistory(BaseModel):
    """Earlier sessions, newest first, and the heaviest weight ever lifted (today excluded)."""

    sessions: list[PastSession]
    best_weight: Kg | None
    # Heaviest set of each of the last 8 sessions, oldest first (the "Progressão" sparkline).
    recent: list[WeightPoint]


class DayWeek(BaseModel):
    day_id: uuid.UUID
    # This week's latest session for the day, if it was trained.
    session_id: uuid.UUID | None
    date: date | None
    finished: bool
    exercises_done: int
    exercises_total: int
    sets: int
    # Trained this week: on an earlier day (however far it got), or complete today.
    trained: bool = False
    # Today's activities (footvolley, surf) this workout shouldn't share the day with.
    avoid: list[str] = []


class WeekWorkout(BaseModel):
    """A workout of this week, on its date. ``day_id`` may be another plan's day (the plan
    changed mid-week), or null once that day is gone."""

    session_id: uuid.UUID
    day_id: uuid.UUID | None
    date: date
    complete: bool


class Suggestion(BaseModel):
    """Which workout today (``logs.week``). ``day_id`` is the day to carry on, the one done,
    the one suggested, or (rest, complete) the one that would come next."""

    kind: Kind
    day_id: uuid.UUID | None
    reason: Reason | None
    # The activities behind a reason they gave: tomorrow's (before_activity), today's (instead,
    # clash).
    because: list[str] = []


class WeekActivity(BaseModel):
    """An activity besides the gym on a date. ``fixed``: there by its weekday, with nothing
    said of that date (so taking it off means "não fui")."""

    activity_id: uuid.UUID
    name: str
    date: date
    fixed: bool


class PlanWeek(BaseModel):
    """The current week (Monday to Sunday, in the user's time zone) for one plan."""

    today: date
    week_start: date
    days: list[DayWeek]
    # Workouts the plan asks of a week, and how many of this week's count already.
    target: int
    workouts_done: int
    sessions: list[WeekWorkout]
    suggestion: Suggestion
    # Monday to the Monday after: on a Sunday, tomorrow is already next week.
    activities: list[WeekActivity] = []


class PersonalRecord(BaseModel):
    exercise_id: uuid.UUID
    name: str
    weight: Kg


class SessionSummary(BaseModel):
    session_id: uuid.UUID
    sets: int
    volume: Kg  # sum of weight times reps, in kg
    duration_seconds: int
    records: list[PersonalRecord]
