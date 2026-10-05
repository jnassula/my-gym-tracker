"""The text of each notification, in the user's language (the app's copy is PT-PT first)."""

from datetime import date
from decimal import Decimal

from app.notifications.sender import PushMessage
from app.users.models import Language

_TEXT: dict[str, dict[Language, tuple[str, str]]] = {
    "training_reminder": {
        Language.PT: ("Hora de treinar", "Hoje: {label} · {done} de {target} esta semana."),
        Language.EN: ("Time to train", "Today: {label} · {done} of {target} this week."),
        Language.ES: ("Hora de entrenar", "Hoy: {label} · {done} de {target} esta semana."),
    },
    "weekly_summary": {
        Language.PT: ("Resumo da semana", "Treinos: {workouts} · {volume} t levantadas"),
        Language.EN: ("Your week", "Workouts: {workouts} · {volume} t lifted"),
        Language.ES: ("Resumen de la semana", "Entrenos: {workouts} · {volume} t levantadas"),
    },
    "plan_expiring": {
        Language.PT: (
            "O teu plano está a expirar",
            "“{name}” devia ser trocado até {date}. Pede o próximo PDF ao teu PT.",
        ),
        Language.EN: (
            "Your plan is expiring",
            "“{name}” should be swapped by {date}. Ask your trainer for the next PDF.",
        ),
        Language.ES: (
            "Tu plan está a punto de caducar",
            "«{name}» debería cambiarse antes del {date}. Pide el siguiente PDF a tu entrenador.",
        ),
    },
    "rest_end": {
        Language.PT: ("Fim do descanso", "Pronto — próxima série."),
        Language.EN: ("Rest is over", "Ready — next set."),
        Language.ES: ("Fin del descanso", "Listo — siguiente serie."),
    },
    "test": {
        Language.PT: ("myGymTracker", "As notificações estão ativas neste dispositivo."),
        Language.EN: ("myGymTracker", "Notifications are on for this device."),
        Language.ES: ("myGymTracker", "Las notificaciones están activas en este dispositivo."),
    },
}


def _decimal(value: Decimal, language: Language) -> str:
    text = f"{value:.1f}"
    return text if language is Language.EN else text.replace(".", ",")


def _message(kind: str, language: Language, url: str, **values: str) -> PushMessage:
    title, body = _TEXT[kind][language]
    return PushMessage(title=title, body=body.format(**values), url=url, tag=kind)


def training_reminder(language: Language, label: str, done: int, target: int) -> PushMessage:
    """The workout suggested for today, and how far the week has got."""
    return _message(
        "training_reminder", language, "/", label=label, done=str(done), target=str(target)
    )


def weekly_summary(language: Language, workouts: int, volume_kg: Decimal) -> PushMessage:
    return _message(
        "weekly_summary",
        language,
        "/progress",
        workouts=str(workouts),
        volume=_decimal(volume_kg / 1000, language),
    )


def plan_expiring(language: Language, name: str, valid_until: date) -> PushMessage:
    return _message(
        "plan_expiring", language, "/workouts/import", name=name, date=f"{valid_until:%d/%m}"
    )


def rest_end(language: Language) -> PushMessage:
    return _message("rest_end", language, "/")


def test(language: Language) -> PushMessage:
    return _message("test", language, "/settings/notifications")
