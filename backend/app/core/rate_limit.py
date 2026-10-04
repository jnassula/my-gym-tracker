"""Rate limiting (slowapi) with the app's ``{detail, code}`` error format.

Two layers: ``GlobalRateLimit`` is a ceiling on everything one client sends to the API, checked
before the body is read; ``@limiter.limit`` adds a tighter limit to the endpoints that need one.
Counters live in process memory: fine for a single backend instance. Behind a proxy the client
IP comes from ``X-Forwarded-For``, which uvicorn trusts only from ``FORWARDED_ALLOW_IPS``.
"""

import math
import time
from collections.abc import Callable
from http import HTTPStatus

from fastapi import Request
from fastapi.responses import JSONResponse
from limits import RateLimitItem, parse
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.config import get_settings
from app.core.errors import error_response

limiter = Limiter(key_func=get_remote_address, enabled=get_settings().rate_limit_enabled)


def _retry_after(item: RateLimitItem, *keys: str) -> int:
    reset_at, _remaining = limiter.limiter.get_window_stats(item, *keys)
    return max(1, math.ceil(reset_at - time.time()))


def _too_many(retry_after: int | None) -> JSONResponse:
    return error_response(
        HTTPStatus.TOO_MANY_REQUESTS,
        "Too many attempts. Try again later.",
        "rate_limited",
        headers={"Retry-After": str(retry_after)} if retry_after else None,
    )


async def rate_limit_exceeded_handler(request: Request, _: Exception) -> JSONResponse:
    """Registered for ``slowapi.errors.RateLimitExceeded``."""
    current = getattr(request.state, "view_rate_limit", None)
    if current is None:
        return _too_many(None)
    item, keys = current
    return _too_many(_retry_after(item, *keys))


class GlobalRateLimit:
    """What one client (``key``) may send to ``prefix`` in all, whatever the endpoint."""

    def __init__(
        self, app: ASGIApp, *, limit: str, prefix: str, key: Callable[[Request], str]
    ) -> None:
        self.app = app
        self.item = parse(limit)
        self.prefix = prefix
        self.key = key

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and limiter.enabled and scope["path"].startswith(self.prefix):
            keys = ("global", self.key(Request(scope)))
            if not limiter.limiter.hit(self.item, *keys):
                await _too_many(_retry_after(self.item, *keys))(scope, receive, send)
                return
        await self.app(scope, receive, send)
