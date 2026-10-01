from app.core.errors import AppError, NotFoundError


class MeasurementNotFoundError(NotFoundError):
    code = "measurement_not_found"
    detail = "Measurement not found"


class MeasurementDateError(AppError):
    code = "measurement_date_invalid"
    detail = "A weighing is dated from 2000 up to today"
