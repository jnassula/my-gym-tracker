import pytest

from app.exercises.models import MuscleGroup as G
from app.workouts.parser.muscle_groups import guess_muscle_group


@pytest.mark.parametrize(
    ("name", "group"),
    [
        ("Supino Inclinado com Halteres", G.CHEST),
        ("Crucifixo Inferior com a Polia Alta no CrossOver", G.CHEST),
        ("PeckDeck", G.CHEST),
        ("Crucifixo Invertido no CrossOver", G.SHOULDERS),
        ("Desenvolvimento com Halteres", G.SHOULDERS),
        ("Desevolvimento com Halteres", G.SHOULDERS),  # typo from a real plan
        ("Elevação Lateral Unilateral no CrossOver", G.SHOULDERS),
        ("FacePull com a Corda no CrossOver", G.SHOULDERS),
        ("Remada Curvada Livre (Pegada Pronada)", G.BACK),
        ("PullDonw com a Corda no CrossOver", G.BACK),  # typo from a real plan
        ("Puxador Vertical com a Barra (MapFit)", G.BACK),
        ("Fortalecimento de Lombar no Banco Romano", G.BACK),
        ("Graviton", G.BACK),
        ("Bíceps Barra no CrossOver", G.BICEPS),
        ("Bíceps Scoth Máquina (Hammer)", G.BICEPS),
        ("Tríceps Testa com a Corda no CrossOver", G.TRICEPS),
        ("Flexão de Punho com a Barra para Antebraço", G.FOREARMS),
        ("Abdômen Inferior com Elevação de Quadril", G.ABS),
        ("Prancha Abdominal Isométrica", G.ABS),
        ("Cadeira Extensora", G.QUADS),
        ("LegPress 45", G.QUADS),
        ("Cadeira Flexora", G.HAMSTRINGS),
        ("Levantamento Terra Sumô", G.HAMSTRINGS),
        ("Cadeira Abdutora", G.GLUTES),
        ("Cadeira Adutora", G.ADDUCTORS),
        ("Panturrilha no Hack Horizontal Sentado", G.CALVES),
        ("Esteira", G.CARDIO),
        ("Movimento Desconhecido", None),
    ],
)
def test_guess_muscle_group(name: str, group: G | None) -> None:
    assert guess_muscle_group(name) is group
