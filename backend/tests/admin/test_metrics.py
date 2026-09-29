from datetime import date

from app.admin.metrics import Bucket, bucket_starts, growth

TUESDAY = date(2026, 9, 29)


def test_days_end_today() -> None:
    assert bucket_starts(TUESDAY, "day", 3) == [date(2026, 9, 27), date(2026, 9, 28), TUESDAY]


def test_weeks_start_on_monday() -> None:
    assert bucket_starts(TUESDAY, "week", 3) == [
        date(2026, 9, 14),
        date(2026, 9, 21),
        date(2026, 9, 28),
    ]


def test_months_cross_the_year() -> None:
    assert bucket_starts(date(2026, 2, 14), "month", 4) == [
        date(2025, 11, 1),
        date(2025, 12, 1),
        date(2026, 1, 1),
        date(2026, 2, 1),
    ]


def test_growth_fills_quiet_buckets_and_carries_the_total() -> None:
    starts = bucket_starts(TUESDAY, "day", 3)

    buckets = growth(starts, {date(2026, 9, 27): 2, TUESDAY: 1}, {date(2026, 9, 28): 4}, 10)

    assert buckets == [
        Bucket(date(2026, 9, 27), new_users=2, total_users=12, active_users=0),
        Bucket(date(2026, 9, 28), new_users=0, total_users=12, active_users=4),
        Bucket(TUESDAY, new_users=1, total_users=13, active_users=0),
    ]
