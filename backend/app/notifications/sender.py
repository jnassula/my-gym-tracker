"""Web Push delivery. Services depend on the ``PushSender`` protocol (``get_push_sender``) so
tests record messages instead of calling push services."""

import base64
import json
import logging
from dataclasses import asdict, dataclass
from enum import StrEnum
from functools import lru_cache
from typing import Protocol

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from py_vapid import Vapid01
from pywebpush import WebPushException, webpush_async

from app.core.config import get_settings
from app.notifications.endpoints import is_push_service

logger = logging.getLogger(__name__)

# Push services keep an undelivered message this long (a phone offline for a while).
TTL_SECONDS = 12 * 60 * 60


@dataclass(frozen=True)
class PushMessage:
    title: str
    body: str
    url: str = "/"
    # Same tag: a newer notification replaces the older one on the device.
    tag: str | None = None


@dataclass(frozen=True)
class Endpoint:
    endpoint: str
    p256dh: str
    auth: str


class SendResult(StrEnum):
    SENT = "sent"
    GONE = "gone"  # the subscription expired or was revoked: forget it
    FAILED = "failed"


class PushSender(Protocol):
    @property
    def public_key(self) -> str | None: ...
    async def send(self, endpoint: Endpoint, message: PushMessage) -> SendResult: ...


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def generate_vapid_key() -> str:
    """A new VAPID private key: the raw P-256 scalar, base64url (VAPID_PRIVATE_KEY)."""
    key = ec.generate_private_key(ec.SECP256R1())
    return _b64url(key.private_numbers().private_value.to_bytes(32, "big"))


def public_key_of(private_key: str) -> str:
    """The browser's ``applicationServerKey``: the uncompressed public point, base64url."""
    vapid = Vapid01.from_string(private_key)
    return _b64url(vapid.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint))


class WebPushSender:
    def __init__(self, private_key: str, subject: str) -> None:
        self._vapid = Vapid01.from_string(private_key)
        self._subject = subject
        self._public_key = public_key_of(private_key)

    @property
    def public_key(self) -> str | None:
        return self._public_key

    async def send(self, endpoint: Endpoint, message: PushMessage) -> SendResult:
        if not is_push_service(endpoint.endpoint):  # stored before only push services were taken
            return SendResult.GONE
        try:
            await webpush_async(
                subscription_info={
                    "endpoint": endpoint.endpoint,
                    "keys": {"p256dh": endpoint.p256dh, "auth": endpoint.auth},
                },
                data=json.dumps(asdict(message)),
                vapid_private_key=self._vapid,
                vapid_claims={"sub": self._subject},
                ttl=TTL_SECONDS,
                timeout=10,
            )
        except WebPushException as exc:
            if exc.status_code in (404, 410):
                return SendResult.GONE
            # The status alone: the message carries whatever the other side answered.
            logger.warning("Push failed (%s)", exc.status_code)
            return SendResult.FAILED
        except Exception:  # network trouble must not break a request or the scheduler
            logger.warning("Push failed", exc_info=True)
            return SendResult.FAILED
        return SendResult.SENT


class DisabledSender:
    """No VAPID key configured: notifications are off, the rest of the app works."""

    @property
    def public_key(self) -> str | None:
        return None

    async def send(self, endpoint: Endpoint, message: PushMessage) -> SendResult:
        return SendResult.FAILED


@lru_cache
def get_push_sender() -> PushSender:
    settings = get_settings()
    private_key = settings.vapid_private_key.get_secret_value()
    if not private_key:
        logger.warning("VAPID_PRIVATE_KEY is not set: push notifications are disabled")
        return DisabledSender()
    return WebPushSender(private_key, settings.vapid_subject)
