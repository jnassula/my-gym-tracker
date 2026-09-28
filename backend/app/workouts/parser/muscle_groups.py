"""Muscle group from an exercise name. PDFs don't state it per exercise, only per day.

Rules are checked in order: specific names before generic ones ("crucifixo invertido" is a
shoulder exercise, "crucifixo" a chest one; "bíceps barra no crossover" is biceps, not chest).
"""

import re

from app.exercises.models import MuscleGroup
from app.workouts.parser.text import normalize

_RULES: tuple[tuple[MuscleGroup, str], ...] = (
    (MuscleGroup.ABS, r"abdom|abdominal|prancha|crunch|obliquo"),
    (MuscleGroup.CALVES, r"panturrilha|gemeos|soleo"),
    (MuscleGroup.BICEPS, r"biceps|rosca|martelo|scott|scoth"),
    (MuscleGroup.TRICEPS, r"triceps|frances|testa|mergulho|coice com halter"),
    (MuscleGroup.FOREARMS, r"antebraco|punho"),
    (MuscleGroup.SHOULDERS, r"crucifixo invertido|voador invertido|dese?n?volvimento|elevacao"
                            r" (lateral|frontal)|face ?pull|rotacao externa|manguito|manguitto"),
    (MuscleGroup.CHEST, r"supino|crucifixo|peck ?deck|voador|flexao de braco|chest press"),
    (MuscleGroup.BACK, r"remada|puxador|puxada|pull ?do(?:wn|nw)|barra fixa|lombar"
                       r"|encolhimento|trapezio|serrote|pullover|graviton"),
    (MuscleGroup.HAMSTRINGS, r"flexora|stiff|terra|good morning"),
    (MuscleGroup.GLUTES, r"abdutora|gluteo|elevacao pelvica|hip thrust|coice"),
    (MuscleGroup.ADDUCTORS, r"adutora"),
    (MuscleGroup.QUADS, r"extensora|agachamento|hack|leg ?press|pendulo|afundo|passada|bulgaro"
                        r"|sissy|avanco"),
    (MuscleGroup.CARDIO, r"esteira|bike|bicicleta|eliptic|escada|corrida|caminhada|spinning"),
)  # fmt: skip

_COMPILED = tuple((group, re.compile(pattern)) for group, pattern in _RULES)
_CARDIO = next(pattern for group, pattern in _COMPILED if group is MuscleGroup.CARDIO)


def guess_muscle_group(name: str) -> MuscleGroup | None:
    normalized = normalize(name)
    for group, pattern in _COMPILED:
        if pattern.search(normalized):
            return group
    return None


def is_cardio(text: str) -> bool:
    return bool(_CARDIO.search(normalize(text)))
