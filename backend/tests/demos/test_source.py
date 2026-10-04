"""What the source's answers are taken to mean. Nothing here reaches the network."""

import email.message
import json
import urllib.error

import pytest

from app.demos import source
from app.demos.source import ExerciseDb, SourceError

GIF = b"GIF89a" + b"\x00" * 16


def http_error(code: int) -> urllib.error.HTTPError:
    return urllib.error.HTTPError(
        "https://example.invalid", code, "", email.message.Message(), None
    )


@pytest.fixture
def answers(monkeypatch: pytest.MonkeyPatch) -> list[bytes | Exception]:
    """What the source answers, one request after the other; the requests are in ``asked``."""
    queue: list[bytes | Exception] = []

    def fetch(url: str) -> bytes:
        asked.append(url)
        answer = queue.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer

    asked.clear()
    monkeypatch.setattr(source, "_fetch", fetch)
    for pause in ("PAGE_PAUSE", "GIF_PAUSE", "BUSY_PAUSE", "NETWORK_PAUSE"):
        monkeypatch.setattr(source, pause, 0)
    return queue


asked: list[str] = []


async def test_a_file_the_source_does_not_have_is_missing_for_good(
    answers: list[bytes | Exception],
) -> None:
    answers.append(http_error(404))

    with pytest.raises(SourceError) as error:
        await ExerciseDb().gif("abc1234")

    assert error.value.missing is True
    assert len(asked) == 1  # asking again wouldn't help


async def test_a_busy_source_is_asked_again(answers: list[bytes | Exception]) -> None:
    answers.extend([http_error(429), http_error(503), GIF])

    assert await ExerciseDb().gif("abc1234") == GIF
    assert len(asked) == 3


async def test_a_source_that_never_answers_is_not_a_missing_file(
    answers: list[bytes | Exception],
) -> None:
    answers.extend([urllib.error.URLError("no route")] * source.RETRIES)

    with pytest.raises(SourceError) as error:
        await ExerciseDb().gif("abc1234")

    assert error.value.missing is False  # it is tried again another time
    assert len(asked) == source.RETRIES


async def test_what_is_not_a_gif_is_not_taken(answers: list[bytes | Exception]) -> None:
    answers.append(b"<html>not found</html>")

    with pytest.raises(SourceError) as error:
        await ExerciseDb().gif("abc1234")

    assert error.value.missing is True


async def test_an_id_that_is_not_the_sources_is_never_asked_for(
    answers: list[bytes | Exception],
) -> None:
    with pytest.raises(SourceError):
        await ExerciseDb().gif("../users")

    assert asked == []


async def test_the_catalogue_is_read_page_by_page(answers: list[bytes | Exception]) -> None:
    def page(ids: list[str], cursor: str | None) -> bytes:
        data = [
            {"exerciseId": i, "name": f"exercise {i}", "bodyParts": ["back"], "equipments": []}
            for i in ids
        ]
        meta = {"hasNextPage": cursor is not None, "nextCursor": cursor}
        return json.dumps({"data": data, "meta": meta}).encode()

    answers.extend([page(["aaaa1", "bbbb2"], "bbbb2"), page(["cccc3", "no id!"], None)])

    catalogue = await ExerciseDb().catalogue()

    assert [exercise.id for exercise in catalogue] == ["aaaa1", "bbbb2", "cccc3"]
    assert catalogue[0].body_parts == ["back"]
    assert catalogue[0].target_muscles == []
    assert "after=bbbb2" in asked[1]


async def test_an_answer_that_is_not_the_catalogue_is_an_error(
    answers: list[bytes | Exception],
) -> None:
    answers.append(b"<html>maintenance</html>")

    with pytest.raises(SourceError) as error:
        await ExerciseDb().catalogue()

    assert error.value.missing is False
