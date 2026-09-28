"""PDF bytes → text for the LLM: the page text with its layout kept, plus any table cells.

The two views complement each other. Layout text keeps each exercise on the same line as its rest
time, but squeezes a summary's side-by-side columns together; table cells (when the PDF draws a
grid, as spreadsheet exports do) say exactly which text sits under which weekday.
"""

import io
import logging

import pdfplumber

logger = logging.getLogger(__name__)

MAX_PAGES = 20
# A workout plan is a few thousand characters; this bounds what one import sends to the LLM.
MAX_CHARS = 60_000
PAGE_TEXT_HEADER = "=== Page text (layout kept) ==="
TABLES_HEADER = (
    "=== Table cells, row by row (' | ' separates cells, ' / ' is a line break in a cell) ==="
)

Table = list[list[str | None]]


class UnreadablePdfError(Exception):
    """Not a PDF, encrypted, corrupt, or too long to be a workout plan."""


def render_tables(tables: list[Table]) -> str:
    """One line per row. Merged cells (None) are left out; empty cells stay, so columns line up."""
    lines = []
    for table in tables:
        for row in table:
            cells = [(cell or "").replace("\n", " / ").strip() for cell in row if cell is not None]
            if any(cells):
                lines.append(" | ".join(cells))
        lines.append("")
    return "\n".join(lines).strip()


def extract_text(data: bytes) -> str:
    """All pages, top to bottom. An empty string means the PDF has no text layer (a scan)."""
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            if len(pdf.pages) > MAX_PAGES:
                raise UnreadablePdfError(f"More than {MAX_PAGES} pages")
            pages = [page.extract_text(layout=True) or "" for page in pdf.pages]
            tables = [table.extract() for page in pdf.pages for table in page.find_tables()]
    except UnreadablePdfError:
        raise
    except Exception as exc:  # untrusted input: any parser failure is "unreadable"
        logger.info("Unreadable PDF: %s", exc)
        raise UnreadablePdfError(str(exc)) from exc
    # Layout mode pads the page with blank lines and trailing spaces; they only cost tokens.
    lines = [line.rstrip() for page in pages for line in page.splitlines()]
    page_text = "\n".join(line for line in lines if line.strip())
    if not page_text:
        return ""
    text = f"{PAGE_TEXT_HEADER}\n{page_text}"
    if cells := render_tables(tables):
        text += f"\n\n{TABLES_HEADER}\n{cells}"
    if len(text) > MAX_CHARS:
        raise UnreadablePdfError(f"More than {MAX_CHARS} characters of text")
    return text
