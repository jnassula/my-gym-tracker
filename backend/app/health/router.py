from fastapi import APIRouter, status

from app.auth.dependencies import CurrentUser
from app.core.db import SessionDep
from app.health import service
from app.health.dependencies import BatchDep, HealthTokenUser
from app.health.models import HealthProvider
from app.health.schemas import (
    HealthOverview,
    HealthRead,
    HealthSettings,
    HealthSettingsUpdate,
    HealthToken,
    SyncResult,
)

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/connections")
async def overview(user: CurrentUser, session: SessionDep) -> HealthOverview:
    """Every data source: whether its bridge is set up, its last sync, and what the app keeps."""
    return await service.overview(session, user)


@router.post("/connections/{provider}", status_code=status.HTTP_201_CREATED)
async def connect(provider: HealthProvider, user: CurrentUser, session: SessionDep) -> HealthToken:
    """A token for the source's bridge, shown once. Calling it again replaces the token."""
    return await service.connect(session, user, provider)


@router.delete("/connections/{provider}", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect(provider: HealthProvider, user: CurrentUser, session: SessionDep) -> None:
    """Revoke the token and delete everything imported from the source."""
    await service.disconnect(session, user, provider)


@router.patch("/connections/{provider}/settings")
async def update_settings(
    provider: HealthProvider, body: HealthSettingsUpdate, user: CurrentUser, session: SessionDep
) -> HealthSettings:
    """Turning a kind of data off also deletes what the source sent of it."""
    return await service.update_settings(session, user, provider, body)


@router.post("/sync")
async def sync(batch: BatchDep, token: HealthTokenUser, session: SessionDep) -> SyncResult:
    """A bridge posts heart rate, active calories and weighings in its own shape (authenticated
    by its source's token, not a session). Of the watch's samples, only those inside a session
    are kept."""
    user, connection = token
    return await service.sync(session, user, connection, batch)


# --- Apple Health alone ---------------------------------------------------------------------------
# What the app called before there were other sources. An installed app keeps calling these until
# it updates: remove them a release after this one.


@router.get("", deprecated=True)
async def read_apple_health(user: CurrentUser, session: SessionDep) -> HealthRead:
    return await service.read(session, user)


@router.post("/connection", status_code=status.HTTP_201_CREATED, deprecated=True)
async def connect_apple_health(user: CurrentUser, session: SessionDep) -> HealthToken:
    return await service.connect(session, user, HealthProvider.APPLE_HEALTH)


@router.delete("/connection", status_code=status.HTTP_204_NO_CONTENT, deprecated=True)
async def disconnect_apple_health(user: CurrentUser, session: SessionDep) -> None:
    await service.disconnect(session, user, HealthProvider.APPLE_HEALTH)


@router.patch("/settings", deprecated=True)
async def update_apple_health_settings(
    body: HealthSettingsUpdate, user: CurrentUser, session: SessionDep
) -> HealthSettings:
    return await service.update_settings(session, user, HealthProvider.APPLE_HEALTH, body)
