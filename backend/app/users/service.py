"""Business logic for the users domain. Routers only map HTTP to these functions."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.users.models import User
from app.users.schemas import UserUpdate


async def get_user(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await session.get(User, user_id)


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    return await session.scalar(select(User).where(User.email == email.lower()))


async def update_user(session: AsyncSession, user: User, data: UserUpdate) -> User:
    for field in data.model_fields_set:
        setattr(user, field, getattr(data, field))
    await session.commit()
    return user
