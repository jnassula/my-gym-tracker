import uuid
from datetime import datetime
from functools import lru_cache
from typing import Annotated, Self
from zoneinfo import available_timezones

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    EmailStr,
    StringConstraints,
    computed_field,
    model_validator,
)

from app.core.config import get_settings
from app.users.models import Language, WeightUnit


@lru_cache
def _timezones() -> frozenset[str]:
    return frozenset(available_timezones())


def _check_timezone(value: str) -> str:
    if value not in _timezones():
        raise ValueError("Unknown IANA time zone")
    return value


Email = Annotated[EmailStr, AfterValidator(str.lower)]
Timezone = Annotated[str, AfterValidator(_check_timezone)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    name: str
    language: Language
    timezone: str
    unit: WeightUnit
    auto_rest: bool
    created_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_admin(self) -> bool:
        """Shows the backoffice link; the API checks again on every call (``CurrentAdmin``)."""
        return get_settings().is_admin(self.email)


class UserUpdate(BaseModel):
    """Profile and preferences; send only what changes."""

    name: Name | None = None
    language: Language | None = None
    timezone: Timezone | None = None
    unit: WeightUnit | None = None
    auto_rest: bool | None = None

    @model_validator(mode="after")
    def _something_to_change(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("Send at least one field")
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Fields can't be null")
        return self
