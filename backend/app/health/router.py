from fastapi import APIRouter, status

from app.auth.dependencies import CurrentUser
from app.core.db import SessionDep
from app.health import service
from app.health.dependencies import BatchDep, HealthTokenUser
from app.health.schemas import (
    HealthRead,
    HealthSettings,
    HealthSettingsUpdate,
    HealthToken,
    SyncResult,
)

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def read(user: CurrentUser, session: SessionDep) -> HealthRead:
    """Whether the shortcut is set up, its last sync, and what the app keeps."""
    return await service.read(session, user)


@router.post("/connection", status_code=status.HTTP_201_CREATED)
async def connect(user: CurrentUser, session: SessionDep) -> HealthToken:
    """A token for the iPhone shortcut, shown once. Calling it again replaces the token."""
    return await service.connect(session, user)


@router.delete("/connection", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect(user: CurrentUser, session: SessionDep) -> None:
    """Revoke the token and delete everything imported from the Health app."""
    await service.disconnect(session, user)


@router.patch("/settings")
async def update_settings(
    body: HealthSettingsUpdate, user: CurrentUser, session: SessionDep
) -> HealthSettings:
    """Turning a kind of data off also deletes what was imported of it."""
    return await service.update_settings(session, user, body)


@router.post("/sync")
async def sync(batch: BatchDep, token: HealthTokenUser, session: SessionDep) -> SyncResult:
    """The iPhone shortcut posts a few days of heart rate and active calories (authenticated by
    the Apple Health token, not a session). Only samples inside a session are kept."""
    user, connection = token
    return await service.store(session, user, connection, batch.samples())
