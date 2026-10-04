"""The demonstrations: copying the catalogue, linking exercises to it, and serving it."""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.llm import LlmUnavailableError
from app.demos import service
from app.demos.matcher import MatchExercise
from app.demos.models import ExerciseDemo, ExerciseDemoLink
from app.demos.source import SourceError, SourceExercise
from tests.conftest import MemoryStorage
from tests.helpers import signup
from tests.training import PLAN, Gym, open_gym

GIF = b"GIF89a" + b"\x00" * 64
CATALOGUE = [
    SourceExercise("EIeI8Vf", "barbell bench press", ["chest"], ["barbell"], ["pectorals"]),
    SourceExercise(
        "my33uHU", "Machine Leg Extension", ["upper legs"], ["leverage machine"], ["quads"]
    ),
    SourceExercise("eZyBC3j", "barbell bent over row", ["back"], ["barbell"], ["lats"]),
    SourceExercise("gone404", "an exercise without a file", ["back"], ["cable"], ["lats"]),
]


class FakeSource:
    """Stands in for ExerciseDB: its catalogue, and a GIF for all but one of them."""

    def __init__(self) -> None:
        self.fetched: list[str] = []
        self.missing = {"gone404"}

    async def catalogue(self) -> list[SourceExercise]:
        return CATALOGUE

    async def gif(self, demo_id: str) -> bytes:
        self.fetched.append(demo_id)
        if demo_id in self.missing:
            raise SourceError(f"{demo_id}: HTTP 404")
        return GIF


class FakeMatcher:
    """Stands in for the LLM: answers by a table of exercise name → catalogue id."""

    def __init__(self, table: dict[str, str | None] | None = None) -> None:
        self.table = table or {}
        self.questions: list[tuple[list[MatchExercise], dict[str, str]]] = []
        self.error: Exception | None = None

    async def match(
        self, exercises: list[MatchExercise], catalogue: dict[str, str]
    ) -> list[str | None]:
        self.questions.append((exercises, catalogue))
        if self.error:
            raise self.error
        return [self.table.get(exercise.name) for exercise in exercises]

    @property
    def asked(self) -> list[str]:
        return [exercise.name for exercises, _ in self.questions for exercise in exercises]


async def catalogued(db_session: AsyncSession, storage: MemoryStorage) -> FakeSource:
    source = FakeSource()
    await service.sync(db_session, storage, source)
    return source


async def link_all(db_session: AsyncSession, matcher: FakeMatcher) -> None:
    while await service.link_pending(db_session, matcher):
        pass


EXTENSORA = "cadeira extensora"  # PLAN's working exercise, as its key spells it


# --- copying the catalogue ------------------------------------------------------------------


async def test_sync_copies_the_catalogue_and_the_animations(
    db_session: AsyncSession, storage: MemoryStorage
) -> None:
    lines: list[str] = []

    copied = await service.sync(db_session, storage, FakeSource(), report=lines.append)

    assert copied == 3
    assert storage.objects["demos/EIeI8Vf.gif"] == (GIF, "image/gif")
    assert sorted(storage.objects) == [
        "demos/EIeI8Vf.gif",
        "demos/eZyBC3j.gif",
        "demos/my33uHU.gif",
    ]
    assert await service.counts(db_session) == (4, 3)
    assert any("gone404" in line for line in lines)  # said, and left for another run


async def test_sync_goes_on_from_where_it_stopped(
    db_session: AsyncSession, storage: MemoryStorage
) -> None:
    first = FakeSource()
    assert await service.sync(db_session, storage, first, limit=2) == 2

    second = FakeSource()
    second.missing = set()
    assert await service.sync(db_session, storage, second) == 2

    assert sorted(first.fetched + second.fetched) == sorted(c.id for c in CATALOGUE)
    assert await service.counts(db_session) == (4, 4)


async def test_a_storage_that_lost_the_animations_gets_them_again(
    db_session: AsyncSession, storage: MemoryStorage
) -> None:
    await catalogued(db_session, storage)
    storage.objects.clear()  # restored from a backup that came without them
    assert await service.sync(db_session, storage, FakeSource()) == 0

    assert await service.sync(db_session, storage, FakeSource(), again=True) == 3

    assert len(storage.objects) == 3
    assert await service.counts(db_session) == (4, 3)


async def test_new_animations_have_every_exercise_decided_again(
    gym: Gym, db_session: AsyncSession, storage: MemoryStorage
) -> None:
    first = FakeSource()
    first.missing = {"my33uHU", "gone404"}  # the right animation hasn't come yet
    await service.sync(db_session, storage, first)
    matcher = FakeMatcher({EXTENSORA: "my33uHU"})
    await link_all(db_session, matcher)
    assert await gym.get(f"/api/demos/exercises/{gym.ex['0/2']}") is None

    await service.sync(db_session, storage, FakeSource())
    await link_all(db_session, matcher)

    assert (await gym.get(f"/api/demos/exercises/{gym.ex['0/2']}"))["id"] == "my33uHU"


async def test_a_run_that_brings_nothing_keeps_what_was_decided(
    gym: Gym, db_session: AsyncSession, storage: MemoryStorage
) -> None:
    await catalogued(db_session, storage)
    matcher = FakeMatcher({EXTENSORA: "my33uHU"})
    await link_all(db_session, matcher)
    asked = list(matcher.asked)

    assert await service.sync(db_session, storage, FakeSource()) == 0  # only the 404 was left
    await link_all(db_session, matcher)

    assert matcher.asked == asked


# --- linking --------------------------------------------------------------------------------


async def test_a_new_plans_exercises_are_linked_to_their_animations(
    gym: Gym, db_session: AsyncSession, storage: MemoryStorage
) -> None:
    await catalogued(db_session, storage)
    matcher = FakeMatcher({EXTENSORA: "my33uHU"})

    await link_all(db_session, matcher)

    demo = await gym.get(f"/api/demos/exercises/{gym.ex['0/2']}")
    assert demo == {"id": "my33uHU", "name": "Machine Leg Extension"}
    # The matcher saw the exercises as the plan names them, and only animations that are here.
    asked = [exercise for exercises, _ in matcher.questions for exercise in exercises]
    assert MatchExercise(name=EXTENSORA, group="quads") in asked
    assert all("gone404" not in catalogue for _, catalogue in matcher.questions)


async def test_an_exercise_is_asked_about_once_whoever_has_it(
    client: AsyncClient, db_session: AsyncSession, storage: MemoryStorage
) -> None:
    await catalogued(db_session, storage)
    ana = await open_gym(client, "ana@example.pt")
    matcher = FakeMatcher({EXTENSORA: "my33uHU"})
    await link_all(db_session, matcher)
    first = list(matcher.asked)

    rui = await open_gym(client, "rui@example.pt")  # the same plan in another account
    await link_all(db_session, matcher)

    assert matcher.asked == first  # nothing new to ask: no name was said without an answer
    assert (await rui.get(f"/api/demos/exercises/{rui.ex['0/2']}"))["id"] == "my33uHU"
    assert (await ana.get(f"/api/demos/exercises/{ana.ex['0/2']}"))["id"] == "my33uHU"


async def test_an_exercise_nothing_shows_is_not_asked_about_again(
    gym: Gym, db_session: AsyncSession, storage: MemoryStorage
) -> None:
    await catalogued(db_session, storage)
    matcher = FakeMatcher()  # nothing fits anything
    await link_all(db_session, matcher)
    asked = len(matcher.asked)

    assert await service.link_pending(db_session, matcher) == 0
    assert len(matcher.asked) == asked
    assert await gym.get(f"/api/demos/exercises/{gym.ex['0/2']}") is None
    links = list(await db_session.scalars(select(ExerciseDemoLink.demo_id)))
    assert links
    assert set(links) == {None}


async def test_an_answer_outside_the_catalogue_links_nothing(
    gym: Gym, db_session: AsyncSession, storage: MemoryStorage
) -> None:
    await catalogued(db_session, storage)

    await link_all(db_session, FakeMatcher({EXTENSORA: "not-in-the-catalogue"}))

    assert await gym.get(f"/api/demos/exercises/{gym.ex['0/2']}") is None


async def test_exercises_wait_while_there_is_no_catalogue(
    gym: Gym, db_session: AsyncSession
) -> None:
    matcher = FakeMatcher({EXTENSORA: "my33uHU"})

    assert await service.link_pending(db_session, matcher) == 0

    assert matcher.questions == []
    assert list(await db_session.scalars(select(ExerciseDemoLink))) == []  # still to decide


async def test_exercises_wait_when_the_matcher_is_unavailable(
    gym: Gym, db_session: AsyncSession, storage: MemoryStorage
) -> None:
    await catalogued(db_session, storage)
    matcher = FakeMatcher({EXTENSORA: "my33uHU"})
    matcher.error = LlmUnavailableError("down")

    with pytest.raises(LlmUnavailableError):
        await service.link_pending(db_session, matcher)

    matcher.error = None
    await link_all(db_session, matcher)
    assert (await gym.get(f"/api/demos/exercises/{gym.ex['0/2']}"))["id"] == "my33uHU"


async def test_a_deleted_plans_exercises_are_not_sent(
    gym: Gym, db_session: AsyncSession, storage: MemoryStorage
) -> None:
    await catalogued(db_session, storage)
    await gym.client.delete(f"/api/workouts/{gym.plan['id']}", headers=gym.headers)
    matcher = FakeMatcher()

    assert await service.link_pending(db_session, matcher) == 0
    assert matcher.questions == []


async def test_a_question_holds_one_muscle_group(
    gym: Gym, db_session: AsyncSession, storage: MemoryStorage
) -> None:
    await catalogued(db_session, storage)
    matcher = FakeMatcher()

    await link_all(db_session, matcher)

    for exercises, _ in matcher.questions:
        assert len({exercise.group for exercise in exercises}) == 1
    names = {exercise["name"].lower() for day in PLAN["days"] for exercise in day["exercises"]}
    assert set(matcher.asked) == names


# --- serving --------------------------------------------------------------------------------


async def test_the_animation_is_served_to_keep(
    gym: Gym, db_session: AsyncSession, storage: MemoryStorage
) -> None:
    await catalogued(db_session, storage)

    response = await gym.client.get("/api/demos/EIeI8Vf.gif", headers=gym.headers)

    assert response.status_code == 200
    assert response.content == GIF
    assert response.headers["content-type"] == "image/gif"
    assert response.headers["cache-control"] == "private, max-age=31536000, immutable"


async def test_what_is_not_here_is_not_found(
    gym: Gym, db_session: AsyncSession, storage: MemoryStorage
) -> None:
    await catalogued(db_session, storage)

    for demo_id in ("gone404", "nothing0"):  # catalogued without its file, and unknown
        response = await gym.client.get(f"/api/demos/{demo_id}.gif", headers=gym.headers)
        assert (response.status_code, response.json()["code"]) == (404, "demo_not_found")
    assert (await gym.client.get("/api/demos/..%2Fusers.gif", headers=gym.headers)).status_code in (
        404,
        422,
    )


async def test_demonstrations_need_a_session_and_the_exercise_to_be_ones_own(
    client: AsyncClient, db_session: AsyncSession, storage: MemoryStorage
) -> None:
    await catalogued(db_session, storage)
    ana = await open_gym(client, "ana@example.pt")
    rui = await signup(client, "rui@example.pt")
    await link_all(db_session, FakeMatcher({EXTENSORA: "my33uHU"}))

    assert (await client.get("/api/demos/EIeI8Vf.gif")).status_code == 401
    assert (await client.get(f"/api/demos/exercises/{ana.ex['0/2']}")).status_code == 401
    theirs = await client.get(f"/api/demos/exercises/{ana.ex['0/2']}", headers=rui)
    assert theirs.status_code == 404


async def test_the_catalogue_has_nothing_of_a_users(
    gym: Gym, db_session: AsyncSession, storage: MemoryStorage
) -> None:
    await catalogued(db_session, storage)
    await link_all(db_session, FakeMatcher({EXTENSORA: "my33uHU"}))

    assert all(key.startswith("demos/") for key in storage.objects)
    demos = list(await db_session.scalars(select(ExerciseDemo)))
    assert {demo.id for demo in demos} == {c.id for c in CATALOGUE}
