import uuid
from datetime import UTC, datetime, timedelta

from app.health.metrics import (
    Sample,
    SessionTimes,
    Window,
    assign,
    average,
    chart,
    peak,
    session_window,
    set_peak,
    spread,
    total,
)

T0 = datetime(2026, 9, 29, 17, 0, tzinfo=UTC)
SESSION = uuid.uuid4()


def at(minutes: float) -> datetime:
    return T0 + timedelta(minutes=minutes)


def times(*set_minutes: float, ended: float | None = None) -> SessionTimes:
    return SessionTimes(
        SESSION,
        at(set_minutes[0]),
        at(ended) if ended is not None else None,
        [at(m) for m in set_minutes],
    )


def test_the_window_starts_before_the_first_set_and_ends_a_little_after_the_last() -> None:
    assert session_window(times(0, 10, 50)) == Window(at(-5), at(53))


def test_terminar_treino_ends_the_window_unless_it_came_much_later() -> None:
    assert session_window(times(0, 50, ended=58)).end == at(58)
    assert session_window(times(0, 50, ended=50 + 240)).end == at(70)  # pressed hours later


def test_samples_are_assigned_to_the_session_they_fall_in() -> None:
    other = uuid.uuid4()
    windows = {SESSION: Window(at(0), at(60)), other: Window(at(120), at(180))}

    assert assign([at(30), at(90), at(150)], windows) == [SESSION, None, other]


def test_figures() -> None:
    heart_rate = [Sample(at(m), bpm) for m, bpm in [(0, 100), (1, 150), (2, 170), (3, 120)]]

    assert (average(heart_rate), peak(heart_rate)) == (135, 170)
    assert total([Sample(at(0), 12.4), Sample(at(1), 8.3)]) == 21
    assert (average([]), peak([]), total([])) == (None, None, None)


def test_a_sets_peak_is_the_effort_before_it_was_logged_and_just_after() -> None:
    heart_rate = [
        Sample(at(8), 175),  # the previous exercise
        Sample(at(9), 150),
        Sample(at(10.25), 162),  # 15 s after the set was logged
        Sample(at(11), 180),  # well into the rest
    ]

    assert set_peak(heart_rate, [at(10)]) == 162
    assert set_peak(heart_rate, [at(30)]) is None


def test_the_chart_averages_into_buckets() -> None:
    window = Window(at(0), at(90))  # 90 min: one-minute buckets
    heart_rate = [Sample(at(0), 100), Sample(at(0.5), 110), Sample(at(1), 130)]

    assert chart(heart_rate, window) == [Sample(at(0), 105), Sample(at(1), 130)]
    assert chart([], window) == []


def test_an_intervals_energy_is_spread_over_its_minutes() -> None:
    pieces = spread(at(0), at(2.5), 10)

    # Two whole minutes and half of one.
    assert [(p.at, p.value) for p in pieces] == [(at(0), 4), (at(1), 4), (at(2), 2)]
    assert spread(at(0), at(0.5), 3) == [Sample(at(0), 3)]
    assert spread(at(0), at(0), 3) == [Sample(at(0), 3)]


def test_an_interval_that_runs_backwards_or_for_most_of_a_day_is_left_out() -> None:
    assert spread(at(5), at(0), 10) == []
    assert spread(at(0), at(24 * 60), 900) == []
    assert len(spread(at(0), at(90), 400)) == 90
