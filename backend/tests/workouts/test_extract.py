import re

import pytest

import app.workouts.parser.extract as extract_module
from app.workouts.parser import UnreadablePdfError, extract_text
from app.workouts.parser.extract import PAGE_TEXT_HEADER, TABLES_HEADER, Table, render_tables
from tests.workouts.layout import PLAN, blank_pdf, to_pdf


def _line(text: str, start: str) -> str:
    [line] = [line for line in text.splitlines() if line.lstrip().startswith(start)]
    return line


def test_keeps_the_layout_the_llm_needs() -> None:
    text = extract_text(to_pdf(PLAN))

    assert text.splitlines()[:2] == [PAGE_TEXT_HEADER, text.splitlines()[1]]
    assert text.splitlines()[1].strip() == "Periodização de Treino 07"
    # No grid drawn in this PDF, so there are no table cells to add.
    assert TABLES_HEADER not in text
    # The rest column stays on its exercise's line, set apart by a run of spaces.
    squat = _line(text, "Agachamento Livre")
    assert re.fullmatch(
        r"\s*Agachamento Livre 1x15 \(carga leve\) \+ 2x8 a 12 Rm\s{2,}entre 1 a 2 minutos", squat
    )
    # Summary columns stay side by side, in order.
    summary = next(line for line in text.splitlines() if "Sexta Feira" in line)
    days = [summary.index(day) for day in ("Segunda", "Terça", "Quarta", "Sexta")]
    assert days == sorted(days)


def test_table_cells_keep_each_weekday_with_its_focus() -> None:
    summary: Table = [
        ["Periodização de Treino 02", None, None],
        ["Segunda Feira", "Terça Feira", "Quarta Feira"],
        ["Quadriceps e Glúteos", "Peitoral, Ombros,\nAbdômen", ""],
        ["Segunda Feira", None, "Tempo de intervalo"],
        [None, None, None],
    ]
    exercises: Table = [["Cadeira Extensora 3x12 Rm\nAgachamento 3x10 Rm", None, "1 minuto"]]

    assert render_tables([summary, exercises]) == (
        "Periodização de Treino 02\n"
        "Segunda Feira | Terça Feira | Quarta Feira\n"
        "Quadriceps e Glúteos | Peitoral, Ombros, / Abdômen | \n"
        "Segunda Feira | Tempo de intervalo\n"
        "\n"
        "Cadeira Extensora 3x12 Rm / Agachamento 3x10 Rm | 1 minuto"
    )


def test_drops_blank_lines_and_trailing_spaces() -> None:
    lines = extract_text(to_pdf(PLAN)).splitlines()

    assert all(line.strip() and line == line.rstrip() for line in lines)


def test_scanned_pdf_has_no_text() -> None:
    assert extract_text(blank_pdf()) == ""


@pytest.mark.parametrize("data", [b"", b"not a pdf at all", b"%PDF-1.4\n garbage"])
def test_garbage_is_unreadable(data: bytes) -> None:
    with pytest.raises(UnreadablePdfError):
        extract_text(data)


def test_refuses_more_text_than_a_workout_plan_has(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(extract_module, "MAX_CHARS", 100)

    with pytest.raises(UnreadablePdfError):
        extract_text(to_pdf(PLAN))
