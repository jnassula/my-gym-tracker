from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints

from app.users.models import Language
from app.users.schemas import Email, Name, Timezone, UserRead

# Length is the policy (NIST 800-63B): composition rules are only hints in the UI meter.
NewPassword = Annotated[str, StringConstraints(min_length=8, max_length=128)]
# Existing passwords are only bounded, so a policy change never locks anyone out.
AnyPassword = Annotated[str, StringConstraints(min_length=1, max_length=128)]
Token = Annotated[str, StringConstraints(min_length=1, max_length=2048)]


class RegisterRequest(BaseModel):
    email: Email
    password: NewPassword
    name: Name
    language: Language = Language.PT
    timezone: Timezone = "Europe/Lisbon"


class LoginRequest(BaseModel):
    email: Email
    password: AnyPassword
    remember: bool = False


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105  # OAuth2 token type, not a secret
    expires_in: int  # seconds


class AuthResponse(AccessTokenResponse):
    user: UserRead


class ForgotPasswordRequest(BaseModel):
    email: Email


class ResetTokenRequest(BaseModel):
    token: Token


class ResetTokenInfo(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: Token
    password: NewPassword


class ChangePasswordRequest(BaseModel):
    current_password: AnyPassword
    new_password: NewPassword
