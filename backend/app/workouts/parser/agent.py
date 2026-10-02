"""The text of a workout-plan PDF, or photos of printed sheets → ``ParsedPlan``, read by an LLM
agent (Google ADK).

The agent reaches any OpenAI-compatible API through ADK's ``OpenAILlm``: DeepSeek by default,
see ``Settings.llm_*``. Services depend on the ``PlanParser`` protocol (FastAPI dependency
``get_plan_parser``) so tests use a fake and never call the API.
"""

import asyncio
import contextlib
import logging
import uuid
from functools import lru_cache
from typing import Protocol

from google.adk.agents import LlmAgent
from google.adk.integrations.openai import OpenAIGenerateContentConfig, OpenAILlm
from google.adk.models.base_llm import BaseLlm
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from openai import AsyncOpenAI, OpenAIError
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.workouts.parser.output import PlanOutput, to_parsed_plan
from app.workouts.parser.prompt import INSTRUCTION, PHOTOS_NOTE
from app.workouts.parser.types import ParsedPlan

logger = logging.getLogger(__name__)

APP_NAME = "mygymtracker"
AGENT_NAME = "workout_plan_reader"
# DeepSeek thinks by default, and even at "minimal" effort a week's plan took 90-120 s and ran
# past 32k tokens. Reading a table needs no thinking: with "none" the samples take ~15 s and
# ~6k tokens, and read as well.
REASONING_EFFORT = "none"
# Photos are another matter: at "none" the model drops a skewed row's sets or the sheet's label
# one run in three; at "low" three sheets take 12-15 s and come back whole.
PHOTOS_REASONING_EFFORT = "low"
MAX_OUTPUT_TOKENS = 16_384
# A reply that isn't the JSON asked for gets one more try.
ATTEMPTS = 2


class ParserUnavailableError(Exception):
    """The LLM could not be reached, or did not return a usable answer."""


class PlanParser(Protocol):
    async def parse(self, text: str) -> ParsedPlan: ...

    async def parse_images(self, images: list[bytes]) -> ParsedPlan: ...


class _EffortConfig(OpenAIGenerateContentConfig):
    """Also accepts effort "none" (no thinking), which DeepSeek takes but OpenAI's tiers lack.

    ADK passes the effort through unchecked when the client is injected, as ours is.
    """

    effort: str | None = None  # type: ignore[assignment]


def _json_body(reply: str) -> str:
    """Models sometimes wrap JSON in a Markdown fence even in JSON mode."""
    body = reply.strip().removeprefix("```json").removeprefix("```").removesuffix("```")
    return body.strip()


class AgentPlanParser:
    def __init__(self, model: BaseLlm, *, timeout: float) -> None:
        self._sessions = InMemorySessionService()
        self._text = self._runner(model, REASONING_EFFORT, "text")
        self._photos = self._runner(model, PHOTOS_REASONING_EFFORT, "photos")
        self._timeout = timeout

    def _runner(self, model: BaseLlm, effort: str, kind: str) -> Runner:
        agent = LlmAgent(
            name=f"{AGENT_NAME}_{kind}",
            description="Turns a workout plan (PDF text or photos) into days and exercises.",
            model=model,
            # A provider, not a str: ADK would read the JSON example's braces as state keys.
            instruction=lambda _context: INSTRUCTION,
            generate_content_config=_EffortConfig(
                response_mime_type="application/json",
                max_output_tokens=MAX_OUTPUT_TOKENS,
                effort=effort,
            ),
        )
        return Runner(
            app_name=APP_NAME,
            agent=agent,
            session_service=self._sessions,
            auto_create_session=True,
        )

    async def parse(self, text: str) -> ParsedPlan:
        """Raises ``NoWorkoutStructureError`` or ``ParserUnavailableError``."""
        return await self._read(self._text, [types.Part.from_text(text=text)])

    async def parse_images(self, images: list[bytes]) -> ParsedPlan:
        """JPEG photos of printed sheets (``images.prepare``), one day each, in order."""
        parts = [types.Part.from_text(text=PHOTOS_NOTE.format(count=len(images)))]
        parts += [types.Part.from_bytes(data=image, mime_type="image/jpeg") for image in images]
        return await self._read(self._photos, parts)

    async def _read(self, runner: Runner, parts: list[types.Part]) -> ParsedPlan:
        try:
            async with asyncio.timeout(self._timeout):
                for attempt in range(1, ATTEMPTS + 1):
                    reply = await self._ask(runner, parts)
                    try:
                        output = PlanOutput.model_validate_json(_json_body(reply))
                    except ValidationError:
                        logger.warning("Plan reader returned invalid JSON (attempt %d)", attempt)
                        continue
                    return to_parsed_plan(output)
        except TimeoutError as exc:
            raise ParserUnavailableError(f"No answer within {self._timeout:.0f}s") from exc
        raise ParserUnavailableError("The model did not return the expected JSON")

    async def _ask(self, runner: Runner, parts: list[types.Part]) -> str:
        """One stateless run in a fresh session, deleted afterwards (it holds the plan)."""
        session_id = uuid.uuid4().hex
        message = types.Content(role="user", parts=parts)
        reply = ""
        try:
            events = runner.run_async(user_id=APP_NAME, session_id=session_id, new_message=message)
            async with contextlib.aclosing(events):
                async for event in events:
                    if event.error_code:
                        raise ParserUnavailableError(f"{event.error_code}: {event.error_message}")
                    if event.is_final_response() and event.content and event.content.parts:
                        parts = event.content.parts
                        reply = "".join(p.text for p in parts if p.text and not p.thought)
        except OpenAIError as exc:
            raise ParserUnavailableError(f"{type(exc).__name__}: {exc}") from exc
        finally:
            await self._sessions.delete_session(
                app_name=APP_NAME, user_id=APP_NAME, session_id=session_id
            )
        return reply


def llm_client(settings: Settings, api_key: str) -> AsyncOpenAI:
    return AsyncOpenAI(
        api_key=api_key,
        base_url=settings.llm_base_url,
        timeout=settings.llm_timeout_seconds,
        max_retries=1,
    )


def build_plan_parser(settings: Settings, client: AsyncOpenAI) -> AgentPlanParser:
    return AgentPlanParser(
        OpenAILlm(model=settings.llm_model, client=client),
        timeout=settings.llm_timeout_seconds,
    )


class _Unconfigured:
    async def parse(self, text: str) -> ParsedPlan:
        raise ParserUnavailableError("LLM_API_KEY is not set")

    async def parse_images(self, images: list[bytes]) -> ParsedPlan:
        raise ParserUnavailableError("LLM_API_KEY is not set")


@lru_cache
def get_plan_parser() -> PlanParser:
    settings = get_settings()
    api_key = settings.llm_api_key.get_secret_value()
    if not api_key:
        logger.warning("LLM_API_KEY is not set: importing PDFs is disabled")
        return _Unconfigured()
    # One client for the app's lifetime: it pools the HTTPS connections to the provider.
    return build_plan_parser(settings, llm_client(settings, api_key))
