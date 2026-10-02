from http import HTTPStatus

from app.core.errors import AppError, NotFoundError


class PlanNotFoundError(NotFoundError):
    code = "plan_not_found"
    detail = "Workout plan not found"


class _PdfError(AppError):
    status_code = HTTPStatus.UNPROCESSABLE_CONTENT


class PdfUnreadableError(_PdfError):
    code = "pdf_unreadable"
    detail = "The PDF could not be opened"


class ImageUnreadableError(_PdfError):
    code = "image_unreadable"
    detail = "The photo could not be read (JPEG, PNG or WebP only)"


class TooManyFilesError(_PdfError):
    code = "too_many_files"
    detail = "Too many files or pages in one import"


class NoFilesError(_PdfError):
    code = "no_files"
    detail = "Send a PDF or at least one photo"


class PdfNoStructureError(_PdfError):
    code = "pdf_no_structure"
    detail = "No workout days were found in the PDF"


class PdfReaderUnavailableError(AppError):
    status_code = HTTPStatus.SERVICE_UNAVAILABLE
    code = "pdf_reader_unavailable"
    detail = "The PDF reader is unavailable right now, try again later"
