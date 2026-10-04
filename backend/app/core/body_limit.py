"""A cap on request bodies, enforced before anything reads them.

FastAPI reads a body (and spools a multipart upload to disk) before it resolves dependencies, so
without this an anonymous request is received whole before its 401 or its rate limit. Each route
gets what its payload needs (``limits``); everything else is small JSON (``default``).
"""

from collections.abc import Mapping
from http import HTTPStatus

from starlette.exceptions import HTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import error_response

Route = tuple[str, str]  # method, path


class BodyLimitMiddleware:
    def __init__(self, app: ASGIApp, *, default: int, limits: Mapping[Route, int]) -> None:
        self.app = app
        self.default = default
        self.limits = limits

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        limit = self.limits.get((scope["method"], scope["path"]), self.default)
        declared = _content_length(scope)
        if declared is not None and declared > limit:
            await _too_large(scope, receive, send)
            return

        # No declared size (a chunked body): counted as it arrives.
        received = 0
        exceeded = False
        started = False

        async def counted_receive() -> Message:
            nonlocal received, exceeded
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    exceeded = True
                    # Stops whoever is reading; the answer below replaces this one.
                    raise HTTPException(HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
            return message

        async def guarded_send(message: Message) -> None:
            nonlocal started
            if exceeded and not started:
                return
            started = True
            await send(message)

        await self.app(scope, counted_receive, guarded_send)
        if exceeded and not started:
            await _too_large(scope, receive, send)


def _content_length(scope: Scope) -> int | None:
    for name, value in scope["headers"]:
        if name == b"content-length":
            try:
                return int(value)
            except ValueError:
                return None
    return None


async def _too_large(scope: Scope, receive: Receive, send: Send) -> None:
    response = error_response(
        HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "Request body too large", "payload_too_large"
    )
    await response(scope, receive, send)
