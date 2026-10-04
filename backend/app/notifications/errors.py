from http import HTTPStatus

from app.core.errors import AppError, ConflictError


class PushEndpointNotAllowedError(AppError):
    status_code = HTTPStatus.UNPROCESSABLE_CONTENT
    code = "push_endpoint_not_allowed"
    detail = "This browser's push service isn't one the app sends to"


class PushEndpointInUseError(ConflictError):
    code = "push_endpoint_in_use"
    detail = "This device is subscribed with other keys"
