"""Arithmetic for the backoffice's growth chart (pure)."""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

Unit = Literal["day", "week", "month"]


@dataclass(frozen=True)
class Bucket:
    """One point of the chart: a day, a week (from Monday) or a month, named by its first day."""

    start: date
    new_users: int
    total_users: int
    active_users: int


def bucket_start(day: date, unit: Unit) -> date:
    if unit == "week":
        return day - timedelta(days=day.weekday())
    if unit == "month":
        return day.replace(day=1)
    return day


def bucket_starts(today: date, unit: Unit, count: int) -> list[date]:
    """The last ``count`` buckets, oldest first; the last one holds today."""
    last = bucket_start(today, unit)
    if unit == "month":
        months = [last.year * 12 + last.month - 1 - back for back in range(count)]
        return [date(month // 12, month % 12 + 1, 1) for month in reversed(months)]
    step = 7 if unit == "week" else 1
    return [last - timedelta(days=step * back) for back in reversed(range(count))]


def growth(
    starts: list[date],
    new_users: Mapping[date, int],
    active_users: Mapping[date, int],
    users_before: int,
) -> list[Bucket]:
    """Fills the buckets nobody signed up or trained in; the total carries on from before."""
    buckets = []
    total = users_before
    for start in starts:
        total += new_users.get(start, 0)
        buckets.append(Bucket(start, new_users.get(start, 0), total, active_users.get(start, 0)))
    return buckets
