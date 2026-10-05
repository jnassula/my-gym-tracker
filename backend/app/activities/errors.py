from app.core.errors import AppError, ConflictError, NotFoundError


class ActivityNotFoundError(NotFoundError):
    code = "activity_not_found"
    detail = "Activity not found"


class ActivityNameTakenError(ConflictError):
    code = "activity_name_taken"
    detail = "There is already an activity with this name"


class ActivityLimitError(ConflictError):
    code = "activity_limit"
    detail = "No room for another activity"


class ActivityDateError(AppError):
    code = "activity_date_invalid"
    detail = "An activity is marked within two weeks of today"
