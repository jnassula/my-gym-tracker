"""Which workout today, and how the week is going: the rule behind the Início's suggestion and
the training reminder (pure).

A plan's weekdays are where the trainer put each day, not an appointment. The user trains the
day that suits the week ("B today, because tomorrow there is footvolley"; their request of
2026-10-05), so no weekday is ever "missed": the week has a number of workouts to do, and
today's suggestion is the one that fits best, which the user can swap for another.
"""

import uuid
from collections.abc import Mapping, Sequence, Set
from dataclasses import dataclass
from datetime import date
from enum import StrEnum

MAX_TARGET = 7  # a workout a day


class Kind(StrEnum):
    CONTINUE = "continue"  # a workout was started today and isn't complete
    DONE = "done"  # today's workout is complete
    SUGGEST = "suggest"  # nothing yet today: this one
    REST = "rest"  # nothing is due today; the day named is what comes next
    COMPLETE = "complete"  # the week's workouts are done


class Reason(StrEnum):
    PLAN = "plan"  # the plan has it on today's weekday
    CATCH_UP = "catch_up"  # its weekday went by this week
    NEXT = "next"  # no weekday to go by: the one trained longest ago
    # The user's other activities (``activities.rules``) changed what the plan alone would say:
    BEFORE_ACTIVITY = "before_activity"  # tomorrow one gets in its way: today, while it fits
    INSTEAD = "instead"  # one today rules out the workout that came first: this one fits
    CLASH = "clash"  # with REST: all that is left clashes with today's activity


@dataclass(frozen=True)
class PlanDay:
    id: uuid.UUID
    weekday: int | None  # 0 = Monday; None in a plan that rotates its days
    position: int


@dataclass(frozen=True)
class Workout:
    """A session of this week (Monday to Sunday). ``complete``: finished, or every exercise
    done. ``day_id`` may be another plan's day, or None once its plan day is gone."""

    day_id: uuid.UUID | None
    date: date
    complete: bool


@dataclass(frozen=True)
class Suggestion:
    kind: Kind
    day_id: uuid.UUID | None  # None only for a plan without days
    reason: Reason | None = None  # with SUGGEST, and CLASH with REST


def counts(workout: Workout, today: date) -> bool:
    """An earlier day's workout counts as it was left (it can't be carried on); today's counts
    once it is complete."""
    return workout.date < today or workout.complete


def target(days: Sequence[PlanDay]) -> int:
    """Workouts the plan asks of a week: each of its days once."""
    return min(len(days), MAX_TARGET)


def done(workouts: Sequence[Workout], today: date) -> int:
    """Workouts of the week that count, whatever plan they were of (a plan changed on a
    Wednesday doesn't empty the week)."""
    return sum(1 for workout in workouts if counts(workout, today))


def trained(workouts: Sequence[Workout], today: date) -> set[uuid.UUID]:
    """The days with a workout that counts this week."""
    return {w.day_id for w in workouts if w.day_id is not None and counts(w, today)}


def suggest(
    days: Sequence[PlanDay],
    workouts: Sequence[Workout],
    last_trained: Mapping[uuid.UUID, date],
    today: date,
    *,
    blocked_today: Set[uuid.UUID] = frozenset(),
    blocked_tomorrow: Set[uuid.UUID] = frozenset(),
) -> Suggestion:
    """``workouts`` oldest first; ``last_trained`` is each day's latest date, of any week.
    ``blocked_today`` and ``blocked_tomorrow`` are the days an activity of that date gets in
    the way of ("no legs with footvolley"): one blocked today isn't suggested, and one blocked
    tomorrow is suggested today, while it still fits."""
    if not days:
        return Suggestion(Kind.REST, None)
    return _todays(days, workouts, today) or _next(
        days,
        workouts,
        last_trained,
        today,
        blocked_today=blocked_today,
        blocked_tomorrow=blocked_tomorrow,
    )


def _todays(days: Sequence[PlanDay], workouts: Sequence[Workout], today: date) -> Suggestion | None:
    """What was already started today, of this plan: carried on, or done."""
    ids = {day.id for day in days}
    mine = [w for w in workouts if w.date == today and w.day_id in ids]
    if not mine:
        return None
    unfinished = [w for w in mine if not w.complete]
    if unfinished:
        return Suggestion(Kind.CONTINUE, unfinished[-1].day_id)
    return Suggestion(Kind.DONE, mine[-1].day_id)


def _next(
    days: Sequence[PlanDay],
    workouts: Sequence[Workout],
    last_trained: Mapping[uuid.UUID, date],
    today: date,
    *,
    blocked_today: Set[uuid.UUID],
    blocked_tomorrow: Set[uuid.UUID],
) -> Suggestion:
    weekday = today.weekday()
    already = trained(workouts, today)
    # Once every day was trained this week, the round starts again.
    pool = [day for day in days if day.id not in already] or list(days)

    def rank(day: PlanDay) -> tuple[bool, bool, int, date, int]:
        ahead = day.weekday - weekday if day.weekday is not None and day.weekday > weekday else 0
        return (
            day.weekday != weekday,  # the plan's own day for today
            not _overdue(day, weekday),  # then what its weekday left behind
            ahead,  # then days without a weekday, then the nearest one coming
            last_trained.get(day.id, date.min),  # trained longest ago, never trained first
            day.position,
        )

    natural = min(pool, key=rank)  # what the plan alone would have
    free = [day for day in pool if day.id not in blocked_today]
    # Of what fits today, what won't fit tomorrow comes first.
    best = min(free, key=lambda day: (day.id not in blocked_tomorrow, *rank(day))) if free else None
    if done(workouts, today) >= target(days):
        return Suggestion(Kind.COMPLETE, (best or natural).id)
    if best is None:
        return Suggestion(Kind.REST, natural.id, Reason.CLASH)
    if best.id != natural.id:
        swapped = Reason.INSTEAD if natural.id in blocked_today else Reason.BEFORE_ACTIVITY
        return Suggestion(Kind.SUGGEST, best.id, swapped)
    reason = _reason(best, weekday)
    if reason is None and best.id in blocked_tomorrow:
        reason = Reason.BEFORE_ACTIVITY  # its weekday is ahead, but so is what gets in its way
    # Without a reason its weekday is still to come: nothing is due today.
    return Suggestion(Kind.SUGGEST, best.id, reason) if reason else Suggestion(Kind.REST, best.id)


def _reason(day: PlanDay, weekday: int) -> Reason | None:
    if day.weekday == weekday:
        return Reason.PLAN
    if _overdue(day, weekday):
        return Reason.CATCH_UP
    return Reason.NEXT if day.weekday is None else None


def _overdue(day: PlanDay, weekday: int) -> bool:
    return day.weekday is not None and day.weekday < weekday
