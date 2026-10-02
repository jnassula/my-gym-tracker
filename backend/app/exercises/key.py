"""How an exercise is recognised across plans: by name and muscle group."""

from app.exercises.models import MuscleGroup

ExerciseKey = tuple[str, MuscleGroup | None]


def exercise_key(name: str, group: MuscleGroup | None) -> ExerciseKey:
    """Same name and group: the same exercise in another plan. The group keeps a warm-up
    "Cadeira Extensora 2x20 (carga leve)" apart from the working one."""
    return name.strip().lower(), group
