"""Sends a sample of every auth email, to look at them in a real mail client.

    python -m app.auth.email_samples you@example.com [pt|en|es]

Goes through the configured SMTP server: Mailpit in development (http://localhost:8026).
The links are examples: the recovery one carries no valid token.
"""

import asyncio
import sys

from app.auth.emails import password_reset_email, welcome_email
from app.core.config import get_settings
from app.core.email import EmailMessage, SmtpMailer
from app.users.models import Language


def samples(to: str, language: Language) -> list[EmailMessage]:
    settings = get_settings()
    site = settings.frontend_url.rstrip("/")
    return [
        welcome_email(to=to, name="Jonata", language=language, link=f"{site}/workouts/import"),
        password_reset_email(
            to=to,
            name="Jonata",
            language=language,
            link=f"{site}/reset-password#token=sample",
            minutes=settings.password_reset_ttl_minutes,
        ),
    ]


async def main(to: str, language: Language) -> None:
    mailer = SmtpMailer(get_settings())
    for message in samples(to, language):
        await mailer.send(message)
        print(f"sent: {message.subject}")


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        sys.exit(__doc__)
    asyncio.run(main(sys.argv[1], Language(sys.argv[2]) if len(sys.argv) == 3 else Language.PT))
