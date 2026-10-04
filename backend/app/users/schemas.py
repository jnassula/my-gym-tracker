import uuid
from datetime import date, datetime
from functools import lru_cache
from typing import Annotated, Self
from zoneinfo import available_timezones

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    model_validator,
)

from app.core.db import utcnow
from app.users.models import HEIGHT_CM, Language, Sex, WeightUnit


@lru_cache
def _timezones() -> frozenset[str]:
    return frozenset(available_timezones())


def _check_timezone(value: str) -> str:
    if value not in _timezones():
        raise ValueError("Unknown IANA time zone")
    return value


def _check_birth_date(value: date) -> date:
    if not date(1900, 1, 1) <= value <= utcnow().date():
        raise ValueError("A date of birth from 1900 to today")
    return value


Email = Annotated[EmailStr, AfterValidator(str.lower)]
Timezone = Annotated[str, AfterValidator(_check_timezone)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
HeightCm = Annotated[int, Field(ge=HEIGHT_CM[0], le=HEIGHT_CM[1])]
BirthDate = Annotated[date, AfterValidator(_check_birth_date)]


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    name: str
    language: Language
    timezone: str
    unit: WeightUnit
    auto_rest: bool
    # The profile photo: its bytes are at /api/files/{id}/content. A new photo is a new id.
    avatar_file_id: uuid.UUID | None
    created_at: datetime
    # Shows the backoffice link; the API checks again on every call (``CurrentAdmin``).
    is_admin: bool
    # For the body composition of a weighing; each is optional.
    height_cm: int | None
    birth_date: date | None
    sex: Sex | None


CLEARABLE_FIELDS = {"height_cm", "birth_date", "sex"}


class AccountDelete(BaseModel):
    """Deleting one's own account takes the password again."""

    password: Annotated[str, StringConstraints(min_length=1, max_length=128)]


class UserUpdate(BaseModel):
    """Profile and preferences; send only what changes."""

    name: Name | None = None
    language: Language | None = None
    timezone: Timezone | None = None
    unit: WeightUnit | None = None
    auto_rest: bool | None = None
    # These three can be cleared again with null.
    height_cm: HeightCm | None = None
    birth_date: BirthDate | None = None
    sex: Sex | None = None

    @model_validator(mode="after")
    def _something_to_change(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("Send at least one field")
        if any(getattr(self, field) is None for field in self.model_fields_set - CLEARABLE_FIELDS):
            raise ValueError("Fields can't be null")
        return self
