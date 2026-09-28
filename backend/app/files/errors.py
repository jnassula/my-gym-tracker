from http import HTTPStatus

from app.core.errors import AppError, NotFoundError


class StoredFileNotFoundError(NotFoundError):
    code = "file_not_found"
    detail = "File not found"


class FileTooLargeError(AppError):
    status_code = HTTPStatus.REQUEST_ENTITY_TOO_LARGE
    code = "file_too_large"
    detail = "File is too large"


class UnsupportedFileTypeError(AppError):
    status_code = HTTPStatus.UNSUPPORTED_MEDIA_TYPE
    code = "unsupported_file_type"
    detail = "Unsupported file type"
