"""Business logic for the files domain. Routers only map HTTP to these functions."""

import uuid
from pathlib import PurePath
from urllib.parse import quote

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import Storage
from app.files.errors import FileTooLargeError, StoredFileNotFoundError, UnsupportedFileTypeError
from app.files.models import FileKind, StoredFile

CHUNK_SIZE = 1024 * 1024
_MAX_FILENAME = 255


async def read_upload(upload: UploadFile, *, max_bytes: int) -> bytes:
    """Read an upload fully, refusing to buffer more than ``max_bytes``."""
    chunks: list[bytes] = []
    size = 0
    while chunk := await upload.read(CHUNK_SIZE):
        size += len(chunk)
        if size > max_bytes:
            raise FileTooLargeError(f"File is larger than {max_bytes // (1024 * 1024)} MB")
        chunks.append(chunk)
    return b"".join(chunks)


def require_pdf(data: bytes) -> None:
    """Trust the bytes, not the declared content type or extension."""
    if b"%PDF-" not in data[:1024]:
        raise UnsupportedFileTypeError("Only PDF files are accepted")


def _safe_filename(filename: str | None) -> str:
    name = PurePath(filename or "upload").name.strip() or "upload"
    return name[-_MAX_FILENAME:]


async def store_file(
    session: AsyncSession,
    storage: Storage,
    *,
    user_id: uuid.UUID,
    kind: FileKind,
    filename: str | None,
    content_type: str,
    data: bytes,
) -> StoredFile:
    """Upload to object storage and record it. The caller commits."""
    file_id = uuid.uuid4()
    key = f"users/{user_id}/{kind.value}/{file_id}"
    await storage.put(key, data, content_type)
    stored = StoredFile(
        id=file_id,
        user_id=user_id,
        kind=kind,
        object_key=key,
        filename=_safe_filename(filename),
        content_type=content_type,
        size_bytes=len(data),
    )
    session.add(stored)
    await session.flush()
    return stored


async def get_user_file(
    session: AsyncSession, user_id: uuid.UUID, file_id: uuid.UUID
) -> StoredFile:
    stored = await session.scalar(
        select(StoredFile).where(StoredFile.id == file_id, StoredFile.user_id == user_id)
    )
    if stored is None:
        raise StoredFileNotFoundError
    return stored


async def remove_file(
    session: AsyncSession, storage: Storage, user_id: uuid.UUID, file_id: uuid.UUID
) -> None:
    """Delete the row and the object. The caller commits."""
    stored = await get_user_file(session, user_id, file_id)
    await session.delete(stored)
    await session.flush()
    await storage.delete(stored.object_key)


async def delete_file(
    session: AsyncSession, storage: Storage, user_id: uuid.UUID, file_id: uuid.UUID
) -> None:
    await remove_file(session, storage, user_id, file_id)
    await session.commit()


async def read_file(
    session: AsyncSession, storage: Storage, user_id: uuid.UUID, file_id: uuid.UUID
) -> tuple[StoredFile, bytes]:
    stored = await get_user_file(session, user_id, file_id)
    return stored, await storage.get(stored.object_key)


def inline_disposition(filename: str) -> str:
    """RFC 6266: an ASCII fallback plus the UTF-8 name ("Treino Jonatã.pdf")."""
    fallback = filename.encode("ascii", "replace").decode().replace('"', "")
    return f"inline; filename=\"{fallback}\"; filename*=UTF-8''{quote(filename)}"
