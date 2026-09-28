import pytest

from app.workouts.parser.prescription import parse_prescription, parse_rest
from app.workouts.parser.types import ParseWarning as W


@pytest.mark.parametrize(
    ("text", "name", "sets", "reps", "warnings"),
    [
        ("Cadeira Adutora 3x12 Rm", "Cadeira Adutora", 3, "12", []),
        ("Supino Inclinado com Halteres 3x8 a 10 Rm (pesado)", "Supino Inclinado com Halteres",
         3, "8-10", []),
        ("Supino Inclinado (Progressão de Cargas) 1x15, 1x12, 1x10, 1x8, 1x6 a 8 Rm",
         "Supino Inclinado (Progressão de Cargas)", 5, "15/12/10/8/6-8", []),
        ("Agachamento Livre 1x15 (carga leve) + 2x8 a 12 Rm (carga máxima)",
         "Agachamento Livre", 3, "15/8-12", []),
        ("Hack Horizontal Sentado 3x12 Rm + 10 segundos de descanso + 10 repetições parciais",
         "Hack Horizontal Sentado", 3, "12", []),
        ("Tríceps Barra (Progressão de Cargas com Isometria) = 1x20, 1x15, 1x12, 1x10 Rm",
         "Tríceps Barra (Progressão de Cargas com Isometria)", 4, "20/15/12/10", []),
        ("LegPress 45- 3x8 a 12 Rm", "LegPress 45", 3, "8-12", []),
        ("Panturrilha em Pé no Smith 2x15 (carga mais leve) 3x12 Rm",
         "Panturrilha em Pé no Smith", 5, "15/12", []),
        ("Abdômen Inferior com Elevação de Quadril 4x até a falha",
         "Abdômen Inferior com Elevação de Quadril", 4, "falha", []),
        ("Abdômen Inferior na Barra Paralela 3x - até a falha",
         "Abdômen Inferior na Barra Paralela", 3, "falha", []),
        ("Prancha Abdominal Isométrica 3x 45 seg a 1 minuto", "Prancha Abdominal Isométrica",
         3, "45 s a 1 min", []),
        # Techniques: the main sets count, the technique is flagged for review.
        ("Crucifixo Inferior 3x12 Rm + 1x (Drop Set) = FALHA + FALHA + FALHA",
         "Crucifixo Inferior", 3, "12", [W.TECHNIQUE_SETS]),
        ("Remada Cavalinho Livre 2x10 Rm + 1x (Drop Set) = 10 e 12 Rm",
         "Remada Cavalinho Livre", 2, "10", [W.TECHNIQUE_SETS]),
        ("Encolhimento de Trapézio 3x10 Rm + Drop Set com repetições até a falha",
         "Encolhimento de Trapézio", 3, "10", [W.TECHNIQUE_SETS]),
        ("Cadeira Extensora 2x (Rest Pause) = 3x até a falha, com 10 segundos",
         "Cadeira Extensora", 2, "Rest Pause", [W.TECHNIQUE_SETS]),
        ("Mesa Flexora 3x- (Método 2 por 1) = 10 Rm", "Mesa Flexora", 3, "Método 2 por 1",
         [W.TECHNIQUE_SETS]),
        # Two exercises done together, and a choice between two.
        ("Abdômen Remador 3x até a falha + Prancha Abdominal Isométrica 3x até a falha",
         "Abdômen Remador + Prancha Abdominal Isométrica", 3, "falha", [W.COMBINED_EXERCISE]),
        ("Crucifixo Reto 3x10 Rm + Supino Reto com Halteres (mesmos halteres) 8 a 10 repetições",
         "Crucifixo Reto + Supino Reto com Halteres", 3, "10", [W.COMBINED_EXERCISE]),
        ("Remada Máquina (Pegada Neutra) 3x12 Rm ou Remada Unilateral Livre 3x12 Rm",
         "Remada Máquina (Pegada Neutra)", 3, "12", [W.ALTERNATIVE_EXERCISE]),
        ("Remada Baixa Unilateral 3xz10 Rm", "Remada Baixa Unilateral 3xz10 Rm", None, None,
         [W.NO_SETS]),
    ],
)  # fmt: skip
def test_parse_prescription(
    text: str, name: str, sets: int | None, reps: str | None, warnings: list[W]
) -> None:
    parsed = parse_prescription(text)

    assert (parsed.name, parsed.sets, parsed.reps, parsed.warnings) == (name, sets, reps, warnings)


def test_prescription_keeps_the_original_text_as_notes() -> None:
    parsed = parse_prescription("Stiff 3x12 Rm (sempre com pico de contração de 2 segundos)")

    assert parsed.notes == "3x12 Rm (sempre com pico de contração de 2 segundos)"


@pytest.mark.parametrize(
    ("text", "name", "reps"),
    [
        ("Esteira: 30 Minutos na Velocidade 6.5 km/h", "Esteira", "30 min"),
        ("Esteira:20 Minutos na Velocidade 7.5 km/h + 10 Minutos de Elipticon", "Esteira",
         "20 min"),
        ("30 Minutos de Esteira na Velocidade 6.5 km/h (sem inclinação)", "Esteira", "30 min"),
        ("Simulador de Escada 20 Minutos", "Simulador de Escada", "20 min"),
    ],
)  # fmt: skip
def test_parse_cardio(text: str, name: str, reps: str) -> None:
    parsed = parse_prescription(text, cardio=True)

    assert (parsed.name, parsed.sets, parsed.reps) == (name, None, reps)


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("1 minuto e 20 seg", (80, None)),
        ("1 mintuo e 20 seg", (80, None)),  # the typo is in the real PDFs
        ("40 seg", (40, None)),
        ("45 segundos", (45, None)),
        ("2 minutos", (120, None)),
        ("entre 1 a 2 minutos", (60, 120)),
        ("1 minuto/ 2 minutos", (60, 120)),
        ("", (None, None)),
        (None, (None, None)),
        ("conforme necessário", (None, None)),
    ],
)
def test_parse_rest(text: str | None, expected: tuple[int | None, int | None]) -> None:
    assert parse_rest(text) == expected
