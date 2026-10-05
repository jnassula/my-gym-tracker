"""Request/response schemas for the activities domain."""

import uuid
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

from app.activities.rules import Region

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


def _each_once[T: (int, Region)](values: list[T]) -> list[T]:
    return sorted(set(values))


Weekdays = Annotated[
    list[Annotated[int, Field(ge=0, le=6)]], Field(max_length=7), AfterValidator(_each_once)
]
Avoid = Annotated[list[Region], Field(max_length=3), AfterValidator(_each_once)]


class ActivityCreate(BaseModel):
    name: Name
    # 0 = Monday. Empty: it has no fixed day and is marked by hand.
    weekdays: Weekdays = []
    # The regions of the body it shouldn't share a day with.
    avoid: Avoid = []


class ActivityUpdate(BaseModel):
    """Only what is sent changes."""

    name: Name | None = None
    weekdays: Weekdays | None = None
    avoid: Avoid | None = None


class ActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    weekdays: list[int]
    avoid: list[Region]


class PlanDayRegions(BaseModel):
    """A day of the active plan and the regions it works: what an activity's ``avoid`` keeps
    it away from."""

    day_id: uuid.UUID
    label: str
    weekday: int | None
    regions: list[Region]


class ActivitiesRead(BaseModel):
    activities: list[ActivityRead]
    plan_days: list[PlanDayRegions]
