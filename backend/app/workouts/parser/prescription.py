"""Sets/reps and rest from the free-text prescriptions trainers write.

Examples handled: "3x12 Rm", "3x8 a 10 Rm", "1x15, 1x12, 1x10 Rm" (progression),
"1x15 (carga leve) + 2x8 a 12 Rm", "3x até a falha", "3x12 Rm + 1x (Drop Set) = FALHA",
"A 3x12 Rm + B 3x até a falha" (combined), "A 3x12 Rm ou B 3x12 Rm" (alternative),
"Esteira: 30 Minutos …" (cardio). Rest: "1 minuto e 20 seg", "entre 1 a 2 minutos",
"1 minuto/ 2 minutos", "40 seg".
"""

import re
from dataclasses import dataclass, field

from app.workouts.parser.text import normalize, tidy
from app.workouts.parser.types import ParseWarning

MAX_REPS_LENGTH = 32
MAX_NAME_LENGTH = 120

# "3x", "3 x", "3×" followed by a space, digit, "(" or "-".
SET_MARK = re.compile(r"(?<![\w])(\d{1,2})\s*[xX×](?=[\s\d(\-]|$)")
# (?!\d) stops "45 seg" from backtracking to reps "4".
_RANGE = re.compile(
    r"^(\d{1,3})(?!\d)(?:\s*(?:a|-|–|até)\s*(\d{1,3})(?!\d))?(?!\s*(?:seg|min|s\b))"
)
# Matched on the original text so labels keep their accents ("Método 3 por 1").
_TECHNIQUE = re.compile(
    r"\b(drop ?set|rest ?pause|cluster ?set|top ?set|bi ?-?set|super ?set|m[ée]todo [^)=]+)",
    re.IGNORECASE,
)
_FAILURE = re.compile(r"^-?\s*(ate (a|à) )?falha")
_TIME = re.compile(r"^(\d+(?:[.,]\d+)?\s*(?:seg\w*|min\w*|s)\b.*?)(?:[,+]|$)")
# Words that start a "+ …" segment without it being a second exercise.
_NOT_A_NAME = {
    "drop", "rest", "cluster", "top", "falha", "carga", "isometria", "pausa", "pico",
    "rm", "repeticoes", "repeticao", "series", "serie", "segundos", "descanso", "com",
}  # fmt: skip
_CARDIO_MINUTES = re.compile(r"(\d+)\s*min", re.IGNORECASE)
_CARDIO_DURATION = re.compile(r"\d+\s*minutos?(\s+de)?", re.IGNORECASE)
_CARDIO_DETAIL = re.compile(r"\s(na|no|com|a|em)\s|\s?[(+]", re.IGNORECASE)


@dataclass
class Prescription:
    name: str
    sets: int | None
    reps: str | None
    notes: str | None
    warnings: list[ParseWarning] = field(default_factory=list)


def _technique_label(segment: str) -> str | None:
    match = _TECHNIQUE.search(segment)
    return tidy(match.group(1)) if match else None


def _reps_after_mark(text: str) -> str | None:
    """Reps written right after an "Nx" mark: "12", "8 a 10" → "8-10", "até a falha", "45 seg"."""
    text = text.strip()
    if match := _RANGE.match(text):
        low, high = match.group(1), match.group(2)
        return f"{low}-{high}" if high else low
    lowered = normalize(text)
    if _FAILURE.match(lowered):
        return "falha"
    if match := _TIME.match(lowered):
        time = match.group(1)
        time = re.sub(r"segundos?|seg\b", "s", time)
        time = re.sub(r"\bmin\w*", "min", time)
        return tidy(time.replace(" e ", " "))
    return None


def _is_second_exercise(segment: str) -> bool:
    words = segment.strip().split()
    if not words or not words[0][0].isalpha() or not words[0][0].isupper():
        return False
    return normalize(words[0]).strip("()") not in _NOT_A_NAME and _technique_label(segment) is None


def _format_reps(reps: list[str]) -> str | None:
    if not reps:
        return None
    unique = list(dict.fromkeys(reps))
    joined = unique[0] if len(unique) == 1 else "/".join(reps)
    return joined if len(joined) <= MAX_REPS_LENGTH else joined[: MAX_REPS_LENGTH - 1] + "…"


def _parse_cardio(text: str) -> Prescription:
    """ "Esteira: 30 Minutos na Velocidade 6.5 km/h", "30 Minutos de Esteira na Velocidade …",
    "Simulador de Escada 20 Minutos" → name "Esteira"/"Simulador de Escada", reps "30 min"."""
    name, colon, detail = text.partition(":")
    if not colon:
        name = _CARDIO_DURATION.sub("", text).strip()
        name = _CARDIO_DETAIL.split(name, maxsplit=1)[0]
    minutes = _CARDIO_MINUTES.search(detail if colon else text)
    return Prescription(
        name=tidy(name),
        sets=None,
        reps=f"{minutes.group(1)} min" if minutes else None,
        notes=tidy(detail if colon else text) or None,
    )


def parse_prescription(text: str, *, cardio: bool = False) -> Prescription:
    """Split an exercise line into name, sets, reps and notes (the original prescription)."""
    if cardio:
        return _parse_cardio(text)

    first = SET_MARK.search(text)
    if first is None:
        return Prescription(name=tidy(text), sets=None, reps=None, notes=None,
                            warnings=[ParseWarning.NO_SETS])  # fmt: skip

    name = tidy(text[: first.start()])
    prescription = text[first.start() :].strip()
    warnings: list[ParseWarning] = []
    names = [name]
    total_sets = 0
    reps: list[str] = []
    technique_sets = 0
    technique: str | None = None

    for index, segment in enumerate(prescription.split("+")):
        if index > 0 and _is_second_exercise(segment):
            # "… + Prancha Abdominal 3x até a falha": done together, keep the first's sets.
            second = SET_MARK.search(segment)
            second_name = (
                segment[: second.start()]
                if second
                else re.split(r"\s(?=[(\d])", segment.strip(), maxsplit=1)[0]
            )
            names.append(tidy(second_name))
            warnings.append(ParseWarning.COMBINED_EXERCISE)
            break
        # Anything after "=" details a technique ("1x (Drop Set) = FALHA + FALHA").
        head = segment.split("=", 1)[0]
        # "A 3x12 Rm ou B 3x12 Rm": keep the first option.
        alternative = re.search(r"\sou\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])", head)
        if alternative:
            head = head[: alternative.start()]
            warnings.append(ParseWarning.ALTERNATIVE_EXERCISE)
        marks = list(SET_MARK.finditer(head))
        for position, mark in enumerate(marks):
            count = int(mark.group(1))
            end = marks[position + 1].start() if position + 1 < len(marks) else len(head)
            after = head[mark.end() : end]
            if label := _technique_label(after):
                technique_sets += count
                technique = technique or label
                continue
            total_sets += count
            if value := _reps_after_mark(after):
                reps.append(value)
        if _technique_label(head):
            technique = technique or _technique_label(head)
        if alternative:
            break

    if technique:
        warnings.append(ParseWarning.TECHNIQUE_SETS)
    if total_sets == 0 and technique_sets:
        total_sets, reps = technique_sets, [technique or ""]

    full_name = " + ".join(n for n in names if n) or name
    return Prescription(
        name=full_name[:MAX_NAME_LENGTH],
        sets=total_sets or None,
        reps=_format_reps(reps),
        notes=tidy(prescription) or None,
        warnings=list(dict.fromkeys(warnings)),
    )


# --- rest -----------------------------------------------------------------------------------

_MINUTES = re.compile(r"(\d+(?:[.,]\d+)?)\s*(?:minutos?|mintuos?|min)\b")
_SECONDS = re.compile(r"(\d+)\s*(?:segundos?|seg|s)\b")
_BARE = re.compile(r"^\D*(\d+(?:[.,]\d+)?)\D*$")


def _seconds(part: str, default_unit: str | None) -> int | None:
    minutes = _MINUTES.search(part)
    seconds = _SECONDS.search(part)
    if minutes or seconds:
        total = float(minutes.group(1).replace(",", ".")) * 60 if minutes else 0.0
        total += int(seconds.group(1)) if seconds else 0
        return round(total)
    bare = _BARE.match(part)
    if bare and default_unit:
        value = float(bare.group(1).replace(",", "."))
        return round(value * 60 if default_unit == "min" else value)
    return None


def parse_rest(text: str | None) -> tuple[int | None, int | None]:
    """Rest in seconds as (min, max); max is None unless a range was given."""
    if not text:
        return None, None
    lowered = normalize(text)
    parts = [p for p in re.split(r"\s*/\s*|\s+a\s+", lowered) if p.strip()]
    unit = "min" if _MINUTES.search(lowered) else "s" if _SECONDS.search(lowered) else None
    values = [v for v in (_seconds(p, unit) for p in parts) if v is not None]
    if not values:
        return None, None
    low, high = min(values), max(values)
    return low, (high if high != low else None)
