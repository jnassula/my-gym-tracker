"""PDF bytes → visual lines with word positions (the only I/O-facing part of the parser)."""

import io
import logging

import pdfplumber

from app.workouts.parser.types import Line, Word

logger = logging.getLogger(__name__)

MAX_PAGES = 20
# Words whose tops differ by less than this belong to the same line.
_LINE_TOLERANCE = 2.5


class UnreadablePdfError(Exception):
    """Not a PDF, encrypted, corrupt, or too long to be a workout plan."""


def _group_lines(words: list[Word]) -> list[Line]:
    lines: list[list[Word]] = []
    for word in sorted(words, key=lambda w: (w.top, w.x0)):
        if lines and abs(lines[-1][0].top - word.top) < _LINE_TOLERANCE:
            lines[-1].append(word)
        else:
            lines.append([word])
    return [Line(words=tuple(sorted(line, key=lambda w: w.x0))) for line in lines]


def extract_lines(data: bytes) -> list[Line]:
    """All pages, top to bottom. An empty list means the PDF has no text layer (a scan)."""
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            if len(pdf.pages) > MAX_PAGES:
                raise UnreadablePdfError(f"More than {MAX_PAGES} pages")
            lines: list[Line] = []
            offset = 0.0
            for page in pdf.pages:
                words = [
                    Word(text=w["text"], x0=w["x0"], x1=w["x1"], top=w["top"] + offset)
                    for w in page.extract_words(x_tolerance=2, y_tolerance=2)
                ]
                lines += _group_lines(words)
                offset += float(page.height)
            return lines
    except UnreadablePdfError:
        raise
    except Exception as exc:  # untrusted input: any parser failure is "unreadable"
        logger.info("Unreadable PDF: %s", exc)
        raise UnreadablePdfError(str(exc)) from exc
