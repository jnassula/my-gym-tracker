from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import Connection
from sqlalchemy.ext.asyncio import AsyncEngine

from app.models import Base


def _diff(connection: Connection) -> list[object]:
    context = MigrationContext.configure(connection, opts={"compare_type": True})
    return list(compare_metadata(context, Base.metadata))


async def test_migrations_match_models(engine: AsyncEngine) -> None:
    """Fails when a model changes without a matching Alembic revision."""
    async with engine.connect() as conn:
        diff = await conn.run_sync(_diff)

    assert diff == []
