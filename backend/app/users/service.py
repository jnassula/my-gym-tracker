"""Business logic for the users domain. Routers only map HTTP to these functions."""

import asyncio
import uuid

from fastapi import BackgroundTasks, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.errors import AdminProtectedError
from app.auth import passwords
from app.auth.emails import account_deleted_email
from app.auth.errors import InvalidCurrentPasswordError
from app.core.email import Mailer
from app.core.storage import Storage
from app.files import service as files
from app.files.errors import UnsupportedFileTypeError
from app.files.models import FileKind, StoredFile
from app.notifications.service import cancel_rest_end
from app.users import avatar
from app.users.models import User
from app.users.schemas import UserUpdate

# The app sends a 512 px JPEG (some tens of KB). The cap bounds what is read into memory and
# handed to the decoder.
MAX_AVATAR_BYTES = 1024 * 1024


async def get_user(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await session.get(User, user_id)


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    return await session.scalar(select(User).where(User.email == email.lower()))


async def update_user(session: AsyncSession, user: User, data: UserUpdate) -> User:
    for field in data.model_fields_set:
        setattr(user, field, getattr(data, field))
    await session.commit()
    return user


async def set_avatar(
    session: AsyncSession, storage: Storage, user: User, upload: UploadFile
) -> User:
    """Store the photo, as the square JPEG the app keeps, and drop the one it replaces."""
    data = await files.read_upload(upload, max_bytes=MAX_AVATAR_BYTES)
    try:
        # Decoding and scaling are CPU-bound: keep them off the event loop.
        photo = await asyncio.to_thread(avatar.normalise, data)
    except avatar.NotAnImageError as error:
        raise UnsupportedFileTypeError("Only JPEG, PNG and WebP images are accepted") from error
    previous = user.avatar_file_id
    stored = await files.store_file(
        session,
        storage,
        user_id=user.id,
        kind=FileKind.AVATAR,
        filename="avatar.jpg",
        content_type="image/jpeg",
        data=photo,
    )
    user.avatar_file_id = stored.id
    if previous is not None:
        await files.remove_file(session, storage, user.id, previous)
    await session.commit()
    return user


async def remove_avatar(session: AsyncSession, storage: Storage, user: User) -> User:
    if user.avatar_file_id is not None:
        previous, user.avatar_file_id = user.avatar_file_id, None
        await session.flush()  # the user lets go of the photo before its row goes
        await files.remove_file(session, storage, user.id, previous)
        await session.commit()
    return user


# --- deleting an account ---------------------------------------------------------------------


async def delete_account(session: AsyncSession, storage: Storage, user: User) -> None:
    """Deletes the account and everything it owns. There is no way back.

    The files go first: if the storage fails nothing else is lost and the deletion can be tried
    again (deleting an object that is gone succeeds), so no personal file is left behind.
    """
    keys = await session.scalars(select(StoredFile.object_key).where(StoredFile.user_id == user.id))
    for key in keys.all():
        await storage.delete(key)
    cancel_rest_end(user.id)
    await session.delete(user)  # every table that points at the user cascades
    await session.commit()


async def delete_own_account(
    session: AsyncSession,
    storage: Storage,
    user: User,
    password: str,
    *,
    mailer: Mailer,
    background: BackgroundTasks,
) -> None:
    """The user deletes their account, proving it is them with the password: a session left
    open on someone else's phone isn't enough. The address is told, in case it wasn't them."""
    if user.is_admin:
        raise AdminProtectedError  # an administrator steps down first (app.admin.grant --revoke)
    if not (await passwords.verify(password, user.password_hash))[0]:
        raise InvalidCurrentPasswordError
    goodbye = account_deleted_email(to=user.email, name=user.name, language=user.language)
    await delete_account(session, storage, user)
    background.add_task(mailer.send, goodbye)
