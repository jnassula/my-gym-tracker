"""Pure arithmetic for Apple Health data: which session a sample belongs to, and its figures.

A session's time window runs from a little before its first logged set (that set, a warm-up) to
its end ("Terminar treino", or a few minutes after the last set). The Shortcuts app can't read
Apple Watch workouts, so the logged sets are all there is to place a session in time.
"""

import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

# Before the first logged set: the set itself (it is logged when it ends) and a warm-up.
LEAD = timedelta(minutes=5)
# After the last set when "Terminar treino" wasn't pressed.
TAIL = timedelta(minutes=3)
# A "Terminar treino" pressed long after the last set doesn't stretch the session.
MAX_TAIL = timedelta(minutes=20)
# A set's heart-rate peak: the effort before it was logged and the moments after.
SET_BEFORE = timedelta(seconds=90)
SET_AFTER = timedelta(seconds=30)
# The chart gets at most this many points (averaged buckets).
CHART_POINTS = 90
MIN_BUCKET = timedelta(seconds=15)


@dataclass(frozen=True)
class Window:
    start: datetime
    end: datetime

    def __contains__(self, instant: datetime) -> bool:
        return self.start <= instant <= self.end


@dataclass(frozen=True)
class SessionTimes:
    """What a session's window is computed from."""

    session_id: uuid.UUID
    started_at: datetime
    ended_at: datetime | None
    set_times: Sequence[datetime]


@dataclass(frozen=True)
class Sample:
    at: datetime
    value: float


def session_window(times: SessionTimes) -> Window:
    first = min([times.started_at, *times.set_times])
    last = max([times.started_at, *times.set_times])
    ended = times.ended_at
    end = last + TAIL if ended is None else min(max(ended, last), last + MAX_TAIL)
    return Window(first - LEAD, end)


def assign(
    instants: Iterable[datetime], windows: dict[uuid.UUID, Window]
) -> list[uuid.UUID | None]:
    """The session each instant falls in (the one starting last, if windows overlap)."""
    ordered = sorted(windows.items(), key=lambda item: item[1].start, reverse=True)
    return [next((sid for sid, window in ordered if at in window), None) for at in instants]


def average(samples: Sequence[Sample]) -> int | None:
    return round(sum(s.value for s in samples) / len(samples)) if samples else None


def peak(samples: Sequence[Sample]) -> int | None:
    return round(max(s.value for s in samples)) if samples else None


def total(samples: Sequence[Sample]) -> int | None:
    return round(sum(s.value for s in samples)) if samples else None


def set_peak(heart_rate: Sequence[Sample], set_times: Iterable[datetime]) -> int | None:
    """The highest heart rate around any of an exercise's sets."""
    around = [
        s
        for performed_at in set_times
        for s in heart_rate
        if performed_at - SET_BEFORE <= s.at <= performed_at + SET_AFTER
    ]
    return peak(around)


def chart(heart_rate: Sequence[Sample], window: Window) -> list[Sample]:
    """The heart rate averaged into at most ``CHART_POINTS`` buckets (bucket start, bpm)."""
    if not heart_rate:
        return []
    bucket = max(MIN_BUCKET, (window.end - window.start) / CHART_POINTS)
    buckets: dict[int, list[float]] = {}
    for sample in heart_rate:
        buckets.setdefault(int((sample.at - window.start) / bucket), []).append(sample.value)
    return [
        Sample(window.start + bucket * index, round(sum(values) / len(values)))
        for index, values in sorted(buckets.items())
    ]
