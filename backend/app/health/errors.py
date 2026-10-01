from app.core.errors import NotFoundError, UnauthorizedError


class HealthTokenInvalidError(UnauthorizedError):
    code = "health_token_invalid"
    detail = "Unknown or revoked data source token"


class HealthNotConnectedError(NotFoundError):
    code = "health_not_connected"
    detail = "This data source is not connected"
