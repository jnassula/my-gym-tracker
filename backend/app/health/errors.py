from app.core.errors import NotFoundError, UnauthorizedError


class HealthTokenInvalidError(UnauthorizedError):
    code = "health_token_invalid"
    detail = "Unknown or revoked Apple Health token"


class HealthNotConnectedError(NotFoundError):
    code = "health_not_connected"
    detail = "Apple Health is not connected"
