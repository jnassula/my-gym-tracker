from app.core.errors import AppError, ConflictError, UnauthorizedError


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
