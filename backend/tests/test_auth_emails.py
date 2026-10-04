"""The auth emails: the same content as plain text and as branded HTML, in every language."""

import re

import pytest

from app.auth.emails import (
    account_deleted_email,
    account_exists_email,
    confirm_email,
    password_reset_email,
    welcome_email,
)
from app.core.email_layout import logo
from app.users.models import Language


@pytest.mark.parametrize("language", list(Language))
def test_the_welcome_email_says_the_same_in_text_and_html(language: Language) -> None:
    message = welcome_email(
        to="a@example.pt",
        name="Ana & Rui",
        language=language,
        link="https://gym.pt/workouts/import",
    )

    assert message.html is not None
    assert message.images == (logo(),)
    assert "Ana & Rui" in message.text
    assert "Ana &amp; Rui" in message.html
    assert "[x]" in message.text
    assert message.text.count("[ ]") == 3
    assert message.html.count("&#10003;") == 1
    assert "1/4" in message.text
    assert "1/4" in message.html
    assert "https://gym.pt/workouts/import" in message.text
    assert 'href="https://gym.pt/workouts/import"' in message.html
    assert not re.search(r"\{\w+\}", message.text + message.html)  # no placeholder left behind


@pytest.mark.parametrize("language", list(Language))
def test_the_reset_email_says_the_same_in_text_and_html(language: Language) -> None:
    link = "https://gym.pt/reset-password#token=abc.def"

    message = password_reset_email(
        to="a@example.pt", name="Ana", language=language, link=link, minutes=45
    )

    assert message.html is not None
    assert link in message.text
    assert message.html.count(f'href="{link}"') == 2  # the button and the address written out
    assert "45" in message.text
    assert ">45</div>" in message.html
    assert not re.search(r"\{\w+\}", message.text + message.html)


@pytest.mark.parametrize("language", list(Language))
def test_the_confirmation_email_carries_its_link_in_text_and_html(language: Language) -> None:
    link = "https://gym.pt/verify-email#token=abc.def"

    message = confirm_email(
        to="a@example.pt", name="Ana & Rui", language=language, link=link, hours=24
    )

    assert message.html is not None
    assert "Ana & Rui" in message.text
    assert "Ana &amp; Rui" in message.html
    assert link in message.text
    assert message.html.count(link) > 1  # the button, and written out under it
    assert "24" in message.text
    assert "24" in message.html


@pytest.mark.parametrize("language", list(Language))
def test_an_existing_account_is_told_without_a_way_in(language: Language) -> None:
    message = account_exists_email(
        to="a@example.pt", name="<b>Ana</b>", language=language, link="https://gym.pt/login"
    )

    assert message.html is not None
    assert "https://gym.pt/login" in message.text
    assert "&lt;b&gt;Ana&lt;/b&gt;" in message.html
    assert "token" not in message.text
    assert "token" not in message.html


@pytest.mark.parametrize("language", list(Language))
def test_the_goodbye_says_the_same_in_text_and_html(language: Language) -> None:
    message = account_deleted_email(to="a@example.pt", name="Ana & Rui", language=language)

    assert message.html is not None
    assert "Ana & Rui" in message.text
    assert "Ana &amp; Rui" in message.html
    assert "http" not in message.text  # nothing to click: the account is gone
