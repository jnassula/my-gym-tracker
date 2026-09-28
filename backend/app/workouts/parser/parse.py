"""Lines of a workout-plan PDF → structured plan. Pure: no I/O, deterministic.

Layout this understands (the trainer's template, see tests/fixtures):

    Periodização de Treino 01              ← title
    Aluno: …   Trocar até: 15/04/2024      ← valid until
    Segunda Feira  Terça Feira  …          ← summary: one column per training day …
    Quadriceps e   Peitoral, …             ← … with the day's focus underneath (multi-line)
    Segunda Feira            Tempo de intervalo
    Cadeira Extensora 3x12 Rm …    1 minuto   ← exercise | prescription | rest column
    Esteira: 30 Minutos …                     ← cardio  ┐
    Aquecimento                               ← marker  ├ warm-up block, listed after the
    Cadeira Extensora 2x20 (carga leve)       ←         ┘ exercises but done first
    Terça Feira                               ← next day section
"""

import re
from collections.abc import Sequence
from datetime import date

from app.exercises.models import MuscleGroup
from app.workouts.parser.muscle_groups import guess_muscle_group, is_cardio
from app.workouts.parser.prescription import SET_MARK, parse_prescription, parse_rest
from app.workouts.parser.text import normalize, tidy
from app.workouts.parser.types import (
    Line,
    ParsedDay,
    ParsedExercise,
    ParsedPlan,
    ParseWarning,
    Word,
)

WEEKDAYS = {
    "segunda": 0, "terca": 1, "quarta": 2, "quinta": 3, "sexta": 4, "sabado": 5, "domingo": 6,
}  # fmt: skip
_VALID_UNTIL = re.compile(r"trocar\s+ate\s*:?\s*(\d{1,2})/(\d{1,2})/(\d{2,4})")
_REST_DAY = re.compile(r"^(day ?off|descanso|folga|off)$")
_FOOTER = re.compile(r"^bons treinos")
_WARMUP = re.compile(r"^aquecimento\b:?\s*")
_CONTINUATION = set("abcdefghijklmnopqrstuvwxyzáàâãéêíóôõúç(")
# Anything right of the "Tempo de intervalo" header is the rest column.
_REST_HEADER_MARGIN = 5.0


def weekday_of(text: str) -> int | None:
    """ "Segunda Feira", "Segunda-feira", "Sábado" → 0…6."""
    key = re.sub(r"[-\s]*feira$", "", normalize(text)).strip()
    return WEEKDAYS.get(key)


def _weekday_columns(line: Line) -> list[tuple[int, float]]:
    """(weekday, x centre) for each weekday named on a summary header line."""
    columns: list[tuple[int, float]] = []
    words = line.words
    index = 0
    while index < len(words):
        weekday = WEEKDAYS.get(normalize(words[index].text))
        if weekday is None:
            index += 1
            continue
        x0, x1 = words[index].x0, words[index].x1
        if index + 1 < len(words) and normalize(words[index + 1].text) == "feira":
            x1 = words[index + 1].x1
            index += 1
        columns.append((weekday, (x0 + x1) / 2))
        index += 1
    return columns


def _split_columns(line: Line, rest_x: float | None) -> tuple[str, str]:
    if rest_x is None:
        return line.text, ""
    left = [w.text for w in line.words if w.x0 < rest_x]
    right = [w.text for w in line.words if w.x0 >= rest_x]
    return " ".join(left), " ".join(right)


def _rest_column_x(lines: Sequence[Line]) -> float | None:
    for line in lines:
        words = line.words
        for i in range(len(words) - 2):
            if normalize(words[i].text) == "tempo" and normalize(words[i + 2].text) == "intervalo":
                return words[i].x0 - _REST_HEADER_MARGIN
    return None


def _day_focus(lines: Sequence[Line], columns: list[tuple[int, float]]) -> dict[int, str]:
    """Assign every summary word to the nearest weekday column, then read each column."""
    buckets: dict[int, list[Word]] = {weekday: [] for weekday, _ in columns}
    for line in lines:
        for word in line.words:
            weekday = min(columns, key=lambda col: abs(col[1] - word.center))[0]
            buckets[weekday].append(word)
    return {
        weekday: tidy(" ".join(w.text for w in sorted(words, key=lambda w: (round(w.top), w.x0))))
        for weekday, words in buckets.items()
    }


def _is_cardio_line(text: str) -> bool:
    """Cardio lines name a machine and a duration, never "Nx" sets."""
    return is_cardio(text) and not SET_MARK.search(text)


def _exercise(text: str, rest: str, *, warmup: bool) -> ParsedExercise:
    cardio = _is_cardio_line(text)
    parsed = parse_prescription(text, cardio=cardio)
    rest_min, rest_max = parse_rest(rest)
    # Combined exercises ("A + B") take the group of the first one.
    primary = parsed.name.split(" + ")[0]
    group = MuscleGroup.WARMUP if warmup or cardio else guess_muscle_group(primary)
    warnings = list(parsed.warnings)
    if cardio or warmup:
        warnings = [w for w in warnings if w is not ParseWarning.NO_SETS]
    if group is None:
        warnings.append(ParseWarning.UNKNOWN_MUSCLE_GROUP)
    return ParsedExercise(
        name=parsed.name,
        muscle_group=group,
        sets=parsed.sets,
        reps=parsed.reps,
        rest_seconds=rest_min,
        rest_max_seconds=rest_max,
        notes=parsed.notes,
        warnings=warnings,
    )


def _parse_section(
    lines: Sequence[Line], rest_x: float | None
) -> tuple[list[ParsedExercise], bool]:
    """Exercises of one day (warm-up first) and whether the day is a rest day."""
    main: list[tuple[str, str]] = []
    warmup: list[tuple[str, str]] = []
    in_warmup = False
    rest_day = False

    for line in lines:
        left, right = _split_columns(line, rest_x)
        key = normalize(left)
        if not key:
            # A rest value alone on its line belongs to the previous exercise.
            target = warmup if in_warmup else main
            if right and target and not target[-1][1]:
                target[-1] = (target[-1][0], right)
            continue
        if _FOOTER.match(key):
            continue
        if _REST_DAY.match(key):
            rest_day = True
            continue
        if marker := _WARMUP.match(key):
            in_warmup = True
            remainder = left[marker.end() :].strip() if marker.end() < len(left) else ""
            if remainder:
                warmup.append((remainder, right))
            continue
        if _is_cardio_line(left):
            warmup.append((left, right))
            continue
        target = warmup if in_warmup else main
        if target and not right and not SET_MARK.search(left) and left[:1] in _CONTINUATION:
            # Wrapped line ("… no final de" / "cada série"): extends the previous exercise.
            target[-1] = (f"{target[-1][0]} {left}", target[-1][1])
            continue
        target.append((left, right))

    exercises = [_exercise(t, r, warmup=True) for t, r in warmup]
    exercises += [_exercise(t, r, warmup=False) for t, r in main]
    return exercises, rest_day


def _valid_until(lines: Sequence[Line]) -> date | None:
    for line in lines:
        if match := _VALID_UNTIL.search(normalize(line.text)):
            day, month, year = (int(g) for g in match.groups())
            year += 2000 if year < 100 else 0
            try:
                return date(year, month, day)
            except ValueError:
                return None
    return None


def parse_plan(lines: Sequence[Line]) -> ParsedPlan:
    rest_x = _rest_column_x(lines)

    # Day sections start on a line whose left column is exactly one weekday name.
    starts: list[tuple[int, int]] = []
    for index, line in enumerate(lines):
        left, _ = _split_columns(line, rest_x)
        weekday = weekday_of(left)
        if weekday is not None:
            starts.append((index, weekday))

    first_section = starts[0][0] if starts else len(lines)
    header = lines[:first_section]
    summary_at = next(
        (i for i, line in enumerate(header) if len(_weekday_columns(line)) >= 2), None
    )
    focus: dict[int, str] = {}
    if summary_at is not None:
        focus = _day_focus(header[summary_at + 1 :], _weekday_columns(header[summary_at]))

    days: list[ParsedDay] = []
    rest_days: list[int] = []
    for position, (start, weekday) in enumerate(starts):
        end = starts[position + 1][0] if position + 1 < len(starts) else len(lines)
        exercises, rest_day = _parse_section(lines[start + 1 : end], rest_x)
        label = focus.get(weekday, "")
        if rest_day or not exercises or _REST_DAY.match(normalize(label)):
            rest_days.append(weekday)
            continue
        days.append(ParsedDay(weekday=weekday, label=label, exercises=exercises))
    # Rest days may only appear in the summary (no section of their own).
    rest_days += [weekday for weekday, text in focus.items() if _REST_DAY.match(normalize(text))]

    title = tidy(header[0].text) if header else None
    return ParsedPlan(
        title=title or None,
        valid_until=_valid_until(header),
        days=days,
        rest_days=sorted(set(rest_days)),
    )
