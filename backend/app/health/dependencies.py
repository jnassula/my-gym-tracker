"""What the shortcut's request carries: its token and the samples."""

from http import HTTPStatus
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import ValidationError

from app.core.db import SessionDep
from app.health import service
from app.health.errors import HealthTokenInvalidError
from app.health.models import HealthConnection
from app.health.schemas import SyncBatch
from app.users.models import User

# A few days of samples is a few hundred KB of JSON.
MAX_BODY_BYTES = 8 * 1024 * 1024

_bearer = HTTPBearer(auto_error=False, description="Apple Health token (Settings → Apple Health)")


async def get_health_connection(
    session: SessionDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> tuple[User, HealthConnection]:
    if credentials is None:
        raise HealthTokenInvalidError
    return await service.authenticate(session, credentials.credentials)


HealthTokenUser = Annotated[tuple[User, HealthConnection], Depends(get_health_connection)]


async def read_batch(request: Request) -> SyncBatch:
    """The JSON body, whatever Content-Type the Shortcuts app sends with a file body."""
    body = await request.body()
    if len(body) > MAX_BODY_BYTES:
        raise HTTPException(HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
    try:
        return SyncBatch.model_validate_json(body or b"{}")
    except ValidationError as error:
        raise RequestValidationError(error.errors()) from error


BatchDep = Annotated[SyncBatch, Depends(read_batch)]
