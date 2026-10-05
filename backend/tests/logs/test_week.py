"""Which workout today: the rule, case by case. Monday is 2026-09-28."""

import uuid
from datetime import date, timedelta

from app.logs.week import Kind, PlanDay, Reason, Suggestion, Workout, done, suggest, target, trained

MONDAY = date(2026, 9, 28)
TUESDAY, WEDNESDAY, THURSDAY, FRIDAY = (MONDAY + timedelta(days=n) for n in range(1, 5))
A, B, C, D, E = (uuid.UUID(int=n) for n in range(1, 6))


def days(*weekdays: int | None) -> list[PlanDay]:
    ids = [A, B, C, D, E]
    return [PlanDay(ids[n], weekday, n) for n, weekday in enumerate(weekdays)]


def did(day: uuid.UUID | None, on: date, *, complete: bool = True) -> Workout:
    return Workout(day, on, complete)


ROTATING = days(None, None, None)  # Treino A, B, C
FIXED = days(0, 2, 4)  # Monday, Wednesday, Friday


# --- a plan with weekdays --------------------------------------------------------------------


def test_the_plans_own_day_is_todays_workout() -> None:
    assert suggest(FIXED, [], {}, MONDAY) == Suggestion(Kind.SUGGEST, A, Reason.PLAN)


def test_a_day_with_nothing_due_is_a_rest_day_that_names_what_comes_next() -> None:
    workouts = [did(A, MONDAY)]

    assert suggest(FIXED, workouts, {A: MONDAY}, TUESDAY) == Suggestion(Kind.REST, B)


def test_a_workout_its_weekday_left_behind_is_offered_the_next_day() -> None:
    assert suggest(FIXED, [], {}, TUESDAY) == Suggestion(Kind.SUGGEST, A, Reason.CATCH_UP)


def test_todays_own_day_comes_before_one_left_behind() -> None:
    assert suggest(FIXED, [], {}, WEDNESDAY) == Suggestion(Kind.SUGGEST, B, Reason.PLAN)


def test_mondays_workout_done_on_wednesday_is_done_for_the_week() -> None:
    """The user's case: nothing was missed on Monday, and Wednesday's own day is what is left."""
    workouts = [did(A, WEDNESDAY)]

    assert trained(workouts, THURSDAY) == {A}
    assert suggest(FIXED, workouts, {A: WEDNESDAY}, THURSDAY) == Suggestion(
        Kind.SUGGEST, B, Reason.CATCH_UP
    )


def test_a_day_done_ahead_of_its_weekday_is_not_suggested_on_it() -> None:
    workouts = [did(A, MONDAY), did(B, TUESDAY)]  # Wednesday's, a day early

    assert suggest(FIXED, workouts, {A: MONDAY, B: TUESDAY}, WEDNESDAY) == Suggestion(Kind.REST, C)


def test_a_plan_with_a_day_for_every_weekday_never_rests() -> None:
    every_day = [PlanDay(uuid.UUID(int=10 + n), n, n) for n in range(7)]

    for offset in range(7):
        today = MONDAY + timedelta(days=offset)
        assert suggest(every_day, [], {}, today) == Suggestion(
            Kind.SUGGEST, every_day[offset].id, Reason.PLAN
        )


# --- a plan that rotates its days ---------------------------------------------------------------


def test_a_rotating_plan_goes_in_order() -> None:
    assert suggest(ROTATING, [], {}, MONDAY) == Suggestion(Kind.SUGGEST, A, Reason.NEXT)
    monday = [did(A, MONDAY)]
    assert suggest(ROTATING, monday, {A: MONDAY}, TUESDAY) == Suggestion(
        Kind.SUGGEST, B, Reason.NEXT
    )


def test_the_rotation_goes_on_from_one_week_to_the_next() -> None:
    """Five days at three workouts a week: D and E are not skipped every Monday."""
    plan = days(None, None, None, None, None)
    last_week = {
        A: MONDAY - timedelta(days=7),
        B: MONDAY - timedelta(days=5),
        C: MONDAY - timedelta(days=3),
    }

    assert suggest(plan, [], last_week, MONDAY) == Suggestion(Kind.SUGGEST, D, Reason.NEXT)
    monday = [did(D, MONDAY)]
    assert suggest(plan, monday, last_week | {D: MONDAY}, TUESDAY) == Suggestion(
        Kind.SUGGEST, E, Reason.NEXT
    )
    tuesday = [*monday, did(E, TUESDAY)]
    assert suggest(plan, tuesday, last_week | {D: MONDAY, E: TUESDAY}, WEDNESDAY) == Suggestion(
        Kind.SUGGEST, A, Reason.NEXT
    )


def test_a_day_without_a_weekday_comes_before_one_whose_weekday_is_ahead() -> None:
    mixed = days(0, 4, None)  # Monday, Friday, and one to fit in
    workouts = [did(A, MONDAY)]

    assert suggest(mixed, workouts, {A: MONDAY}, TUESDAY) == Suggestion(
        Kind.SUGGEST, C, Reason.NEXT
    )


# --- today ---------------------------------------------------------------------------------------


def test_a_workout_started_today_is_carried_on() -> None:
    workouts = [did(C, MONDAY, complete=False)]  # not the one the plan would suggest

    assert suggest(ROTATING, workouts, {C: MONDAY}, MONDAY) == Suggestion(Kind.CONTINUE, C)


def test_a_workout_complete_today_is_todays_workout_done() -> None:
    workouts = [did(B, MONDAY)]

    assert suggest(ROTATING, workouts, {B: MONDAY}, MONDAY) == Suggestion(Kind.DONE, B)


def test_of_two_workouts_today_the_open_one_is_carried_on() -> None:
    workouts = [did(A, MONDAY), did(B, MONDAY, complete=False)]

    assert suggest(ROTATING, workouts, {}, MONDAY) == Suggestion(Kind.CONTINUE, B)
    assert done(workouts, MONDAY) == 1


def test_a_workout_left_unfinished_yesterday_counts_as_it_was() -> None:
    workouts = [did(A, MONDAY, complete=False)]

    assert done(workouts, MONDAY) == 0  # still today's to finish
    assert done(workouts, TUESDAY) == 1  # it can't be carried on any more
    assert suggest(ROTATING, workouts, {A: MONDAY}, TUESDAY) == Suggestion(
        Kind.SUGGEST, B, Reason.NEXT
    )


def test_another_plans_workout_today_is_not_this_plans() -> None:
    other = uuid.UUID(int=99)
    workouts = [did(other, MONDAY, complete=False)]

    assert suggest(ROTATING, workouts, {}, MONDAY) == Suggestion(Kind.SUGGEST, A, Reason.NEXT)


# --- the week ------------------------------------------------------------------------------------


def test_the_week_is_complete_once_each_day_was_trained() -> None:
    workouts = [did(A, MONDAY), did(B, TUESDAY), did(C, WEDNESDAY)]
    last = {A: MONDAY, B: TUESDAY, C: WEDNESDAY}

    assert (done(workouts, THURSDAY), target(ROTATING)) == (3, 3)
    # The day named only says where another round would start: the one trained longest ago.
    assert suggest(ROTATING, workouts, last, THURSDAY) == Suggestion(Kind.COMPLETE, A)


def test_workouts_of_the_plan_before_count_towards_the_week() -> None:
    """A new plan on Wednesday: Monday's and Tuesday's workouts are still this week's."""
    old = uuid.UUID(int=50)
    workouts = [did(old, MONDAY), did(None, TUESDAY)]  # one of them from a plan since deleted

    assert done(workouts, WEDNESDAY) == 2
    assert suggest(ROTATING, workouts, {}, WEDNESDAY) == Suggestion(Kind.SUGGEST, A, Reason.NEXT)
    assert suggest(
        ROTATING, [*workouts, did(A, WEDNESDAY)], {A: WEDNESDAY}, THURSDAY
    ) == Suggestion(Kind.COMPLETE, B)


def test_a_day_trained_twice_is_two_workouts() -> None:
    workouts = [did(A, MONDAY), did(A, WEDNESDAY)]

    assert done(workouts, THURSDAY) == 2
    assert trained(workouts, THURSDAY) == {A}
    assert suggest(ROTATING, workouts, {A: WEDNESDAY}, THURSDAY) == Suggestion(
        Kind.SUGGEST, B, Reason.NEXT
    )


def test_a_plan_of_one_day_is_complete_after_one_workout() -> None:
    one = days(None)

    assert suggest(one, [], {}, MONDAY) == Suggestion(Kind.SUGGEST, A, Reason.NEXT)
    assert suggest(one, [did(A, MONDAY)], {A: MONDAY}, TUESDAY) == Suggestion(Kind.COMPLETE, A)


def test_the_target_is_a_workout_per_day_of_the_plan() -> None:
    assert target(FIXED) == 3
    assert target([PlanDay(uuid.UUID(int=n), None, n) for n in range(9)]) == 7  # a week has seven
    assert target([]) == 0


def test_a_plan_without_days_suggests_nothing() -> None:
    assert suggest([], [], {}, MONDAY) == Suggestion(Kind.REST, None)


def test_friday_with_two_left_names_the_one_due() -> None:
    workouts = [did(A, MONDAY)]

    assert suggest(FIXED, workouts, {A: MONDAY}, FRIDAY) == Suggestion(Kind.SUGGEST, C, Reason.PLAN)
