"""Activities other than the gym (footvolley, surf): which dates one is on, and which workouts it
gets in the way of (pure).

An activity may have fixed weekdays ("footvolley on Wednesdays"), which put it on the calendar by
themselves, or none ("surf, when the sea allows"), marked by hand on the day. Either way a date
can be said outright: marked, or "não fui" for a fixed day that didn't happen.

What it gets in the way of is a region of the body, not a day of the plan: the trainer's next
plan has other days, and "Treino B" stops meaning legs. A workout's regions are worked out from
its exercises, so the rule goes on holding.
"""

from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta
from enum import StrEnum

from app.exercises.models import MuscleGroup


class Region(StrEnum):
    UPPER = "upper"
    LOWER = "lower"
    CORE = "core"


REGION_OF = {
    MuscleGroup.CHEST: Region.UPPER,
    MuscleGroup.BACK: Region.UPPER,
    MuscleGroup.SHOULDERS: Region.UPPER,
    MuscleGroup.BICEPS: Region.UPPER,
    MuscleGroup.TRICEPS: Region.UPPER,
    MuscleGroup.FOREARMS: Region.UPPER,
    MuscleGroup.QUADS: Region.LOWER,
    MuscleGroup.HAMSTRINGS: Region.LOWER,
    MuscleGroup.GLUTES: Region.LOWER,
    MuscleGroup.ADDUCTORS: Region.LOWER,
    MuscleGroup.CALVES: Region.LOWER,
    MuscleGroup.ABS: Region.CORE,
}
# A workout works a region when this much of it is there: a leg day with one set of abs isn't
# a core workout, and a full-body one is both upper and lower.
SHARE = 0.4


def regions(groups: Iterable[MuscleGroup | None]) -> frozenset[Region]:
    """The regions a workout works, from its exercises' muscle groups. Warm-ups don't count;
    cardio, stretching and exercises without a group count as work that is of no region."""
    working = [group for group in groups if group is not MuscleGroup.WARMUP]
    if not working:
        return frozenset()
    counts = Counter(REGION_OF[group] for group in working if group in REGION_OF)
    return frozenset(region for region, n in counts.items() if n / len(working) >= SHARE)


@dataclass(frozen=True)
class Rule:
    """An activity's fixed days: these weekdays (0 = Monday), from ``since`` on, until it is
    archived."""

    weekdays: frozenset[int]
    since: date | None
    archived: bool = False


def fixed(rule: Rule, day: date) -> bool:
    return (
        not rule.archived
        and rule.since is not None
        and day >= rule.since
        and day.weekday() in rule.weekdays
    )


def happens(rule: Rule, said: bool | None, day: date) -> bool:
    """Whether the activity is on ``day``. ``said`` is what was said of that date outright:
    True marked, False "não fui", None nothing, and then its fixed days decide."""
    return fixed(rule, day) if said is None else said


def fixed_dates(rule: Rule, last: date) -> list[date]:
    """Every fixed day up to ``last``: what becomes history when the rule changes."""
    if rule.since is None:
        return []
    days = (rule.since + timedelta(days=n) for n in range((last - rule.since).days + 1))
    return [day for day in days if fixed(rule, day)]
