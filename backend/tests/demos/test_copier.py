"""The server brings the animations by itself: once, going on from where it stopped."""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any, cast

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.demos import copier, linker, service
from app.demos.models import ExerciseDemo
from tests.conftest import MemoryStorage
from tests.demos.test_demos import CATALOGUE, EXTENSORA, FakeMatcher, FakeSource, link_all
from tests.training import Gym


async def test_a_new_server_fetches_the_catalogue_and_its_animations(
    db_session: AsyncSession, storage: MemoryStorage
) -> None:
    source = FakeSource()

    assert await copier.copy_missing(db_session, storage, source) is True

    assert sorted(storage.objects) == [
        "demos/EIeI8Vf.gif",
        "demos/eZyBC3j.gif",
        "demos/my33uHU.gif",
    ]
    assert await service.counts(db_session) == (4, 3)
    assert await service.to_copy(db_session) is False  # the fourth: the source has none


async def test_a_server_that_has_them_asks_the_source_nothing(
    db_session: AsyncSession, storage: MemoryStorage
) -> None:
    await copier.copy_missing(db_session, storage, FakeSource())
    again = FakeSource()

    assert await copier.copy_missing(db_session, storage, again) is True

    assert (again.catalogues, again.fetched) == (0, [])  # not even for the one it lacks


async def test_a_copy_cut_short_goes_on_from_where_it_stopped(
    db_session: AsyncSession, storage: MemoryStorage
) -> None:
    first = FakeSource()
    await service.sync(db_session, storage, first, limit=2, untried_only=True)  # a deploy came
    second = FakeSource()

    assert await copier.copy_missing(db_session, storage, second) is True

    assert second.catalogues == 0  # the catalogue was already here
    assert sorted(first.fetched + second.fetched) == sorted(c.id for c in CATALOGUE)
    assert await service.counts(db_session) == (4, 3)


async def test_what_the_source_did_not_answer_for_is_asked_again(
    db_session: AsyncSession, storage: MemoryStorage
) -> None:
    bad_moment = FakeSource()
    bad_moment.silent = {"my33uHU"}

    assert await copier.copy_missing(db_session, storage, bad_moment) is False  # try later

    assert await service.counts(db_session) == (4, 2)
    later = FakeSource()
    assert await copier.copy_missing(db_session, storage, later) is True
    assert later.fetched == ["my33uHU"]
    assert await service.counts(db_session) == (4, 3)


async def test_a_source_that_is_down_leaves_everything_for_later(
    db_session: AsyncSession, storage: MemoryStorage
) -> None:
    source = FakeSource()
    source.down = True

    assert await copier.copy_missing(db_session, storage, source) is False

    assert storage.objects == {}
    assert await service.to_copy(db_session) is True
    assert not linker._copying.is_set()  # and the linker isn't left waiting


async def test_nothing_is_linked_while_the_animations_are_being_copied(
    db_session: AsyncSession, storage: MemoryStorage
) -> None:
    held: list[bool] = []

    class Watching(FakeSource):
        async def gif(self, demo_id: str) -> bytes:
            held.append(linker._copying.is_set())
            return await super().gif(demo_id)

    await copier.copy_missing(db_session, storage, Watching())

    assert held == [True, True, True, True]
    assert not linker._copying.is_set()


async def test_the_command_asks_again_for_what_the_source_did_not_have(
    db_session: AsyncSession, storage: MemoryStorage
) -> None:
    await copier.copy_missing(db_session, storage, FakeSource())
    by_hand = FakeSource()
    by_hand.missing = set()  # the source has it now

    assert await service.sync(db_session, storage, by_hand) == 1

    assert by_hand.fetched == ["gone404"]
    assert await service.counts(db_session) == (4, 4)


async def test_the_exercises_are_linked_once_the_copy_is_done(
    gym: Gym, db_session: AsyncSession, storage: MemoryStorage
) -> None:
    await copier.copy_missing(db_session, storage, FakeSource())

    await link_all(db_session, FakeMatcher({EXTENSORA: "my33uHU"}))

    assert (await gym.get(f"/api/demos/exercises/{gym.ex['0/2']}"))["id"] == "my33uHU"
    answered = await db_session.scalars(
        select(ExerciseDemo.id).where(ExerciseDemo.checked_at.is_not(None))
    )
    assert sorted(answered) == sorted(c.id for c in CATALOGUE)


def sessions_of(session: AsyncSession) -> Any:
    """A session maker that hands out the test's own session."""

    @asynccontextmanager
    async def use() -> AsyncIterator[AsyncSession]:
        yield session

    return cast(Any, use)


async def test_the_linker_is_held_from_before_the_copy_starts_until_it_ends(
    db_session: AsyncSession, storage: MemoryStorage
) -> None:
    task = copier.start(sessions_of(db_session), storage, FakeSource())

    assert linker._copying.is_set()  # at once: the linker's first round is already too late
    await asyncio.wait_for(task, 5)

    assert not linker._copying.is_set()
    assert await service.counts(db_session) == (4, 3)


async def test_a_server_with_nothing_to_copy_lets_the_linker_go_at_once(
    db_session: AsyncSession, storage: MemoryStorage
) -> None:
    await copier.copy_missing(db_session, storage, FakeSource())
    idle = FakeSource()

    await asyncio.wait_for(copier.start(sessions_of(db_session), storage, idle), 5)

    assert not linker._copying.is_set()
    assert (idle.catalogues, idle.fetched) == (0, [])


async def test_a_source_that_is_down_is_tried_again_later(
    db_session: AsyncSession, storage: MemoryStorage, monkeypatch: pytest.MonkeyPatch
) -> None:
    source = FakeSource()
    source.down = True
    waits = 0

    async def later() -> None:
        nonlocal waits
        waits += 1
        source.down = False  # by then it answers

    monkeypatch.setattr(copier, "_wait", later)

    await asyncio.wait_for(copier.run(sessions_of(db_session), storage, source), 5)

    assert waits == 1
    assert await service.counts(db_session) == (4, 3)
    assert not linker._copying.is_set()
