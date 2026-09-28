from app.core.errors import NotFoundError


class DayNotFoundError(NotFoundError):
    code = "day_not_found"
    detail = "Workout day not found"


class ExerciseNotFoundError(NotFoundError):
    code = "exercise_not_found"
    detail = "Exercise not found"


class SetNotFoundError(NotFoundError):
    code = "set_not_found"
    detail = "Set not found"


class SessionNotFoundError(NotFoundError):
    code = "session_not_found"
    detail = "Workout session not found"
