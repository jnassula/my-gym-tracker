from app.core.errors import ForbiddenError, NotFoundError


class UserNotFoundError(NotFoundError):
    code = "user_not_found"
    detail = "Account not found"


class AdminProtectedError(ForbiddenError):
    code = "admin_account_protected"
    detail = "An administrator's account can't be deactivated or deleted here"
