"""Response schemas for the backoffice: counts and account data, never what users train."""

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.admin.metrics import Unit
from app.users.models import Language

Range = Literal["30d", "12w", "12m"]


class Change(BaseModel):
    """A figure for a period and for the period of the same length before it."""

    current: int
    previous: int


class Funnel(BaseModel):
    """How far the accounts got; each step counts accounts, so it never exceeds the one before."""

    registered: int
    with_plan: int  # created a plan at some point, even if deleted since
    trained: int  # logged at least one workout
    active_30d: int  # trained in the last 30 days


class Adoption(BaseModel):
    apple_health: int
    notifications: int  # accounts with at least one device subscribed


class LanguageCount(BaseModel):
    language: Language
    users: int


class AdminOverview(BaseModel):
    total_users: int
    new_users_7d: Change
    new_users_30d: Change
    # Active: logged a workout in the period.
    active_users_7d: Change
    active_users_30d: Change
    workouts_total: int
    workouts_7d: Change
    funnel: Funnel
    adoption: Adoption
    languages: list[LanguageCount]  # most users first


class GrowthPoint(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    start: date
    new_users: int
    total_users: int  # at the end of the bucket
    active_users: int


class Growth(BaseModel):
    range: Range
    unit: Unit
    points: list[GrowthPoint]  # oldest first; the last one is the current day, week or month


class AdminUser(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: str
    language: Language
    created_at: datetime
    plans: int
    workouts: int
    last_workout_date: date | None


class AdminUsers(BaseModel):
    total: int  # matching the search, not only this page
    items: list[AdminUser]  # newest account first
