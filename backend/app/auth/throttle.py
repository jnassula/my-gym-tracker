"""Failed sign-ins per account, whatever address they come from.

The per-address limit stops one client guessing; guesses spread over many addresses at one
account only meet this. It counts for any email, existing or not, so being refused says nothing
about which accounts exist. In memory, like the other counters (one backend instance).
"""

import math
from collections import deque
from datetime import datetime, timedelta

WINDOW = timedelta(minutes=15)
MAX_FAILURES = 10
# Emails remembered at once; past it, those whose failures all expired are forgotten.
MAX_TRACKED = 10_000


class LoginThrottle:
    def __init__(self) -> None:
        self._failures: dict[str, deque[datetime]] = {}

    def _recent(self, email: str, now: datetime) -> deque[datetime]:
        failures = self._failures.get(email)
        if failures is None:
            return deque()
        while failures and now - failures[0] >= WINDOW:
            failures.popleft()
        if not failures:
            del self._failures[email]
        return failures

    def retry_after(self, email: str, now: datetime) -> int | None:
        """Seconds until this email may sign in again; None when it may now."""
        failures = self._recent(email, now)
        if len(failures) < MAX_FAILURES:
            return None
        return max(1, math.ceil((failures[0] + WINDOW - now).total_seconds()))

    def failed(self, email: str, now: datetime) -> None:
        if len(self._failures) >= MAX_TRACKED:
            for tracked in list(self._failures):
                self._recent(tracked, now)
        self._failures.setdefault(email, deque(maxlen=MAX_FAILURES)).append(now)

    def succeeded(self, email: str) -> None:
        self._failures.pop(email, None)

    def reset(self) -> None:
        self._failures.clear()
