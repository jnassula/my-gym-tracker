"""Consistent error responses: every error body is ``{"detail": str, "code": str}``.

Validation errors additionally carry ``errors`` (field location + message). The submitted
input is never echoed back, so passwords cannot leak through a 422 response.
"""

import logging
from collections.abc import Mapping
from http import HTTPStatus
from typing import Any, cast

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class FieldError(BaseModel):
    loc: list[str | int]
    msg: str
    type: str


class ErrorResponse(BaseModel):
    detail: str
    code: str
    errors: list[FieldError] | None = None


class AppError(Exception):
    """Base class for errors raised by services. Routers never build error responses."""

    status_code: int = HTTPStatus.BAD_REQUEST
    code: str = "bad_request"
    detail: str = "Bad request"
    headers: dict[str, str] | None = None

    def __init__(self, detail: str | None = None, *, code: str | None = None) -> None:
        self.detail = detail or self.detail
        self.code = code or self.code
        super().__init__(self.detail)


class NotFoundError(AppError):
    status_code = HTTPStatus.NOT_FOUND
    code = "not_found"
    detail = "Resource not found"


class ConflictError(AppError):
    status_code = HTTPStatus.CONFLICT
    code = "conflict"
    detail = "Resource already exists"


class UnauthorizedError(AppError):
    status_code = HTTPStatus.UNAUTHORIZED
    code = "unauthorized"
    detail = "Not authenticated"
    headers = {"WWW-Authenticate": "Bearer"}  # noqa: RUF012  # read-only class default


class ForbiddenError(AppError):
    status_code = HTTPStatus.FORBIDDEN
    code = "forbidden"
    detail = "Not allowed"


def code_for_status(status_code: int) -> str:
    """404 -> "not_found", 429 -> "too_many_requests", ..."""
    try:
        return HTTPStatus(status_code).phrase.lower().replace(" ", "_").replace("-", "_")
    except ValueError:
        return "error"


def error_response(
    status_code: int,
    detail: str,
    code: str,
    *,
    headers: Mapping[str, str] | None = None,
    **extra: Any,
) -> JSONResponse:
    body = ErrorResponse(detail=detail, code=code, **extra)
    return JSONResponse(
        body.model_dump(exclude_none=True), status_code=status_code, headers=headers
    )


# Starlette types every handler as (Request, Exception); each is only registered for its own class.
async def _app_error(_: Request, exc: Exception) -> JSONResponse:
    err = cast(AppError, exc)
    return error_response(err.status_code, err.detail, err.code, headers=err.headers)


async def _http_error(_: Request, exc: Exception) -> JSONResponse:
    err = cast(StarletteHTTPException, exc)
    detail = err.detail if isinstance(err.detail, str) else HTTPStatus(err.status_code).phrase
    return error_response(
        err.status_code, detail, code_for_status(err.status_code), headers=err.headers
    )


async def _validation_error(_: Request, exc: Exception) -> JSONResponse:
    err = cast(RequestValidationError, exc)
    errors = [FieldError(loc=list(e["loc"]), msg=e["msg"], type=e["type"]) for e in err.errors()]
    return error_response(
        HTTPStatus.UNPROCESSABLE_CONTENT, "Invalid request", "validation_error", errors=errors
    )


async def _unhandled_error(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error", exc_info=exc)
    return error_response(
        HTTPStatus.INTERNAL_SERVER_ERROR, "Internal server error", "internal_error"
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _app_error)
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(Exception, _unhandled_error)
