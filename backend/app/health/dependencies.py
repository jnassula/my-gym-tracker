"""What a bridge's request carries: its source's token and the samples."""

import asyncio
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
from app.health.schemas import PARSERS, Batch
from app.users.models import User

# The shortcut's few days of samples are a few hundred KB of JSON. Health Connect's first sync is
# two days of heart rate, which a watch may write every second: about 8 MB.
MAX_BODY_BYTES = 16 * 1024 * 1024

_bearer = HTTPBearer(
    auto_error=False, description="A data source's token (Settings → Data sources)"
)


async def get_health_connection(
    session: SessionDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> tuple[User, HealthConnection]:
    if credentials is None:
        raise HealthTokenInvalidError
    return await service.authenticate(session, credentials.credentials)


HealthTokenUser = Annotated[tuple[User, HealthConnection], Depends(get_health_connection)]


async def read_batch(request: Request, token: HealthTokenUser) -> Batch:
    """The JSON body in the shape of the token's source, whatever Content-Type it comes with
    (the Shortcuts app sends a file body)."""
    _, connection = token
    body = await request.body()
    if len(body) > MAX_BODY_BYTES:
        raise HTTPException(HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
    try:
        # Megabytes of JSON to validate: in a thread, the event loop keeps serving.
        return await asyncio.to_thread(
            PARSERS[connection.provider].model_validate_json, body or b"{}"
        )
    except ValidationError as error:
        raise RequestValidationError(error.errors()) from error


BatchDep = Annotated[Batch, Depends(read_batch)]
