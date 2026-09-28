"""Workout-plan PDF → ``ParsedPlan``, in two steps.

``extract_text`` (pdfplumber, local) turns the PDF into text with its layout kept; a
``PlanParser`` (an LLM agent, see ``agent``) turns that text into days and exercises.
"""

from app.workouts.parser.agent import ParserUnavailableError, PlanParser, get_plan_parser
from app.workouts.parser.extract import UnreadablePdfError, extract_text
from app.workouts.parser.output import NoWorkoutStructureError
from app.workouts.parser.types import ParsedDay, ParsedExercise, ParsedPlan, ParseWarning

__all__ = [
    "NoWorkoutStructureError",
    "ParseWarning",
    "ParsedDay",
    "ParsedExercise",
    "ParsedPlan",
    "ParserUnavailableError",
    "PlanParser",
    "UnreadablePdfError",
    "extract_text",
    "get_plan_parser",
]
