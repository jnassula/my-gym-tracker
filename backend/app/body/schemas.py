"""Request/response schemas for the body domain."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Self

from pydantic import BaseModel, Field, model_validator

from app.body.models import WEIGHT_KG, MeasurementSource
from app.logs.schemas import Kg
from app.progress.schemas import Range

BodyWeightIn = Annotated[
    Decimal, Field(ge=WEIGHT_KG[0], le=WEIGHT_KG[1], max_digits=5, decimal_places=2)
]
BodyFatIn = Annotated[Decimal, Field(ge=2, le=75, max_digits=3, decimal_places=1)]
# Ohms. A scale sends 0 when it measured none (shoes, socks).
ImpedanceIn = Annotated[int, Field(ge=1, le=3000)]


class MeasurementCreate(BaseModel):
    """A weighing, typed in or read from the scale. Always kg."""

    source: MeasurementSource = MeasurementSource.MANUAL
    weight: BodyWeightIn
    # Manual entries: the user's local date (today when left out) and, if the scale shows it,
    # the body fat. A scale's reading is always "now": scales' own clocks are often wrong.
    day: date | None = None
    body_fat_pct: BodyFatIn | None = None
    # A scale's reading: the impedance it measured, when it did.
    impedance: ImpedanceIn | None = None

    @model_validator(mode="after")
    def _fields_of_its_source(self) -> Self:
        manual = self.source is MeasurementSource.MANUAL
        if manual and self.impedance is not None:
            raise ValueError("Only a scale's reading has an impedance")
        if not manual and (self.day is not None or self.body_fat_pct is not None):
            raise ValueError("A scale's reading is taken now and has no body fat of its own")
        return self


class MeasurementRead(BaseModel):
    id: uuid.UUID
    measured_at: datetime
    source: MeasurementSource
    weight: Kg
    # Needs the profile's height.
    bmi: float | None
    # Worked out from the scale's impedance and the profile (height, age, sex), or the body fat
    # typed in with a manual entry. Estimates, as on the scale's own app.
    body_fat_pct: float | None
    water_pct: float | None
    muscle_kg: float | None
    bone_kg: float | None
    visceral_fat: int | None
    bmr_kcal: int | None


class BodyPoint(BaseModel):
    """A chart point: a day, or a week's Monday over a year."""

    date: date
    weight: Kg
    body_fat_pct: float | None


class BodyOverview(BaseModel):
    latest: MeasurementRead | None  # of all time, not only this range
    range: Range
    points: list[BodyPoint]
    # From the range's first point to its last.
    change: Kg | None
    # The range's weighings, newest first.
    measurements: list[MeasurementRead]
    # Whether the profile has what the body composition needs (height, date of birth, sex).
    profile_complete: bool
