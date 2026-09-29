"""Outgoing email. SMTP through the standard library, run in a worker thread.

Services depend on the ``Mailer`` protocol (FastAPI dependency ``get_mailer``) so tests can
swap in an in-memory outbox. In development the SMTP server is Mailpit (see docker-compose).

A message is always readable as plain text; ``html`` is the branded version of the same
content (``app/core/email_layout.py``) and ``images`` are the pictures it shows by ``cid:``.
"""

import asyncio
import logging
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage as MimeMessage
from typing import Protocol

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)

SMTP_TIMEOUT_SECONDS = 10


@dataclass(frozen=True)
class InlineImage:
    """A picture sent inside the message, so it shows without loading anything remote."""

    cid: str
    data: bytes
    subtype: str = "png"


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    text: str
    html: str | None = None
    images: tuple[InlineImage, ...] = ()


def build_mime(message: EmailMessage, *, sender: str) -> MimeMessage:
    """Plain text, with the HTML as its alternative and the images related to the HTML."""
    mime = MimeMessage()
    mime["From"] = sender
    mime["To"] = message.to
    mime["Subject"] = message.subject
    mime.set_content(message.text)
    if message.html is None:
        return mime
    mime.add_alternative(message.html, subtype="html")
    html_part = mime.get_body(preferencelist=("html",))
    if html_part is None:  # pragma: no cover  # just added above
        return mime
    for image in message.images:
        html_part.add_related(
            image.data,
            maintype="image",
            subtype=image.subtype,
            cid=f"<{image.cid}>",
            disposition="inline",
            filename=f"{image.cid}.{image.subtype}",
        )
    return mime


class Mailer(Protocol):
    async def send(self, message: EmailMessage) -> None: ...


class SmtpMailer:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def send(self, message: EmailMessage) -> None:
        # Runs as a background task after the response: failures are logged, never raised.
        try:
            await asyncio.to_thread(self._send_sync, message)
        except (OSError, smtplib.SMTPException):
            logger.exception("Failed to send email %r", message.subject)

    def _send_sync(self, message: EmailMessage) -> None:
        settings = self._settings
        mime = build_mime(message, sender=settings.email_from)
        with smtplib.SMTP(
            settings.smtp_host, settings.smtp_port, timeout=SMTP_TIMEOUT_SECONDS
        ) as smtp:
            if settings.smtp_starttls:
                smtp.starttls()
            if settings.smtp_username and settings.smtp_password:
                smtp.login(settings.smtp_username, settings.smtp_password.get_secret_value())
            smtp.send_message(mime)


def get_mailer() -> Mailer:
    return SmtpMailer(get_settings())
