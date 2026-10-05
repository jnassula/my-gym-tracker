"""Where an activity is on the calendar, and which workouts it gets in the way of."""

from datetime import date, timedelta

from app.activities.rules import Region, Rule, fixed_dates, happens, regions
from app.exercises.models import MuscleGroup as G

MONDAY = date(2026, 9, 28)
WEDNESDAY = MONDAY + timedelta(days=2)


def test_a_workout_works_the_regions_most_of_it_is_in() -> None:
    assert regions([G.CHEST, G.BACK, G.SHOULDERS, G.BICEPS]) == {Region.UPPER}
    assert regions([G.QUADS, G.HAMSTRINGS, G.GLUTES, G.CALVES, G.ABS]) == {Region.LOWER}
    # Abs and stretching: the stretching is work of no region, and the abs still are most of it.
    assert regions([G.ABS, G.ABS, G.OTHER]) == {Region.CORE}
    # A full-body workout is both, so neither footvolley nor surf goes with it.
    assert regions([G.CHEST, G.BACK, G.QUADS, G.HAMSTRINGS, G.ABS]) == {Region.UPPER, Region.LOWER}


def test_warm_ups_do_not_make_a_workout_something_else() -> None:
    # Two warm-up sets on the leg extension before an upper-body day.
    assert regions([G.WARMUP, G.WARMUP, G.CHEST, G.TRICEPS]) == {Region.UPPER}
    assert regions([G.WARMUP]) == frozenset()
    assert regions([]) == frozenset()


def test_a_workout_of_no_region_gets_in_nothing_s_way() -> None:
    assert regions([G.CARDIO, G.OTHER, None]) == frozenset()
    # Four exercises of other things and one of legs: not a leg day.
    assert regions([G.CARDIO, G.OTHER, None, G.OTHER, G.QUADS]) == frozenset()


def test_a_fixed_weekday_puts_the_activity_on_every_such_day_from_then_on() -> None:
    footvolley = Rule(frozenset({2}), since=WEDNESDAY)

    assert happens(footvolley, None, WEDNESDAY) is True
    assert happens(footvolley, None, WEDNESDAY + timedelta(days=7)) is True
    assert happens(footvolley, None, MONDAY) is False  # not its weekday
    assert happens(footvolley, None, WEDNESDAY - timedelta(days=7)) is False  # before it was set


def test_what_is_said_of_a_date_comes_before_the_weekday() -> None:
    footvolley = Rule(frozenset({2}), since=MONDAY)
    surf = Rule(frozenset(), since=None)  # no fixed day: only where it is marked

    assert happens(footvolley, False, WEDNESDAY) is False  # "não fui"
    assert happens(footvolley, True, MONDAY) is True  # an extra game
    assert happens(surf, None, WEDNESDAY) is False
    assert happens(surf, True, WEDNESDAY) is True


def test_an_archived_activity_is_only_where_it_was_said_to_be() -> None:
    archived = Rule(frozenset({2}), since=MONDAY, archived=True)

    assert happens(archived, None, WEDNESDAY) is False
    assert happens(archived, True, WEDNESDAY) is True  # kept as history


def test_the_fixed_days_so_far_are_listed_to_be_kept() -> None:
    twice_a_week = Rule(frozenset({0, 2}), since=WEDNESDAY)

    assert fixed_dates(twice_a_week, WEDNESDAY + timedelta(days=7)) == [
        WEDNESDAY,
        MONDAY + timedelta(days=7),
        WEDNESDAY + timedelta(days=7),
    ]
    assert fixed_dates(twice_a_week, WEDNESDAY - timedelta(days=1)) == []
    assert fixed_dates(Rule(frozenset(), since=None), WEDNESDAY) == []
