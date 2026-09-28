"""Request/response schemas for the notifications domain."""

from datetime import time
from typing import Annotated, Self

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator


class NotificationSettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    training_reminder: bool
    reminder_time: time
    rest_end: bool
    weekly_summary: bool
    new_record: bool
    plan_expiring: bool


class NotificationsRead(BaseModel):
    # The browser's applicationServerKey; null when push is not configured on the server.
    public_key: str | None
    settings: NotificationSettingsRead


class NotificationSettingsUpdate(BaseModel):
    training_reminder: bool | None = None
    reminder_time: time | None = None
    rest_end: bool | None = None
    weekly_summary: bool | None = None
    new_record: bool | None = None
    plan_expiring: bool | None = None

    @model_validator(mode="after")
    def _something_to_change(self) -> Self:
        if not self.model_fields_set or any(
            getattr(self, field) is None for field in self.model_fields_set
        ):
            raise ValueError("Send at least one setting, none null")
        return self


Base64Url = Annotated[str, Field(min_length=1, max_length=255, pattern=r"^[A-Za-z0-9_-]+=*$")]


class SubscriptionKeys(BaseModel):
    p256dh: Base64Url
    auth: Base64Url


class SubscriptionCreate(BaseModel):
    """What ``PushSubscription.toJSON()`` gives in the browser."""

    endpoint: Annotated[str, Field(min_length=1, max_length=2048, pattern=r"^https://")]
    keys: SubscriptionKeys


class RestSchedule(BaseModel):
    """The app went to the background mid-rest: notify when it ends."""

    ends_at: AwareDatetime


class TestResult(BaseModel):
    sent: int
