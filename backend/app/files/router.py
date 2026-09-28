import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.auth.dependencies import CurrentUser
from app.core.db import SessionDep
from app.core.storage import Storage, get_storage
from app.files import service

router = APIRouter(prefix="/files", tags=["files"])

StorageDep = Annotated[Storage, Depends(get_storage)]


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    file_id: uuid.UUID, user: CurrentUser, session: SessionDep, storage: StorageDep
) -> None:
    """Discard an upload, e.g. when an import preview is cancelled."""
    await service.delete_file(session, storage, user.id, file_id)


@router.get("/{file_id}/content", response_class=Response)
async def file_content(
    file_id: uuid.UUID, user: CurrentUser, session: SessionDep, storage: StorageDep
) -> Response:
    """The file itself, e.g. "Ver PDF" (shown inline)."""
    stored, data = await service.read_file(session, storage, user.id, file_id)
    return Response(
        content=data,
        media_type=stored.content_type,
        headers={"Content-Disposition": service.inline_disposition(stored.filename)},
    )
