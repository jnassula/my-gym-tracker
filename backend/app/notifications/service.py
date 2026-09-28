"""Business logic for notifications: settings, this device's subscription, sending.

Routers only map HTTP to these functions; the scheduled reminders live in ``scheduler``.
"""

import asyncio
import contextlib
import logging
import uuid
from datetime import datetime, time, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import utcnow
from app.notifications import messages
from app.notifications.models import NotificationSettings, PushSubscription
from app.notifications.schemas import (
    NotificationSettingsRead,
    NotificationSettingsUpdate,
    NotificationsRead,
    SubscriptionCreate,
)
from app.notifications.sender import Endpoint, PushMessage, PushSender, SendResult
from app.users.models import User

logger = logging.getLogger(__name__)

DEFAULTS = {
    "training_reminder": True,
    "reminder_time": time(17, 30),
    "rest_end": True,
    "weekly_summary": False,
    "new_record": True,
    "plan_expiring": True,
}
# A rest longer than this isn't a rest: refuse to hold a timer for it.
MAX_REST = timedelta(hours=1)


def now() -> datetime:
    """The clock (tests move it)."""
    return utcnow()


# --- settings ------------------------------------------------------------------------------------


async def get_settings(session: AsyncSession, user_id: uuid.UUID) -> NotificationSettings:
    """The user's settings; the defaults (not saved) until they first change one."""
    stored = await session.get(NotificationSettings, user_id)
    return stored or NotificationSettings(user_id=user_id, **DEFAULTS)


async def read(session: AsyncSession, sender: PushSender, user: User) -> NotificationsRead:
    return NotificationsRead(
        public_key=sender.public_key,
        settings=NotificationSettingsRead.model_validate(await get_settings(session, user.id)),
    )


async def update_settings(
    session: AsyncSession, user: User, data: NotificationSettingsUpdate
) -> NotificationSettingsRead:
    stored = await session.get(NotificationSettings, user.id)
    if stored is None:
        stored = NotificationSettings(user_id=user.id, **DEFAULTS)
        session.add(stored)
    for field in data.model_fields_set:
        setattr(stored, field, getattr(data, field))
    await session.commit()
    return NotificationSettingsRead.model_validate(stored)


# --- subscriptions -------------------------------------------------------------------------------


async def subscribe(session: AsyncSession, user: User, data: SubscriptionCreate) -> None:
    """Remember this device. A browser signing in as someone else moves its endpoint over."""
    existing = await session.scalar(
        select(PushSubscription).where(PushSubscription.endpoint == data.endpoint)
    )
    if existing is None:
        session.add(
            PushSubscription(
                user_id=user.id,
                endpoint=data.endpoint,
                p256dh=data.keys.p256dh,
                auth=data.keys.auth,
            )
        )
    else:
        existing.user_id = user.id
        existing.p256dh = data.keys.p256dh
        existing.auth = data.keys.auth
    await session.commit()


async def unsubscribe(session: AsyncSession, user: User, endpoint: str) -> None:
    await session.execute(
        delete(PushSubscription).where(
            PushSubscription.user_id == user.id, PushSubscription.endpoint == endpoint
        )
    )
    await session.commit()


async def _endpoints(session: AsyncSession, user_id: uuid.UUID) -> list[PushSubscription]:
    return list(
        await session.scalars(select(PushSubscription).where(PushSubscription.user_id == user_id))
    )


# --- sending -------------------------------------------------------------------------------------


def _endpoint(subscription: PushSubscription) -> Endpoint:
    return Endpoint(
        endpoint=subscription.endpoint, p256dh=subscription.p256dh, auth=subscription.auth
    )


async def notify(
    session: AsyncSession, sender: PushSender, user_id: uuid.UUID, message: PushMessage
) -> int:
    """Send to every device of the user; forget devices the push service says are gone."""
    sent = 0
    for subscription in await _endpoints(session, user_id):
        result = await sender.send(_endpoint(subscription), message)
        if result is SendResult.SENT:
            sent += 1
        elif result is SendResult.GONE:
            await session.delete(subscription)
    await session.commit()
    return sent


async def send_test(session: AsyncSession, sender: PushSender, user: User) -> int:
    return await notify(session, sender, user.id, messages.test(user.language))


# --- end of rest (in-memory timers) --------------------------------------------------------------

# One pending "rest is over" per user. A lost timer (restart) only loses that notification.
_rest_timers: dict[uuid.UUID, asyncio.Task[None]] = {}


def cancel_rest_end(user_id: uuid.UUID) -> None:
    timer = _rest_timers.pop(user_id, None)
    if timer is not None:
        timer.cancel()


async def schedule_rest_end(
    session: AsyncSession, sender: PushSender, user: User, ends_at: datetime
) -> None:
    """The app went to the background mid-rest: notify its devices when the rest ends.
    The client cancels it when it comes back, so a visible app never gets a system notification."""
    cancel_rest_end(user.id)
    if not (await get_settings(session, user.id)).rest_end:
        return
    delay = (ends_at - now()).total_seconds()
    if delay < 0 or delay > MAX_REST.total_seconds():
        return
    endpoints = [_endpoint(subscription) for subscription in await _endpoints(session, user.id)]
    if not endpoints:
        return
    message = messages.rest_end(user.language)

    async def fire() -> None:
        await asyncio.sleep(delay)
        for endpoint in endpoints:
            await sender.send(endpoint, message)

    timer = asyncio.create_task(fire())
    _rest_timers[user.id] = timer

    def forget(done: asyncio.Task[None]) -> None:
        if _rest_timers.get(user.id) is done:
            del _rest_timers[user.id]
        with contextlib.suppress(asyncio.CancelledError):
            if not done.cancelled() and done.exception():
                logger.warning("Rest-end push failed", exc_info=done.exception())

    timer.add_done_callback(forget)
