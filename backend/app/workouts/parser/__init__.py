"""Workout-plan PDF parser: ``parse_pdf(bytes) -> ParsedPlan``.

Two layers so the rules can be tested without PDFs: ``extract`` (pdfplumber → positioned
lines) and ``parse`` (pure: lines → plan).
"""

from app.workouts.parser.extract import UnreadablePdfError, extract_lines
from app.workouts.parser.parse import parse_plan
from app.workouts.parser.types import ParsedDay, ParsedExercise, ParsedPlan, ParseWarning


class NoTextLayerError(UnreadablePdfError):
    """The PDF is an image (a scan): there is no text to read."""


class NoWorkoutStructureError(UnreadablePdfError):
    """Text was found, but no weekday sections with exercises."""


def parse_pdf(data: bytes) -> ParsedPlan:
    lines = extract_lines(data)
    if not lines:
        raise NoTextLayerError("No text layer")
    plan = parse_plan(lines)
    if not plan.days:
        raise NoWorkoutStructureError("No workout days found")
    return plan


__all__ = [
    "NoTextLayerError",
    "NoWorkoutStructureError",
    "ParseWarning",
    "ParsedDay",
    "ParsedExercise",
    "ParsedPlan",
    "UnreadablePdfError",
    "parse_pdf",
]
