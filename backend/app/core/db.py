import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated, Any, ClassVar

from fastapi import Depends
from sqlalchemy import CheckConstraint, DateTime, Enum, MetaData, Uuid, func
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.core.config import get_settings

# Deterministic constraint names so Alembic migrations are stable and reviewable.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    type_annotation_map: ClassVar[dict[Any, Any]] = {datetime: DateTime(timezone=True)}


class UUIDPrimaryKey:
    """UUID ids let the frontend create rows optimistically without a server round-trip."""

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


def str_enum(enum: type[StrEnum]) -> Enum:
    """Stored as VARCHAR (not a native Postgres ENUM) so adding a value needs no type migration.

    Pair every column with ``enum_check`` in ``__table_args__``: Alembic autogenerate duplicates
    the CHECK that ``Enum(create_constraint=True)`` would emit, so the constraint is explicit.
    """
    return Enum(
        enum,
        native_enum=False,
        create_constraint=False,
        length=16,
        values_callable=lambda e: [m.value for m in e],
    )


def enum_check(column: str, enum: type[StrEnum]) -> CheckConstraint:
    values = ", ".join(f"'{member.value}'" for member in enum)
    return CheckConstraint(f"{column} IN ({values})", name=column)


def utcnow() -> datetime:
    return datetime.now(UTC)


class CreatedAt:
    # Python-side default: Postgres now() is the transaction start, so rows created in one
    # transaction would tie. The server default covers raw SQL inserts.
    created_at: Mapped[datetime] = mapped_column(default=utcnow, server_default=func.now())


engine = create_async_engine(
    get_settings().database_url,
    pool_pre_ping=True,
    # A failed statement is logged with its traceback: on the live site, without the values it
    # carried (emails, push endpoints, weights).
    hide_parameters=get_settings().environment == "production",
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


SessionDep = Annotated[AsyncSession, Depends(get_session)]
