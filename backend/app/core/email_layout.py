"""The branded HTML of every email: Nocturne (design/README.md) within what mail clients allow.

Mail clients ignore stylesheets, web fonts and SVG, so this is tables with inline styles, the
system's sans-serif after Inter, and the logo as a PNG sent inside the message (``cid:``).
Always dark, like the app's default theme; the accent is a line or a glow, and the only fill
is the one action of the email.

Pure: text in, HTML out. Every value is escaped here, so callers pass plain text and compose
an email from blocks (``paragraph``, ``checklist``, ``countdown``, ``button``, ``note``).
"""

from collections.abc import Sequence
from dataclasses import dataclass
from functools import cache
from html import escape
from pathlib import Path
from typing import NewType

from app.core.email import EmailMessage, InlineImage

# Escaped markup, ready to be placed in the layout.
Html = NewType("Html", str)

APP_NAME = "myGymTracker"
LOGO_CID = "logo"
_LOGO_FILE = Path(__file__).parent / "assets" / "email-logo.png"

# The dark tokens of frontend/src/index.css.
GROUND = "#161826"
SURFACE = "#232532"
TEXT = "#e9e9ed"
MUTED = "#9397ab"
ACCENT = "#9184d9"
ACCENT_SOFT = "#b5abfc"  # chart-2: links
GLOW = "#2b2741"  # accent-900, the glow of the welcome screen
LINE = "#3f424d"
# The accent at 28% over the ground, as the dim segment of the logo (no rgba in Outlook).
ACCENT_DIM = "#383658"

_FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
_TABLE = 'role="presentation" cellpadding="0" cellspacing="0" border="0"'
_PANEL = (
    f'{_TABLE} width="100%" bgcolor="{GROUND}" style="background-color:{GROUND};'
    f'border:1px solid {LINE};border-radius:12px;border-collapse:separate"'
)

_STYLE = """<style>
:root{color-scheme:dark;supported-color-schemes:dark}
body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
img{border:0;outline:none;text-decoration:none}
@media (max-width:480px){
.card{padding:24px 20px!important}
.title{font-size:24px!important;line-height:30px!important}
}
</style>"""


@dataclass(frozen=True)
class Step:
    title: str
    detail: str
    done: bool = False


def _font(size: int, line: int, colour: str, weight: int = 400) -> str:
    return (
        f"font-family:{_FONT};font-size:{size}px;line-height:{line}px;"
        f"font-weight:{weight};color:{colour}"
    )


def paragraph(text: str, *, muted: bool = False) -> Html:
    return Html(f'<div style="{_font(16, 26, MUTED if muted else TEXT)}">{escape(text)}</div>')


def _step(number: int, step: Step) -> str:
    colour, edge, sign = (ACCENT, ACCENT, "&#10003;") if step.done else (MUTED, LINE, str(number))
    return (
        f'<tr><td style="padding:14px 18px;border-top:1px solid {LINE}">'
        f'<table {_TABLE} width="100%"><tr>'
        f'<td width="42" valign="top">'
        f'<div style="width:26px;height:26px;border:2px solid {edge};border-radius:50%;'
        f'text-align:center;{_font(13, 26, colour, 500)}">{sign}</div></td>'
        f'<td valign="top"><div style="{_font(15, 22, TEXT, 500)}">{escape(step.title)}</div>'
        f'<div style="{_font(14, 21, MUTED)}">{escape(step.detail)}</div></td>'
        f"</tr></table></td></tr>"
    )


def checklist(title: str, counter: str, steps: Sequence[Step]) -> Html:
    """A day of the plan, as the app shows it: progress on top, done exercises ticked."""
    done = sum(step.done for step in steps)
    percent = round(100 * done / len(steps)) if steps else 0
    bar = "font-size:0;line-height:0;height:4px;border-radius:2px"
    rows = "".join(_step(number, step) for number, step in enumerate(steps, start=1))
    return Html(
        f"<table {_PANEL}>"
        f'<tr><td style="padding:16px 18px 18px">'
        f'<table {_TABLE} width="100%"><tr>'
        f'<td style="{_font(15, 22, TEXT, 500)}">{escape(title)}</td>'
        f'<td align="right" style="{_font(13, 22, MUTED)}">{escape(counter)}</td>'
        f"</tr></table>"
        f'<table {_TABLE} width="100%" style="margin-top:12px"><tr>'
        f'<td width="{percent}%" height="4" bgcolor="{ACCENT}" style="{bar}">&nbsp;</td>'
        f'<td height="4" bgcolor="{LINE}" style="{bar}">&nbsp;</td>'
        f"</tr></table></td></tr>"
        f"{rows}</table>"
    )


def countdown(value: int, unit: str, title: str, detail: str) -> Html:
    """How long something lasts, drawn as the rest timer's ring."""
    return Html(
        f"<table {_PANEL}><tr>"
        f'<td width="64" valign="middle" style="padding:18px 16px 18px 18px">'
        f'<div style="width:56px;height:56px;border:4px solid {ACCENT};'
        f'border-right-color:{ACCENT_DIM};border-radius:50%;text-align:center">'
        f'<div style="padding-top:10px;{_font(20, 22, TEXT, 500)}">{value}</div>'
        f'<div style="{_font(11, 12, MUTED)}">{escape(unit)}</div></div></td>'
        f'<td valign="middle" style="padding:18px 18px 18px 0">'
        f'<div style="{_font(15, 22, TEXT, 500)}">{escape(title)}</div>'
        f'<div style="{_font(14, 21, MUTED)}">{escape(detail)}</div></td>'
        f"</tr></table>"
    )


def button(label: str, url: str, *, fallback: str | None = None) -> Html:
    """The one action of the email. ``fallback`` writes the address out under the button."""
    href = escape(url, quote=True)
    html = (
        f'<table {_TABLE} width="100%" style="border-collapse:separate"><tr>'
        f'<td align="center" bgcolor="{ACCENT}" style="background-color:{ACCENT};'
        f'border-radius:10px">'
        f'<a href="{href}" style="display:block;padding:15px 24px;border-radius:10px;'
        f'text-decoration:none;{_font(16, 22, GROUND, 500)}">{escape(label)}</a>'
        f"</td></tr></table>"
    )
    if fallback is not None:
        html += (
            f'<div style="padding-top:16px;{_font(13, 20, MUTED)}">{escape(fallback)}<br>'
            f'<a href="{href}" style="color:{ACCENT_SOFT};word-break:break-all">{href}</a></div>'
        )
    return Html(html)


def note(text: str) -> Html:
    return Html(
        f'<table {_TABLE} width="100%"><tr>'
        f'<td style="border-left:2px solid {ACCENT};padding:2px 0 2px 14px;'
        f'{_font(14, 22, MUTED)}">{escape(text)}</td></tr></table>'
    )


def render(
    *,
    language: str,
    subject: str,
    preheader: str,
    kicker: str,
    title: str,
    blocks: Sequence[Html],
    footer: str,
) -> str:
    """The whole document. ``preheader`` is the line mail clients show next to the subject."""
    rows = "".join(f'<tr><td style="padding-top:24px">{block}</td></tr>' for block in blocks)
    glow = f"radial-gradient(circle at 50% 88px,{GLOW} 0,{GROUND} 380px)"
    return f"""<!DOCTYPE html>
<html lang="{escape(language, quote=True)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>{escape(subject)}</title>
{_STYLE}
</head>
<body style="margin:0;padding:0;background-color:{GROUND}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">
{escape(preheader)}</div>
<table {_TABLE} width="100%" bgcolor="{GROUND}"
 style="background-color:{GROUND};background-image:{glow}">
<tr><td align="center" style="padding:36px 16px 48px">
<table {_TABLE} width="100%" style="max-width:520px">
<tr><td align="center" style="padding-bottom:24px">
<img src="cid:{LOGO_CID}" width="96" height="96" alt="" style="display:block">
<div style="letter-spacing:-0.02em;{_font(20, 28, TEXT, 500)}">{APP_NAME}</div>
</td></tr>
<tr><td class="card" bgcolor="{SURFACE}" style="background-color:{SURFACE};
border:1px solid {LINE};border-radius:16px;padding:32px">
<table {_TABLE} width="100%">
<tr><td>
<div style="letter-spacing:0.08em;text-transform:uppercase;{_font(12, 18, ACCENT, 500)}">
{escape(kicker)}</div>
<h1 class="title" style="margin:8px 0 0;letter-spacing:-0.02em;{_font(28, 34, TEXT, 500)}">
{escape(title)}</h1>
</td></tr>
{rows}
</table>
</td></tr>
<tr><td align="center" style="padding:24px 16px 0;{_font(12, 18, MUTED)}">
{escape(footer)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
"""


@cache
def logo() -> InlineImage:
    return InlineImage(cid=LOGO_CID, data=_LOGO_FILE.read_bytes())


def branded_email(
    *,
    to: str,
    subject: str,
    text: str,
    language: str,
    preheader: str,
    kicker: str,
    title: str,
    blocks: Sequence[Html],
    footer: str,
) -> EmailMessage:
    """``text`` is what clients without HTML show: it must say the same as the blocks."""
    return EmailMessage(
        to=to,
        subject=subject,
        text=text,
        html=render(
            language=language,
            subject=subject,
            preheader=preheader,
            kicker=kicker,
            title=title,
            blocks=blocks,
            footer=footer,
        ),
        images=(logo(),),
    )
