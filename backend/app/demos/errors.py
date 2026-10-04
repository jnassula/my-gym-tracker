from app.core.errors import NotFoundError


class DemoNotFoundError(NotFoundError):
    code = "demo_not_found"
    detail = "No such demonstration"
