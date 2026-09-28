"""Test fixtures shaped like the trainer's PDF template, without anyone's real plan.

A layout is a list of rows; each row is a list of ``(x, text)`` chunks on the same line.
``to_lines`` turns it into parser input directly; ``to_pdf`` renders a real PDF (Helvetica,
no dependencies) so extraction and the upload API can be tested end to end.
"""

from app.workouts.parser.types import Line, Word

Row = list[tuple[float, str]]

FIRST_TOP = 55.0
LINE_HEIGHT = 12.5
CHAR_WIDTH = 5.0
SPACE_WIDTH = 2.8
PAGE_WIDTH, PAGE_HEIGHT = 842, 1191
REST = 705  # x of the rest column
WARMUP = 330  # warm-up blocks are centred

# An anonymised plan in the template: summary with multi-line focus columns, a rest day,
# techniques, a progression, a combined and an alternative exercise, a wrapped line,
# an unknown machine and an exercise the rules can't classify.
PLAN: list[Row] = [
    [(355, "Periodização de Treino 07")],
    [(388, "Aluno: Atleta Teste")],
    [(370, "Trocar até: 15/04/2026")],
    [(58, "Segunda Feira"), (197, "Terça Feira"), (316, "Quarta Feira"), (445, "Sexta Feira")],
    [(184, "Peitoral, Ombros,"), (330, "DayOff"), (430, "Costas (ênfase em")],
    [(44, "Quadriceps e Glúteos")],
    [(170, "Abdômen e Panturrilhas"), (445, "remadas)")],
    [(307, "Segunda Feira"), (698, "Tempo de intervalo")],
    [(20, "Cadeira Extensora 3x12 Rm (com 10 segundos de isometria)"), (REST, "1 minuto e 20 seg")],
    [(20, "Agachamento Livre 1x15 (carga leve) + 2x8 a 12 Rm"), (701, "entre 1 a 2 minutos")],
    [(20, "Cadeira Extensora 2x (Rest Pause) = 3x até a falha"), (REST, "1 minuto/ 2 minutos")],
    [(322, "Esteira: 30 Minutos na Velocidade 6.5 km/h")],
    [(391, "Aquecimento")],
    [(WARMUP, "Cadeira Extensora 2x20 (carga leve)")],
    [(392, "Terça Feira")],
    [(20, "Supino Inclinado (Progressão de Cargas) 1x15, 1x12, 1x10, 1x6 a 8 Rm"),
     (REST, "1 minuto e 30 seg")],
    [(20, "Crucifixo Inferior com a Polia Alta 3x12 Rm + 1x (Drop Set) = FALHA + FALHA"),
     (REST, "1 minuto e 30 seg")],
    [(20, "Abdômen Remador 3x até a falha + Prancha Abdominal Isométrica 3x até a falha"),
     (REST, "1 minuto")],
    [(20, "Panturrilha Sentada 4x12 Rm + 20 segundos de alongamento no final de"),
     (REST, "45 segundos")],
    [(20, "cada série")],
    [(391, "Aquecimento")],
    [(WARMUP, "Rotação Externa no CrossOver 2x15 (carga leve)")],
    [(392, "Quarta Feira")],
    [(WARMUP, "DayOff")],
    [(392, "Sexta Feira")],
    [(20, "Remada Articulada Máquina 3x12 Rm ou Remada Unilateral Livre 3x12 Rm"),
     (REST, "1 minuto")],
    [(20, "Graviton 3x12 (carga leve)"), (REST, "1 minuto")],
    [(20, "Movimento Desconhecido 3x10 Rm"), (REST, "40 seg")],
    [(383, "Bons Treinos !!!")],
]  # fmt: skip


def _top(index: int) -> float:
    return FIRST_TOP + index * LINE_HEIGHT


def to_lines(rows: list[Row]) -> list[Line]:
    lines = []
    for index, row in enumerate(rows):
        words = []
        for x, text in row:
            cursor = x
            for token in text.split():
                width = len(token) * CHAR_WIDTH
                words.append(Word(text=token, x0=cursor, x1=cursor + width, top=_top(index)))
                cursor += width + SPACE_WIDTH
        lines.append(Line(words=tuple(words)))
    return lines


def _escape(text: str) -> bytes:
    raw = text.encode("cp1252")  # WinAnsiEncoding covers Portuguese accents
    return raw.replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)")


def to_pdf(rows: list[Row]) -> bytes:
    """A minimal one-page PDF with each chunk drawn at its position (10pt Helvetica)."""
    ops = [
        b"BT /F1 10 Tf %.2f %.2f Td (%s) Tj ET" % (x, PAGE_HEIGHT - _top(i) - 10, _escape(text))
        for i, row in enumerate(rows)
        for x, text in row
    ]
    return _pdf_document(b"\n".join(ops))


def blank_pdf() -> bytes:
    """A page with no text layer, like a scanned document."""
    return _pdf_document(b"0 0 m 100 100 l S")


def _pdf_document(content: bytes) -> bytes:
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %d %d] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>" % (PAGE_WIDTH, PAGE_HEIGHT),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        b"<< /Length %d >>\nstream\n%s\nendstream" % (len(content), content),
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n%s\nendobj\n" % (number, body)
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % offset for offset in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (
        len(objects) + 1,
        xref,
    )
    return bytes(out)
