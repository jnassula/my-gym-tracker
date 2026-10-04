from http import HTTPStatus

from app.core.errors import AppError, ConflictError, ForbiddenError, UnauthorizedError


class LoginThrottledError(AppError):
    """Too many failed sign-ins for one account (the same answer as the per-address limit)."""

    status_code = HTTPStatus.TOO_MANY_REQUESTS
    code = "rate_limited"
    detail = "Too many attempts. Try again later."

    def __init__(self, retry_after: int) -> None:
        super().__init__()
        self.headers = {"Retry-After": str(retry_after)}


class EmailNotVerifiedError(ForbiddenError):
    """Only said after the right password, like ``account_disabled``."""

    code = "email_not_verified"
    detail = "Confirm your email first: the link is in your inbox"


class InvalidVerifyTokenError(AppError):
    code = "invalid_verify_token"
    detail = "The confirmation link is invalid, expired or already used"


class CrossSiteRequestError(ForbiddenError):
    detail = "This request must come from the app itself"


class NotAuthenticatedError(UnauthorizedError):
    code = "not_authenticated"
    detail = "Not authenticated"


class InvalidTokenError(UnauthorizedError):
    code = "invalid_token"
    detail = "Invalid access token"


class TokenExpiredError(UnauthorizedError):
    code = "token_expired"
    detail = "Access token expired"


class TokenRevokedError(UnauthorizedError):
    code = "token_revoked"
    detail = "Access token no longer valid"


class InvalidCredentialsError(UnauthorizedError):
    code = "invalid_credentials"
    detail = "Invalid email or password"


class InvalidRefreshTokenError(UnauthorizedError):
    code = "invalid_refresh_token"
    detail = "Session expired, sign in again"


class RefreshTokenReusedError(UnauthorizedError):
    code = "refresh_token_reused"
    detail = "Session revoked, sign in again"


class EmailTakenError(ConflictError):
    code = "email_taken"
    detail = "An account with this email already exists"


class InvalidResetTokenError(AppError):
    code = "invalid_reset_token"
    detail = "Password reset link is invalid or has expired"


class InvalidCurrentPasswordError(AppError):
    code = "invalid_current_password"
    detail = "Current password is incorrect"


class AccountDisabledError(ForbiddenError):
    code = "account_disabled"
    detail = "This account has been deactivated"
