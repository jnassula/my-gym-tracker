"""The ADK agent end to end, with a scripted model in place of the LLM API."""

import asyncio
import json
from collections.abc import AsyncGenerator

import httpx
import openai
import pytest
from google.adk.agents import LlmAgent
from google.adk.integrations.openai import OpenAILlm
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types
from pydantic import Field

from app.core.config import Settings
from app.workouts.parser import NoWorkoutStructureError, ParserUnavailableError
from app.workouts.parser import agent as agent_module
from app.workouts.parser.agent import APP_NAME, AgentPlanParser, get_plan_parser
from tests.workouts.layout import PLAN_REPLY

PLAN_JSON = json.dumps(PLAN_REPLY)


class ScriptedLlm(BaseLlm):
    """Answers each request with the next reply; an exception is raised instead."""

    model: str = "scripted"
    replies: list[str | Exception] = Field(default_factory=list)
    requests: list[LlmRequest] = Field(default_factory=list)
    delay: float = 0.0

    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse]:
        self.requests.append(llm_request)
        await asyncio.sleep(self.delay)
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        yield LlmResponse(content=types.Content(role="model", parts=[types.Part(text=reply)]))


def parser_for(
    *replies: str | Exception, delay: float = 0.0
) -> tuple[AgentPlanParser, ScriptedLlm]:
    llm = ScriptedLlm(replies=list(replies), delay=delay)
    return AgentPlanParser(llm, timeout=5), llm


async def test_sends_the_text_and_returns_the_plan() -> None:
    parser, llm = parser_for(PLAN_JSON)

    plan = await parser.parse("Periodização de Treino 07 …")

    assert [day.weekday for day in plan.days] == [0, 1, 4]
    [request] = llm.requests
    assert request.config.response_mime_type == "application/json"
    assert "workout plan" in str(request.config.system_instruction)
    assert request.contents[-1].parts is not None
    assert request.contents[-1].parts[0].text == "Periodização de Treino 07 …"
    assert getattr(request.config, "effort", None) == "none"


async def test_sends_photos_as_images_after_a_note() -> None:
    parser, llm = parser_for(PLAN_JSON)

    await parser.parse_images([b"\xff\xd8\xffone", b"\xff\xd8\xfftwo"])

    [request] = llm.requests
    parts = request.contents[-1].parts
    assert parts is not None
    assert parts[0].text is not None
    assert "2 photograph(s)" in parts[0].text
    assert [p.inline_data.mime_type for p in parts[1:] if p.inline_data] == ["image/jpeg"] * 2
    assert parts[2].inline_data is not None
    assert parts[2].inline_data.data == b"\xff\xd8\xfftwo"
    assert "photographs of printed gym sheets" in str(request.config.system_instruction)
    assert getattr(request.config, "effort", None) == "low"


async def test_every_run_starts_fresh_and_leaves_no_session_behind() -> None:
    parser, llm = parser_for(PLAN_JSON, PLAN_JSON)

    await parser.parse("first plan")
    await parser.parse("second plan")

    # The second request doesn't carry the first plan: each import is its own conversation.
    assert "first plan" not in str(llm.requests[1].contents)
    sessions = await parser._sessions.list_sessions(app_name=APP_NAME)
    assert sessions.sessions == []


async def test_accepts_json_in_a_markdown_fence() -> None:
    parser, _ = parser_for(f"```json\n{PLAN_JSON}\n```")

    assert len((await parser.parse("…")).days) == 3


async def test_retries_once_when_the_reply_is_not_json() -> None:
    parser, llm = parser_for("Here is the plan!", PLAN_JSON)

    assert len((await parser.parse("…")).days) == 3
    assert len(llm.requests) == 2


async def test_gives_up_after_two_replies_that_are_not_json() -> None:
    parser, _ = parser_for("nope", '{"days": "not a list"}')

    with pytest.raises(ParserUnavailableError):
        await parser.parse("…")


async def test_text_that_is_not_a_plan() -> None:
    parser, llm = parser_for('{"is_workout_plan": false, "days": []}')

    with pytest.raises(NoWorkoutStructureError):
        await parser.parse("Fatura n.º 123")
    assert len(llm.requests) == 1


async def test_api_errors_make_the_reader_unavailable() -> None:
    request = httpx.Request("POST", "https://api.deepseek.com/chat/completions")
    parser, _ = parser_for(openai.APIConnectionError(request=request))

    with pytest.raises(ParserUnavailableError):
        await parser.parse("…")


async def test_a_slow_model_times_out() -> None:
    llm = ScriptedLlm(replies=[PLAN_JSON], delay=1)
    parser = AgentPlanParser(llm, timeout=0.05)

    with pytest.raises(ParserUnavailableError):
        await parser.parse("…")


# --- configuration -----------------------------------------------------------------------------


def _settings(**llm: str) -> Settings:
    return Settings(database_url="postgresql+asyncpg://unused", jwt_secret="x" * 32, **llm)  # type: ignore[arg-type]


async def test_without_an_api_key_importing_is_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(agent_module, "get_settings", lambda: _settings(llm_api_key=""))

    parser = get_plan_parser.__wrapped__()

    with pytest.raises(ParserUnavailableError):
        await parser.parse("…")


def test_the_agent_uses_the_configured_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = _settings(
        llm_api_key="sk-test", llm_base_url="https://llm.example/v1", llm_model="deepseek-flash"
    )
    monkeypatch.setattr(agent_module, "get_settings", lambda: settings)

    parser = get_plan_parser.__wrapped__()

    assert isinstance(parser, AgentPlanParser)
    agent = parser._text.agent
    assert isinstance(agent, LlmAgent)
    assert parser._photos.agent is not agent  # photos get their own effort
    model = agent.model
    assert isinstance(model, OpenAILlm)
    assert model.model == "deepseek-flash"
    assert model.client is not None
    assert str(model.client.base_url) == "https://llm.example/v1/"
