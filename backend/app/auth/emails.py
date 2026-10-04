"""Localised transactional emails for the auth domain.

Each email is written twice from the same copy: the plain text and the branded HTML
(``app/core/email_layout.py``). The welcome is a first workout with the account already
ticked off; the recovery link's expiry is drawn as the rest timer.
"""

from dataclasses import dataclass

from app.core.email import EmailMessage
from app.core.email_layout import (
    APP_NAME,
    Step,
    branded_email,
    button,
    checklist,
    countdown,
    note,
    paragraph,
)
from app.users.models import Language


@dataclass(frozen=True)
class _Welcome:
    subject: str
    preheader: str
    kicker: str
    title: str
    intro: str
    plan: str
    counter: str
    steps: tuple[tuple[str, str], ...]  # the first one is the account: already done
    action: str
    sign_off: str
    footer: str


@dataclass(frozen=True)
class _Reset:
    subject: str
    preheader: str
    kicker: str
    title: str
    greeting: str
    intro: str
    unit: str
    expires: str
    once: str
    action: str
    fallback: str
    open_link: str
    not_you: str
    footer: str


_WELCOME = {
    Language.PT: _Welcome(
        subject="A tua conta está pronta",
        preheader="Faltam três exercícios para o teu primeiro treino guiado.",
        kicker="Conta criada",
        title="Olá {name}, o aquecimento está feito.",
        intro=(
            "A tua conta está pronta. O myGymTracker transforma o plano do teu treinador num "
            "treino guiado, guarda as cargas de cada série e mostra a tua progressão."
        ),
        plan="Treino de arranque",
        counter="{done}/{total} ex.",
        steps=(
            ("Criar a conta", "Feito. Boa série."),
            (
                "Importar o plano",
                "Envia o PDF do teu treinador e revê os exercícios antes de confirmar.",
            ),
            (
                "Registar as séries",
                "Peso e repetições com um toque, e o descanso a contar sozinho.",
            ),
            ("Ver a progressão", "Recordes, volume por semana e semanas seguidas de treino."),
        ),
        action="Importar o meu plano",
        sign_off="Bons treinos!",
        footer=(
            "Recebeste este email porque foi criada uma conta no myGymTracker com este endereço."
        ),
    ),
    Language.EN: _Welcome(
        subject="Your account is ready",
        preheader="Three exercises to go before your first guided workout.",
        kicker="Account created",
        title="Hi {name}, the warm-up is done.",
        intro=(
            "Your account is ready. myGymTracker turns your trainer's plan into a guided "
            "workout, keeps the weight of every set and shows your progression."
        ),
        plan="Starter workout",
        counter="{done}/{total} ex.",
        steps=(
            ("Create your account", "Done. Good set."),
            (
                "Import your plan",
                "Upload your trainer's PDF and review the exercises before confirming.",
            ),
            ("Log your sets", "Weight and reps in one tap, with the rest counting by itself."),
            ("See your progression", "Records, weekly volume and weeks of training in a row."),
        ),
        action="Import my plan",
        sign_off="Train well!",
        footer=(
            "You received this email because an account was created on myGymTracker with "
            "this address."
        ),
    ),
    Language.ES: _Welcome(
        subject="Tu cuenta está lista",
        preheader="Te quedan tres ejercicios para tu primer entrenamiento guiado.",
        kicker="Cuenta creada",
        title="Hola {name}, el calentamiento está hecho.",
        intro=(
            "Tu cuenta está lista. myGymTracker convierte el plan de tu entrenador en un "
            "entrenamiento guiado, guarda las cargas de cada serie y te muestra tu progresión."
        ),
        plan="Entrenamiento de arranque",
        counter="{done}/{total} ej.",
        steps=(
            ("Crear la cuenta", "Hecho. Buena serie."),
            (
                "Importar el plan",
                "Sube el PDF de tu entrenador y revisa los ejercicios antes de confirmar.",
            ),
            (
                "Registrar las series",
                "Peso y repeticiones con un toque, y el descanso contando solo.",
            ),
            ("Ver la progresión", "Récords, volumen semanal y semanas seguidas entrenando."),
        ),
        action="Importar mi plan",
        sign_off="¡Buen entrenamiento!",
        footer=(
            "Has recibido este correo porque se ha creado una cuenta en myGymTracker con "
            "esta dirección."
        ),
    ),
}

_RESET = {
    Language.PT: _Reset(
        subject="Recuperar palavra-passe",
        preheader="O link expira em {minutes} minutos e só funciona uma vez.",
        kicker="Recuperar palavra-passe",
        title="De volta ao treino, {name}.",
        greeting="Olá {name},",
        intro=(
            "Recebemos um pedido para definir uma nova palavra-passe na tua conta myGymTracker."
        ),
        unit="min",
        expires="O link expira em {minutes} minutos",
        once="E só funciona uma vez. Se o tempo acabar, pede outro no ecrã de entrada.",
        action="Definir nova palavra-passe",
        fallback="Se o botão não abrir, copia este endereço para o navegador:",
        open_link="Abre este link para continuar:",
        not_you="Não foste tu? Ignora este email: a tua palavra-passe não muda.",
        footer=(
            "Recebeste este email porque alguém pediu para recuperar a palavra-passe desta conta."
        ),
    ),
    Language.EN: _Reset(
        subject="Reset your password",
        preheader="The link expires in {minutes} minutes and works only once.",
        kicker="Reset your password",
        title="Back to training, {name}.",
        greeting="Hi {name},",
        intro="We received a request to set a new password for your myGymTracker account.",
        unit="min",
        expires="The link expires in {minutes} minutes",
        once="And it works only once. If time runs out, ask for another on the sign-in screen.",
        action="Set a new password",
        fallback="If the button doesn't open, copy this address into your browser:",
        open_link="Open this link to continue:",
        not_you="Wasn't you? Ignore this email: your password stays the same.",
        footer=(
            "You received this email because someone asked to reset the password of this account."
        ),
    ),
    Language.ES: _Reset(
        subject="Recuperar contraseña",
        preheader="El enlace caduca en {minutes} minutos y solo funciona una vez.",
        kicker="Recuperar contraseña",
        title="De vuelta al entrenamiento, {name}.",
        greeting="Hola {name}:",
        intro=(
            "Hemos recibido una solicitud para establecer una nueva contraseña en tu cuenta "
            "de myGymTracker."
        ),
        unit="min",
        expires="El enlace caduca en {minutes} minutos",
        once=(
            "Y solo funciona una vez. Si se acaba el tiempo, pide otro en la pantalla de "
            "inicio de sesión."
        ),
        action="Establecer nueva contraseña",
        fallback="Si el botón no se abre, copia esta dirección en el navegador:",
        open_link="Abre este enlace para continuar:",
        not_you="¿No fuiste tú? Ignora este correo: tu contraseña no cambia.",
        footer=(
            "Has recibido este correo porque alguien pidió recuperar la contraseña de esta cuenta."
        ),
    ),
}


@dataclass(frozen=True)
class _Deleted:
    subject: str
    preheader: str
    kicker: str
    title: str
    body: str
    gone: str
    not_you: str
    footer: str


_DELETED = {
    Language.PT: _Deleted(
        subject="A tua conta foi eliminada",
        preheader="Os teus planos, treinos, pesagens e ficheiros foram apagados.",
        kicker="Conta eliminada",
        title="Até à próxima, {name}.",
        body="A tua conta myGymTracker foi eliminada, como pediste.",
        gone=(
            "Com ela foram apagados os teus planos, os treinos registados, as pesagens, os "
            "dados de saúde e os ficheiros. Não é possível recuperá-los."
        ),
        not_you="Não foste tu? Responde a este email: alguém entrou na tua conta.",
        footer="Recebeste este email porque a conta com este endereço foi eliminada.",
    ),
    Language.EN: _Deleted(
        subject="Your account was deleted",
        preheader="Your plans, workouts, weighings and files were erased.",
        kicker="Account deleted",
        title="Until next time, {name}.",
        body="Your myGymTracker account was deleted, as you asked.",
        gone=(
            "Your plans, logged workouts, weighings, health data and files were erased with "
            "it. They can't be recovered."
        ),
        not_you="Wasn't you? Reply to this email: someone got into your account.",
        footer="You received this email because the account with this address was deleted.",
    ),
    Language.ES: _Deleted(
        subject="Tu cuenta se ha eliminado",
        preheader="Tus planes, entrenamientos, pesajes y archivos se han borrado.",
        kicker="Cuenta eliminada",
        title="Hasta la próxima, {name}.",
        body="Tu cuenta de myGymTracker se ha eliminado, como pediste.",
        gone=(
            "Con ella se han borrado tus planes, los entrenamientos registrados, los pesajes, "
            "los datos de salud y los archivos. No se pueden recuperar."
        ),
        not_you="¿No has sido tú? Responde a este correo: alguien entró en tu cuenta.",
        footer="Has recibido este correo porque se eliminó la cuenta con esta dirección.",
    ),
}


def account_deleted_email(*, to: str, name: str, language: Language) -> EmailMessage:
    """Sent when someone deletes their own account: the last thing the address hears from us,
    and the way its owner finds out if it wasn't them."""
    copy = _DELETED[language]
    title = copy.title.format(name=name)
    return branded_email(
        to=to,
        subject=_subject(copy.subject),
        text=f"{title}\n\n{copy.body}\n\n{copy.gone}\n\n{copy.not_you}\n\n{copy.footer}\n",
        language=language.value,
        preheader=copy.preheader,
        kicker=copy.kicker,
        title=title,
        blocks=[paragraph(copy.body), paragraph(copy.gone, muted=True), note(copy.not_you)],
        footer=copy.footer,
    )


def _subject(subject: str) -> str:
    return f"{APP_NAME} · {subject}"


def welcome_email(*, to: str, name: str, language: Language, link: str) -> EmailMessage:
    """Sent once, when the account is created. ``link`` opens the plan import."""
    copy = _WELCOME[language]
    title = copy.title.format(name=name)
    steps = [
        Step(title=step, detail=detail, done=number == 0)
        for number, (step, detail) in enumerate(copy.steps)
    ]
    counter = copy.counter.format(done=1, total=len(steps))
    plan = "\n".join(f"[{'x' if step.done else ' '}] {step.title}: {step.detail}" for step in steps)
    text = (
        f"{title}\n\n{copy.intro}\n\n{copy.plan} ({counter})\n{plan}\n\n"
        f"{copy.action}:\n{link}\n\n{copy.sign_off}\n\n{copy.footer}\n"
    )
    return branded_email(
        to=to,
        subject=_subject(copy.subject),
        text=text,
        language=language.value,
        preheader=copy.preheader,
        kicker=copy.kicker,
        title=title,
        blocks=[
            paragraph(copy.intro),
            checklist(copy.plan, counter, steps),
            button(copy.action, link),
            paragraph(copy.sign_off, muted=True),
        ],
        footer=copy.footer,
    )


def password_reset_email(
    *, to: str, name: str, language: Language, link: str, minutes: int
) -> EmailMessage:
    copy = _RESET[language]
    expires = copy.expires.format(minutes=minutes)
    text = (
        f"{copy.greeting.format(name=name)}\n\n{copy.intro}\n{copy.open_link}\n\n{link}\n\n"
        f"{expires}. {copy.once}\n\n{copy.not_you}\n"
    )
    return branded_email(
        to=to,
        subject=_subject(copy.subject),
        text=text,
        language=language.value,
        preheader=copy.preheader.format(minutes=minutes),
        kicker=copy.kicker,
        title=copy.title.format(name=name),
        blocks=[
            paragraph(copy.intro),
            countdown(minutes, copy.unit, expires, copy.once),
            button(copy.action, link, fallback=copy.fallback),
            note(copy.not_you),
        ],
        footer=copy.footer,
    )
