"""Per-IP rate limiting (slowapi) with the app's ``{detail, code}`` error format.

Counters live in process memory: fine for a single backend instance. Behind a proxy the
client IP comes from ``X-Forwarded-For``, which uvicorn trusts only from
``FORWARDED_ALLOW_IPS``.
"""

import math
import time
from http import HTTPStatus

from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import get_settings
from app.core.errors import error_response

limiter = Limiter(key_func=get_remote_address, enabled=get_settings().rate_limit_enabled)


def _retry_after_seconds(request: Request) -> int | None:
    current = getattr(request.state, "view_rate_limit", None)
    if current is None:
        return None
    item, keys = current
    reset_at, _remaining = limiter.limiter.get_window_stats(item, *keys)
    return max(1, math.ceil(reset_at - time.time()))


async def rate_limit_exceeded_handler(request: Request, _: Exception) -> JSONResponse:
    """Registered for ``slowapi.errors.RateLimitExceeded``."""
    retry_after = _retry_after_seconds(request)
    return error_response(
        HTTPStatus.TOO_MANY_REQUESTS,
        "Too many attempts. Try again later.",
        "rate_limited",
        headers={"Retry-After": str(retry_after)} if retry_after else None,
    )
