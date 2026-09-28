import uuid
from datetime import datetime
from functools import lru_cache
from typing import Annotated
from zoneinfo import available_timezones

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, StringConstraints

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
    created_at: datetime
