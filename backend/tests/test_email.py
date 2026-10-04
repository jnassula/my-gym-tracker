"""The message on the wire (``build_mime``) and the branded layout (pure)."""

import smtplib
import ssl
from typing import Any, Self

import pytest

from app.core.config import get_settings
from app.core.email import EmailMessage, InlineImage, SmtpMailer, build_mime
from app.core.email_layout import (
    ACCENT,
    LOGO_CID,
    Step,
    button,
    checklist,
    logo,
    paragraph,
    render,
)

SENDER = "myGymTracker <no-reply@example.pt>"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def test_a_text_message_is_sent_as_plain_text() -> None:
    mime = build_mime(EmailMessage(to="a@example.pt", subject="Olá", text="Texto"), sender=SENDER)

    assert mime["From"] == SENDER
    assert mime["To"] == "a@example.pt"
    assert mime.get_content_type() == "text/plain"
    assert mime.get_content().strip() == "Texto"


def test_html_is_the_alternative_of_the_text_and_carries_its_images() -> None:
    message = EmailMessage(
        to="a@example.pt",
        subject="Olá",
        text="Texto",
        html='<img src="cid:logo">',
        images=(InlineImage(cid="logo", data=PNG_SIGNATURE),),
    )

    mime = build_mime(message, sender=SENDER)

    assert mime.get_content_type() == "multipart/alternative"
    text, related = mime.iter_parts()
    assert text.get_content_type() == "text/plain"
    assert related.get_content_type() == "multipart/related"
    html, image = related.iter_parts()
    assert html.get_content_type() == "text/html"
    assert image.get_content_type() == "image/png"
    assert image["Content-ID"] == "<logo>"
    assert image.get_content_disposition() == "inline"
    assert image.get_content() == PNG_SIGNATURE


def test_the_logo_is_a_png_the_layout_shows_by_content_id() -> None:
    html = render(
        language="pt",
        subject="Assunto",
        preheader="Resumo",
        kicker="Conta",
        title="Título",
        blocks=[paragraph("Corpo")],
        footer="Rodapé",
    )

    assert logo().cid == LOGO_CID
    assert logo().data.startswith(PNG_SIGNATURE)
    assert f'src="cid:{LOGO_CID}"' in html
    assert '<html lang="pt">' in html
    for text in ("Assunto", "Resumo", "Conta", "Título", "Corpo", "Rodapé"):
        assert text in html


def test_the_layout_escapes_what_it_is_given() -> None:
    html = render(
        language="pt",
        subject="s",
        preheader="p",
        kicker="k",
        title="Olá <script>alert(1)</script>",
        blocks=[paragraph("<b>negrito</b>"), button('"Abrir"', 'https://x.pt/?a=1&b="2"')],
        footer="f",
    )

    assert "<script>" not in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
    assert "&lt;b&gt;negrito&lt;/b&gt;" in html
    assert 'href="https://x.pt/?a=1&amp;b=&quot;2&quot;"' in html


def test_the_checklist_shows_how_much_is_done() -> None:
    html = checklist(
        "Treino",
        "1/4 ex.",
        [Step("Um", "feito", done=True), *(Step(str(n), "por fazer") for n in range(3))],
    )

    assert f'<td width="25%" height="4" bgcolor="{ACCENT}"' in html
    assert html.count("&#10003;") == 1


def test_a_button_writes_the_address_out_only_when_asked() -> None:
    assert button("Abrir", "https://x.pt/a").count("https://x.pt/a") == 1

    with_fallback = button("Abrir", "https://x.pt/a", fallback="Copia o endereço:")

    assert "Copia o endereço:" in with_fallback
    assert ">https://x.pt/a</a>" in with_fallback


class FakeSmtp:
    """Stands in for ``smtplib.SMTP``: records how the connection was secured."""

    contexts: list[ssl.SSLContext | None]

    def __init__(self, *_: Any, **__: Any) -> None:
        pass

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *_: object) -> None:
        pass

    def starttls(self, *, context: ssl.SSLContext | None = None) -> None:
        self.contexts.append(context)

    def send_message(self, _: Any) -> None:
        pass


def test_starttls_checks_the_servers_certificate(monkeypatch: pytest.MonkeyPatch) -> None:
    FakeSmtp.contexts = []
    monkeypatch.setattr(smtplib, "SMTP", FakeSmtp)
    settings = get_settings().model_copy(update={"smtp_starttls": True})

    SmtpMailer(settings)._send_sync(EmailMessage(to="ana@example.pt", subject="Olá", text="Olá"))

    [context] = FakeSmtp.contexts
    assert context is not None
    assert context.verify_mode is ssl.CERT_REQUIRED
    assert context.check_hostname
