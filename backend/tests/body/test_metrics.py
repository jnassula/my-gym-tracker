from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from app.body.metrics import (
    Point,
    Reading,
    Weighing,
    change,
    daily,
    pair,
    same_weighing,
    weekly,
)


def reading(day: int, weight: str, fat: float | None = None) -> Reading:
    return Reading(date(2026, 9, day), Decimal(weight), fat)


def test_a_day_keeps_its_last_weighing() -> None:
    points = daily([reading(28, "78.90"), reading(28, "78.40", 22.5), reading(30, "78.10")])

    assert points == [
        Point(date(2026, 9, 28), Decimal("78.40"), 22.5),
        Point(date(2026, 9, 30), Decimal("78.10"), None),
    ]


def test_a_week_is_the_average_of_its_days_from_monday() -> None:
    # 21 and 22 September are a Monday and a Tuesday; the 28th is the next Monday.
    points = weekly(
        [
            reading(21, "79.00", 23.0),
            reading(22, "78.55"),
            reading(22, "78.50"),
            reading(28, "78.10"),
        ]
    )

    assert points == [
        Point(date(2026, 9, 21), Decimal("78.75"), 23.0),
        Point(date(2026, 9, 28), Decimal("78.10"), None),
    ]


def test_the_change_runs_from_the_first_point_to_the_last() -> None:
    points = daily([reading(21, "79.00"), reading(25, "79.40"), reading(28, "78.10")])

    assert change(points) == Decimal("-0.90")
    assert change(points[:1]) is None
    assert change([]) is None


T0 = datetime(2026, 9, 28, 6, 30, tzinfo=UTC)


def test_each_weight_gets_the_body_fat_measured_with_it() -> None:
    weights = [(T0, 78.45), (T0 + timedelta(days=1), 78.2)]
    fats = [(T0 + timedelta(seconds=20), 22.54), (T0 + timedelta(hours=3), 30.0)]

    assert pair(weights, fats) == [
        Weighing(T0, Decimal("78.45"), Decimal("22.5")),
        Weighing(T0 + timedelta(days=1), Decimal("78.20"), None),
    ]


def test_the_same_weighing_seen_through_another_source() -> None:
    weighing = Weighing(T0, Decimal("78.45"), None)

    # The scale's app stamps it a little apart and rounds it its own way.
    assert same_weighing(weighing, T0 + timedelta(minutes=4), Decimal("78.40"))
    assert not same_weighing(weighing, T0 + timedelta(minutes=30), Decimal("78.45"))
    assert not same_weighing(weighing, T0, Decimal("79.00"))
