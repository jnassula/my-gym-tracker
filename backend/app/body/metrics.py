"""Pure arithmetic for the body weight chart: one point per day, or per week over a year."""

from bisect import bisect_left
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal

CENT = Decimal("0.01")
TENTH = Decimal("0.1")
# A scale's app writes the weight and the body fat of one weighing at the same instant; allow
# for a health app that shifts one of them a little.
PAIR_WITHIN = timedelta(minutes=2)
# The same weighing seen twice: read from the scale here and sent later by the scale's app
# through a data source, or sent by two data sources. Their clocks differ a little.
SAME_WITHIN = timedelta(minutes=10)
SAME_WEIGHT = Decimal("0.15")


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


@dataclass(frozen=True)
class Weighing:
    """A weighing as a data source reports it."""

    at: datetime
    weight: Decimal  # kg
    body_fat_pct: Decimal | None


def pair(
    weights: Iterable[tuple[datetime, float]], fats: Sequence[tuple[datetime, float]]
) -> list[Weighing]:
    """Health apps keep weight and body fat as separate samples: each weight gets the body fat
    measured with it (the nearest, within ``PAIR_WITHIN``). A body fat without a weight is
    nothing to keep."""
    by_time = sorted(fats)
    times = [fat_at for fat_at, _ in by_time]
    weighings = []
    for at, weight in weights:
        # The nearest is the first at or after the weight's instant, or the one before it (the
        # first of those sharing that instant): a bridge's batch is thousands of samples.
        index = bisect_left(times, at)
        around = by_time[index : index + 1]
        if index > 0:
            around.append(by_time[bisect_left(times, times[index - 1])])
        near = [
            (abs(fat_at - at), fat) for fat_at, fat in around if abs(fat_at - at) <= PAIR_WITHIN
        ]
        fat = min(near)[1] if near else None
        weighings.append(
            Weighing(
                at,
                Decimal(str(weight)).quantize(CENT),
                Decimal(str(fat)).quantize(TENTH) if fat is not None else None,
            )
        )
    return weighings


def same_weighing(weighing: Weighing, at: datetime, weight: Decimal) -> bool:
    """Whether a stored weighing (``at``, ``weight``) is this one, seen through another source."""
    return abs(weighing.at - at) <= SAME_WITHIN and abs(weighing.weight - weight) <= SAME_WEIGHT
