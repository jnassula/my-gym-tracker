"""One question to the LLM, answered in JSON, through a Google ADK agent over any OpenAI-compatible
API (DeepSeek by default, ``Settings.llm_*``).

The plan reader (``workouts.parser.agent``) predates this module and keeps its own runner, with
its two reasoning efforts and its photos; anything new that only needs "text in, JSON out" uses
this one.
"""

import asyncio
import contextlib
import uuid

from google.adk.agents import LlmAgent
from google.adk.integrations.openai import OpenAIGenerateContentConfig
from google.adk.models.base_llm import BaseLlm
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from openai import OpenAIError

APP_NAME = "mygymtracker"
# No thinking unless asked for: DeepSeek thinks by default, and most questions are lookups.
REASONING_EFFORT = "none"


class LlmUnavailableError(Exception):
    """The LLM could not be reached, or did not return a usable answer."""


class _EffortConfig(OpenAIGenerateContentConfig):
    """Also accepts effort "none" (no thinking), which DeepSeek takes but OpenAI's tiers lack."""

    effort: str | None = None  # type: ignore[assignment]


def json_body(reply: str) -> str:
    """Models sometimes wrap JSON in a Markdown fence even in JSON mode."""
    body = reply.strip().removeprefix("```json").removeprefix("```").removesuffix("```")
    return body.strip()


class JsonAgent:
    def __init__(
        self,
        model: BaseLlm,
        *,
        name: str,
        description: str,
        instruction: str,
        timeout: float,
        max_output_tokens: int,
        effort: str = REASONING_EFFORT,
    ) -> None:
        self._sessions = InMemorySessionService()
        agent = LlmAgent(
            name=name,
            description=description,
            model=model,
            # A provider, not a str: ADK would read a JSON example's braces as state keys.
            instruction=lambda _context: instruction,
            generate_content_config=_EffortConfig(
                response_mime_type="application/json",
                max_output_tokens=max_output_tokens,
                effort=effort,
            ),
        )
        self._runner = Runner(
            app_name=APP_NAME,
            agent=agent,
            session_service=self._sessions,
            auto_create_session=True,
        )
        self._timeout = timeout

    async def ask(self, text: str) -> str:
        """The model's reply to one message: a stateless run in a fresh session, deleted
        afterwards. Raises ``LlmUnavailableError``."""
        session_id = uuid.uuid4().hex
        message = types.Content(role="user", parts=[types.Part.from_text(text=text)])
        reply = ""
        try:
            async with asyncio.timeout(self._timeout):
                events = self._runner.run_async(
                    user_id=APP_NAME, session_id=session_id, new_message=message
                )
                async with contextlib.aclosing(events):
                    async for event in events:
                        if event.error_code:
                            raise LlmUnavailableError(f"{event.error_code}: {event.error_message}")
                        if event.is_final_response() and event.content and event.content.parts:
                            parts = event.content.parts
                            reply = "".join(p.text for p in parts if p.text and not p.thought)
        except TimeoutError as exc:
            raise LlmUnavailableError(f"No answer within {self._timeout:.0f}s") from exc
        except OpenAIError as exc:
            raise LlmUnavailableError(f"{type(exc).__name__}: {exc}") from exc
        finally:
            await self._sessions.delete_session(
                app_name=APP_NAME, user_id=APP_NAME, session_id=session_id
            )
        return reply
