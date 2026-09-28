import re
import unicodedata

_SPACES = re.compile(r"\s+")


def normalize(text: str) -> str:
    """Lower-case, accent-free, single-spaced: for matching, never for display."""
    decomposed = unicodedata.normalize("NFKD", text)
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return _SPACES.sub(" ", stripped).strip().lower()


def tidy(text: str) -> str:
    """Display cleanup: collapse spaces and trim dangling separators."""
    return _SPACES.sub(" ", text).strip(" \t-–=:+,;.")
