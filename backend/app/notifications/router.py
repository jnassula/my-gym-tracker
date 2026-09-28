from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.auth.dependencies import CurrentUser
from app.core.db import SessionDep
from app.notifications import service
from app.notifications.schemas import (
    NotificationSettingsRead,
    NotificationSettingsUpdate,
    NotificationsRead,
    RestSchedule,
    SubscriptionCreate,
    TestResult,
)
from app.notifications.sender import PushSender, get_push_sender

router = APIRouter(prefix="/notifications", tags=["notifications"])

SenderDep = Annotated[PushSender, Depends(get_push_sender)]


@router.get("")
async def read(user: CurrentUser, session: SessionDep, sender: SenderDep) -> NotificationsRead:
    """The settings, and the key a browser needs to subscribe (null: push is off here)."""
    return await service.read(session, sender, user)


@router.patch("/settings")
async def update_settings(
    body: NotificationSettingsUpdate, user: CurrentUser, session: SessionDep
) -> NotificationSettingsRead:
    return await service.update_settings(session, user, body)


@router.post("/subscriptions", status_code=status.HTTP_204_NO_CONTENT)
async def subscribe(body: SubscriptionCreate, user: CurrentUser, session: SessionDep) -> None:
    """Turn notifications on for this device (a ``PushSubscription`` from the browser)."""
    await service.subscribe(session, user, body)


@router.delete("/subscriptions", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe(
    user: CurrentUser, session: SessionDep, endpoint: Annotated[str, Query(max_length=2048)]
) -> None:
    await service.unsubscribe(session, user, endpoint)


@router.post("/test")
async def send_test(user: CurrentUser, session: SessionDep, sender: SenderDep) -> TestResult:
    """Send a test notification to every device of the user."""
    return TestResult(sent=await service.send_test(session, sender, user))


@router.post("/rest", status_code=status.HTTP_204_NO_CONTENT)
async def schedule_rest_end(
    body: RestSchedule, user: CurrentUser, session: SessionDep, sender: SenderDep
) -> None:
    """The app went to the background mid-rest: notify when it ends ("Fim do descanso")."""
    await service.schedule_rest_end(session, sender, user, body.ends_at)


@router.delete("/rest", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_rest_end(user: CurrentUser) -> None:
    """Back in the app (or the rest was skipped): no notification."""
    service.cancel_rest_end(user.id)
