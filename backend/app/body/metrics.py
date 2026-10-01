"""Pure arithmetic for the body weight chart: one point per day, or per week over a year."""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

CENT = Decimal("0.01")


@dataclass(frozen=True)
class Reading:
    """One weighing, on the user's local date. ``body_fat_pct`` when it is known."""

    day: date
    weight: Decimal
    body_fat_pct: float | None


@dataclass(frozen=True)
class Point:
    day: date
    weight: Decimal
    body_fat_pct: float | None


def daily(readings: Iterable[Reading]) -> list[Point]:
    """One point per day: the day's last weighing (weighing again replaces the earlier one).
    ``readings`` in time order."""
    last = {reading.day: reading for reading in readings}
    return [Point(day, r.weight, r.body_fat_pct) for day, r in sorted(last.items())]


def weekly(readings: Iterable[Reading]) -> list[Point]:
    """One point per week (its Monday): the average of the week's days, which evens out the
    swings from one day to the next."""
    weeks: dict[date, list[Point]] = {}
    for point in daily(readings):
        weeks.setdefault(point.day - timedelta(days=point.day.weekday()), []).append(point)
    points = []
    for monday, days in sorted(weeks.items()):
        fats = [p.body_fat_pct for p in days if p.body_fat_pct is not None]
        points.append(
            Point(
                monday,
                (sum((p.weight for p in days), Decimal(0)) / len(days)).quantize(CENT),
                round(sum(fats) / len(fats), 1) if fats else None,
            )
        )
    return points


def change(points: Sequence[Point]) -> Decimal | None:
    """From the first point to the last; nothing to compare with fewer than two."""
    return points[-1].weight - points[0].weight if len(points) > 1 else None
