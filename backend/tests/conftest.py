"""Test fixtures.

Tests run against a dedicated ``<db>_test`` Postgres database, rebuilt from the Alembic
migrations once per run (so the migrations themselves are exercised). Each test runs inside a
transaction that is rolled back afterwards.
"""

import os
from collections.abc import AsyncIterator
from pathlib import Path
from typing import TYPE_CHECKING, Any

import pytest
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy import Connection, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.email import EmailMessage
from tests.training import MONDAY, Clock, Gym, open_gym
from tests.workouts.layout import PLAN_REPLY

if TYPE_CHECKING:
    from app.workouts.parser import ParsedPlan

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _test_database_url() -> str:
    if explicit := os.environ.get("TEST_DATABASE_URL"):
        return explicit
    if "DATABASE_URL" not in os.environ:
        pytest.exit("Set DATABASE_URL (or TEST_DATABASE_URL) to run the tests", returncode=2)
    url = make_url(os.environ["DATABASE_URL"])
    return url.set(database=f"{url.database}_test").render_as_string(hide_password=False)


TEST_DATABASE_URL = _test_database_url()
# The app builds its engine from settings on import: make sure it can only see the test DB.
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["ENVIRONMENT"] = "test"
os.environ.setdefault("JWT_SECRET", "test-secret-" + "x" * 32)
# The test client talks plain http, so Secure cookies would never be sent back.
os.environ["COOKIE_SECURE"] = "false"
# Tests never reach the real LLM by accident: only the opt-in live tests get the key back.
LLM_API_KEY = os.environ.pop("LLM_API_KEY", "")


async def _create_database_if_missing(url: str) -> None:
    target = make_url(url)
    admin = create_async_engine(
        target.set(database="postgres"), isolation_level="AUTOCOMMIT", poolclass=NullPool
    )
    async with admin.connect() as conn:
        exists = await conn.scalar(
            text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": target.database}
        )
        if not exists:
            await conn.execute(text(f'CREATE DATABASE "{target.database}"'))
    await admin.dispose()


def _upgrade_to_head(connection: Connection) -> None:
    config = Config(BACKEND_DIR / "alembic.ini")
    config.attributes["connection"] = connection
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")


@pytest.fixture(scope="session")
async def engine() -> AsyncIterator[AsyncEngine]:
    await _create_database_if_missing(TEST_DATABASE_URL)
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
        await conn.run_sync(_upgrade_to_head)
    yield engine
    await engine.dispose()


@pytest.fixture
async def db_session(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    async with engine.connect() as conn:
        await conn.begin()
        # Service-level commits become savepoints; the outer transaction is always rolled back.
        session = AsyncSession(
            bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False
        )
        try:
            yield session
        finally:
            await session.close()
            await conn.rollback()


class Outbox:
    """In-memory ``Mailer``: tests read what would have been emailed."""

    def __init__(self) -> None:
        self.messages: list[EmailMessage] = []

    async def send(self, message: EmailMessage) -> None:
        self.messages.append(message)


@pytest.fixture
def outbox() -> Outbox:
    return Outbox()


class MemoryStorage:
    """In-memory ``Storage``: tests inspect ``objects`` instead of talking to MinIO."""

    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}
        self.available = True

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        self.objects[key] = (data, content_type)

    async def get(self, key: str) -> bytes:
        return self.objects[key][0]

    async def delete(self, key: str) -> None:
        self.objects.pop(key, None)

    async def ping(self) -> bool:
        return self.available


@pytest.fixture
def storage() -> MemoryStorage:
    return MemoryStorage()


class FakePlanParser:
    """Stands in for the LLM: replies ``reply`` (or raises ``error``) and records its input."""

    def __init__(self) -> None:
        self.texts: list[str] = []
        self.reply: dict[str, Any] = PLAN_REPLY
        self.error: Exception | None = None

    async def parse(self, text: str) -> "ParsedPlan":
        from app.workouts.parser.output import PlanOutput, to_parsed_plan  # noqa: PLC0415

        self.texts.append(text)
        if self.error is not None:
            raise self.error
        return to_parsed_plan(PlanOutput.model_validate(self.reply))


@pytest.fixture
def plan_parser() -> FakePlanParser:
    return FakePlanParser()


@pytest.fixture(autouse=True)
def _reset_rate_limits() -> None:
    from app.core.rate_limit import limiter  # noqa: PLC0415  # imported after env is set

    limiter.reset()


@pytest.fixture
async def client(
    db_session: AsyncSession, outbox: Outbox, storage: MemoryStorage, plan_parser: FakePlanParser
) -> AsyncIterator[AsyncClient]:
    from app.core.db import get_session  # noqa: PLC0415  # imported after env is set
    from app.core.email import get_mailer  # noqa: PLC0415
    from app.core.storage import get_storage  # noqa: PLC0415
    from app.main import app  # noqa: PLC0415
    from app.workouts.parser import get_plan_parser  # noqa: PLC0415

    async def override_session() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_mailer] = lambda: outbox
    app.dependency_overrides[get_storage] = lambda: storage
    app.dependency_overrides[get_plan_parser] = lambda: plan_parser
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> Clock:
    """Moves "now" for the training log (and so for progress): starts on a Monday evening."""
    from app.logs import service  # noqa: PLC0415  # imported after env is set

    clock = Clock(MONDAY)
    monkeypatch.setattr(service, "now", lambda: clock.now)
    return clock


@pytest.fixture
async def gym(client: AsyncClient, clock: Clock) -> Gym:
    return await open_gym(client)
