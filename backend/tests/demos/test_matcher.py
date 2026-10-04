"""The matcher end to end, with a scripted model in place of the LLM API."""

import json

import pytest

from app.core.llm import LlmUnavailableError
from app.demos.matcher import INSTRUCTION, LlmDemoMatcher, MatchExercise, _letter
from tests.workouts.test_agent import ScriptedLlm

CATALOGUE = {"zzz9": "barbell squat", "aaa1": "barbell bench press", "mmm5": "lat pulldown"}
EXERCISES = [
    MatchExercise(name="supino reto com barra", group="chest"),
    MatchExercise(name="puxador frontal", group="back"),
    MatchExercise(name="alongamento", group="warmup"),
]


def matcher_for(*replies: str | Exception) -> tuple[LlmDemoMatcher, ScriptedLlm]:
    llm = ScriptedLlm(replies=list(replies))
    return LlmDemoMatcher(llm, timeout=5), llm


async def test_asks_with_the_catalogue_numbered_and_reads_the_numbers_back() -> None:
    matcher, llm = matcher_for(json.dumps({"matches": {"a": 1, "b": 2, "c": None}}))

    answers = await matcher.match(EXERCISES, CATALOGUE)

    # Numbered in the ids' order, whatever order they came in: the same text every time.
    assert answers == ["aaa1", "mmm5", None]
    [request] = llm.requests
    assert request.config.response_mime_type == "application/json"
    assert str(request.config.system_instruction).startswith(INSTRUCTION)
    assert getattr(request.config, "effort", None) == "low"  # it thinks before it picks
    assert request.contents[-1].parts is not None
    question = json.loads(request.contents[-1].parts[0].text or "")
    assert question["catalogue"] == {
        "1": "barbell bench press",
        "2": "lat pulldown",
        "3": "barbell squat",
    }
    assert question["exercises"]["a"] == {"name": "supino reto com barra", "group": "chest"}
    assert list(question) == ["catalogue", "exercises"]  # the catalogue first: a cached opening


@pytest.mark.parametrize(
    "matches",
    [
        {"a": 99, "b": 0, "c": -1},  # numbers the catalogue doesn't have
        {},  # nothing answered
        {"z": 1},  # an exercise that wasn't asked
    ],
)
async def test_an_answer_that_names_nothing_of_the_catalogue_is_no_animation(
    matches: dict[str, int],
) -> None:
    matcher, _ = matcher_for(json.dumps({"matches": matches}))

    assert await matcher.match(EXERCISES, CATALOGUE) == [None, None, None]


async def test_a_fenced_reply_is_read_and_a_bad_one_asked_again() -> None:
    good = '```json\n{"matches": {"a": 3}}\n```'
    matcher, llm = matcher_for("not json", good)

    assert await matcher.match(EXERCISES[:1], CATALOGUE) == ["zzz9"]
    assert len(llm.requests) == 2


async def test_two_bad_replies_are_the_matcher_being_unavailable() -> None:
    matcher, _ = matcher_for("not json", '{"matches": "no"}')

    with pytest.raises(LlmUnavailableError):
        await matcher.match(EXERCISES, CATALOGUE)


async def test_the_providers_error_is_the_matcher_being_unavailable() -> None:
    matcher, _ = matcher_for(RuntimeError("boom"))

    with pytest.raises((LlmUnavailableError, RuntimeError)):
        await matcher.match(EXERCISES, CATALOGUE)


def test_exercises_are_lettered_apart_from_the_catalogues_numbers() -> None:
    assert [_letter(index) for index in (0, 1, 25, 26, 27, 51, 52)] == [
        "a",
        "b",
        "z",
        "aa",
        "ab",
        "az",
        "ba",
    ]
