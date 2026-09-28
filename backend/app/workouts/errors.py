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


class PdfNoTextError(_PdfError):
    code = "pdf_no_text"
    detail = "The PDF has no text layer (it looks like a scanned image)"


class PdfNoStructureError(_PdfError):
    code = "pdf_no_structure"
    detail = "No workout days were found in the PDF"


class PdfReaderUnavailableError(AppError):
    status_code = HTTPStatus.SERVICE_UNAVAILABLE
    code = "pdf_reader_unavailable"
    detail = "The PDF reader is unavailable right now, try again later"
