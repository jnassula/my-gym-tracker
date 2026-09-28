"""Localised transactional emails for the auth domain."""

from app.core.email import EmailMessage
from app.users.models import Language

_RESET = {
    Language.PT: (
        "Recuperar palavra-passe",
        "Olá {name},\n\n"
        "Recebemos um pedido para definir uma nova palavra-passe na tua conta myGymTracker.\n"
        "Abre este link para continuar (expira em {minutes} minutos):\n\n{link}\n\n"
        "Se não foste tu, ignora este email: a tua palavra-passe não muda.\n",
    ),
    Language.EN: (
        "Reset your password",
        "Hi {name},\n\n"
        "We received a request to set a new password for your myGymTracker account.\n"
        "Open this link to continue (it expires in {minutes} minutes):\n\n{link}\n\n"
        "If it wasn't you, ignore this email: your password stays the same.\n",
    ),
    Language.ES: (
        "Recuperar contraseña",
        "Hola {name}:\n\n"
        "Hemos recibido una solicitud para establecer una nueva contraseña en tu cuenta de "
        "myGymTracker.\n"
        "Abre este enlace para continuar (caduca en {minutes} minutos):\n\n{link}\n\n"
        "Si no fuiste tú, ignora este correo: tu contraseña no cambia.\n",
    ),
}


def password_reset_email(
    *, to: str, name: str, language: Language, link: str, minutes: int
) -> EmailMessage:
    subject, body = _RESET[language]
    return EmailMessage(
        to=to,
        subject=f"myGymTracker · {subject}",
        text=body.format(name=name, link=link, minutes=minutes),
    )
