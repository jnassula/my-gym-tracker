from datetime import UTC, datetime, timedelta

from app.auth.throttle import MAX_FAILURES, WINDOW, LoginThrottle

NOW = datetime(2026, 10, 4, 12, 0, tzinfo=UTC)
ANA = "ana@example.pt"


def failing(throttle: LoginThrottle, email: str, times: int, start: datetime = NOW) -> None:
    for second in range(times):
        throttle.failed(email, start + timedelta(seconds=second))


def test_a_few_failures_change_nothing() -> None:
    throttle = LoginThrottle()
    failing(throttle, ANA, MAX_FAILURES - 1)

    assert throttle.retry_after(ANA, NOW + timedelta(minutes=1)) is None


def test_too_many_failures_close_the_account_until_the_first_one_is_old() -> None:
    throttle = LoginThrottle()
    failing(throttle, ANA, MAX_FAILURES)

    assert throttle.retry_after(ANA, NOW + timedelta(minutes=5)) == 10 * 60
    assert throttle.retry_after(ANA, NOW + WINDOW - timedelta(seconds=1)) == 1
    assert throttle.retry_after(ANA, NOW + WINDOW) is None


def test_it_is_each_accounts_own_count() -> None:
    throttle = LoginThrottle()
    failing(throttle, ANA, MAX_FAILURES)

    assert throttle.retry_after("rui@example.pt", NOW) is None


def test_signing_in_starts_the_count_again() -> None:
    throttle = LoginThrottle()
    failing(throttle, ANA, MAX_FAILURES - 1)
    throttle.succeeded(ANA)
    failing(throttle, ANA, MAX_FAILURES - 1, NOW + timedelta(minutes=1))

    assert throttle.retry_after(ANA, NOW + timedelta(minutes=2)) is None
