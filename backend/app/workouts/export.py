"""A plan as an A4 PDF, in the shape of the trainer's own plans (a heading per weekday, one
line per exercise with its sets and its rest), so it can be shared with a trainer or read
back by the import without losing anything. Pure: the caller loads the plan and the weights.

The text is what matters most: ``parser/prompt.py`` taught the LLM the trainer's wording
("Segunda Feira", "3x12", "1 minuto e 30 seg", an "Aquecimento" block), so the PDF writes the
same words. Weights go into the sets column, never into the name, which the parser takes as
"the words before the first set count"."""

import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import TYPE_CHECKING

from fpdf import FPDF, XPos, YPos
from fpdf.enums import TableBordersLayout, VAlign
from fpdf.fonts import FontFace

from app.exercises.models import MuscleGroup
from app.users.models import Language

if TYPE_CHECKING:
    from app.exercises.models import Exercise
    from app.workouts.models import WorkoutDay, WorkoutPlan

_FONTS = Path(__file__).resolve().parents[1] / "core" / "assets" / "fonts"

# Nocturne on paper: ink, muted ink, the accent and a hairline.
_INK = (22, 24, 38)
_MUTED = (110, 112, 130)
_ACCENT = (109, 94, 199)
_RULE = (210, 211, 222)


@dataclass(frozen=True)
class Wording:
    weekdays: tuple[str, ...]
    student: str  # "Aluno"
    created: str  # "Criado em"
    valid_until: str  # "Trocar até"
    exercise: str
    sets: str
    rest: str
    warmup: str
    unscheduled: str  # a day without a weekday: "Treino A"
    minute: str
    minutes: str
    seconds: str
    joiner: str  # between minutes and seconds: " e "
    between: str  # "{a} a {b}"
    with_weights: str  # the footnote when weights are included
    no_rest: str


WORDING: dict[Language, Wording] = {
    Language.PT: Wording(
        weekdays=("Segunda Feira", "Terça Feira", "Quarta Feira", "Quinta Feira", "Sexta Feira",
                  "Sábado", "Domingo"),
        student="Aluno", created="Criado em", valid_until="Trocar até",
        exercise="Exercício", sets="Séries", rest="Tempo de intervalo", warmup="Aquecimento",
        unscheduled="Treino {letter}", minute="min", minutes="min", seconds="seg",
        joiner=" e ", between="entre {a} a {b}",
        with_weights="Cargas: a última registada em cada exercício.",
        no_rest="-",
    ),
    Language.EN: Wording(
        weekdays=("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"),
        student="Athlete", created="Created on", valid_until="Replace by",
        exercise="Exercise", sets="Sets", rest="Rest", warmup="Warm-up",
        unscheduled="Workout {letter}", minute="min", minutes="min", seconds="s",
        joiner=" ", between="{a} to {b}",
        with_weights="Weights: the last one logged on each exercise.",
        no_rest="-",
    ),
    Language.ES: Wording(
        weekdays=("Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"),
        student="Atleta", created="Creado el", valid_until="Cambiar antes de",
        exercise="Ejercicio", sets="Series", rest="Descanso", warmup="Calentamiento",
        unscheduled="Entrenamiento {letter}", minute="min", minutes="min", seconds="seg",
        joiner=" y ", between="entre {a} y {b}",
        with_weights="Cargas: la última registrada en cada ejercicio.",
        no_rest="-",
    ),
}  # fmt: skip


def format_rest(seconds: int, wording: Wording) -> str:
    """90 → "1 min e 30 seg" (pt), "1 min 30 s" (en); 120 → "2 min"; 45 → "45 seg"."""
    minutes, rest = divmod(seconds, 60)
    parts: list[str] = []
    if minutes:
        parts.append(f"{minutes} {wording.minute if minutes == 1 else wording.minutes}")
    if rest or not minutes:
        parts.append(f"{rest} {wording.seconds}")
    return wording.joiner.join(parts)


def rest_text(exercise: "Exercise", wording: Wording) -> str:
    if exercise.rest_seconds is None:
        return wording.no_rest
    low = format_rest(exercise.rest_seconds, wording)
    if exercise.rest_max_seconds is None or exercise.rest_max_seconds == exercise.rest_seconds:
        return low
    return wording.between.format(a=low, b=format_rest(exercise.rest_max_seconds, wording))


def sets_text(sets: int | None, reps: str | None) -> str:
    """ "3x12"; a progression as the trainer writes it, "1x15, 1x12, 1x10"; "30 min" alone."""
    if sets is None:
        return reps or ""
    if reps is None:
        return f"{sets}x"
    steps = [step.strip() for step in reps.split("/") if step.strip()]
    if len(steps) > 1:
        # One figure per set; a shorter list repeats its last figure, as the builder does.
        per_set = [steps[i] if i < len(steps) else steps[-1] for i in range(sets)]
        return ", ".join(f"1x{step}" for step in per_set)
    return f"{sets}x{reps}"


def format_weight(weight: Decimal) -> str:
    text = f"{weight.normalize():f}"
    return f"{text} kg"


def format_date(day: date) -> str:
    return day.strftime("%d/%m/%Y")


def _day_title(day: "WorkoutDay", index: int, wording: Wording) -> str:
    if day.weekday is None:
        return wording.unscheduled.format(letter=chr(ord("A") + index))
    return wording.weekdays[day.weekday]


class _PlanPdf(FPDF):
    def __init__(self, app_name: str) -> None:
        super().__init__(orientation="portrait", format="A4")
        self.app_name = app_name
        self.add_font("Inter", "", _FONTS / "Inter-Regular.ttf")
        self.add_font("Inter", "B", _FONTS / "Inter-SemiBold.ttf")
        self.set_margins(18, 18, 18)
        self.set_auto_page_break(auto=True, margin=20)

    def footer(self) -> None:
        self.set_y(-14)
        self.set_font("Inter", "", 8)
        self.set_text_color(*_MUTED)
        self.cell(0, 6, self.app_name, align="L", new_x=XPos.RIGHT, new_y=YPos.TOP)
        self.cell(0, 6, str(self.page_no()), align="R")


def render_plan_pdf(
    plan: "WorkoutPlan",
    *,
    student: str,
    language: Language,
    today: date,
    weights: Mapping[uuid.UUID, Decimal] | None = None,
    app_name: str = "myGymTracker",
) -> bytes:
    """The plan's days in order. ``weights`` maps an exercise id to the weight to print."""
    wording = WORDING[language]
    pdf = _PlanPdf(app_name)
    pdf.add_page()

    pdf.set_text_color(*_INK)
    pdf.set_font("Inter", "B", 18)
    pdf.cell(0, 10, plan.name, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Inter", "", 10)
    pdf.set_text_color(*_MUTED)
    meta = [f"{wording.student}: {student}", f"{wording.created}: {format_date(today)}"]
    if plan.valid_until:
        meta.append(f"{wording.valid_until}: {format_date(plan.valid_until)}")
    pdf.cell(0, 6, "  ·  ".join(meta), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    if weights is not None:
        pdf.cell(0, 6, wording.with_weights, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(4)

    heading = FontFace(family="Inter", emphasis="BOLD", size_pt=8, color=_MUTED)
    body = FontFace(family="Inter", size_pt=10, color=_INK)
    for index, day in enumerate(plan.days):
        pdf.set_font("Inter", "B", 12)
        pdf.set_text_color(*_ACCENT)
        title = _day_title(day, index, wording)
        if day.label:
            title = f"{title} - {day.label}"
        pdf.cell(0, 8, title, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        # Warm-up first, as the parser expects, as its own table: the parser saw the trainer's
        # "Aquecimento" block that way, and one heading over several rows gets misread.
        warmups = [e for e in day.exercises if e.muscle_group is MuscleGroup.WARMUP]
        main = [e for e in day.exercises if e.muscle_group is not MuscleGroup.WARMUP]
        pdf.set_font("Inter", "", 10)
        for first_column, exercises in ((wording.warmup, warmups), (wording.exercise, main)):
            if not exercises:
                continue
            with pdf.table(
                col_widths=(50, 24, 26),
                v_align=VAlign.T,
                borders_layout=TableBordersLayout.HORIZONTAL_LINES,
                headings_style=heading,
                cell_fill_mode="NONE",
                line_height=5.5,
                padding=1.5,
                gutter_height=0,
                text_align=("LEFT", "LEFT", "LEFT"),
            ) as table:
                pdf.set_draw_color(*_RULE)
                header = table.row()
                for text in (first_column, wording.sets, wording.rest):
                    header.cell(text)
                for exercise in exercises:
                    row = table.row(style=body)
                    # A warm-up row says so under its name as well: a heading alone over
                    # several rows isn't enough for the reader to keep them warm-ups.
                    notes = [wording.warmup] if exercises is warmups else []
                    if exercise.notes:
                        notes.append(exercise.notes)
                    name = "\n".join([exercise.name, " · ".join(notes)]).rstrip("\n")
                    row.cell(name)
                    sets = sets_text(exercise.sets, exercise.reps)
                    weight = weights.get(exercise.id) if weights is not None else None
                    if weight is not None:
                        sets = f"{sets} ({format_weight(weight)})".strip()
                    row.cell(sets)
                    row.cell(rest_text(exercise, wording))
            pdf.ln(2)
        pdf.ln(3)

    return bytes(pdf.output())
