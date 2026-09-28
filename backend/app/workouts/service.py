"""Business logic for the workouts domain. Routers only map HTTP to these functions.

Import is two steps: ``import_pdf`` stores the upload and returns what the LLM understood;
the client lets the user fix it and ``create_plan`` saves the confirmed structure.
"""

import asyncio
import logging
import re
import uuid
from pathlib import PurePath

from fastapi import UploadFile
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.storage import Storage
from app.exercises.models import Exercise
from app.files import service as files
from app.files.models import FileKind
from app.workouts.errors import (
    PdfNoStructureError,
    PdfNoTextError,
    PdfReaderUnavailableError,
    PdfUnreadableError,
    PlanNotFoundError,
)
from app.workouts.models import WorkoutDay, WorkoutPlan
from app.workouts.parser import (
    NoWorkoutStructureError,
    ParsedPlan,
    ParserUnavailableError,
    PlanParser,
    UnreadablePdfError,
    extract_text,
)
from app.workouts.schemas import (
    DayPreview,
    ExercisePreview,
    ImportPreview,
    PlanCreate,
    PlanSummary,
)

logger = logging.getLogger(__name__)

MAX_PDF_BYTES = 20 * 1024 * 1024
_TITLE_PREFIX = re.compile(r"^periodiza[cç][aã]o\s+de\s+", re.IGNORECASE)


def _plan_name(parsed: ParsedPlan, filename: str) -> str:
    """ "Periodização de Treino 01" → "Treino 01"; else the file name without extension."""
    if parsed.title:
        return _TITLE_PREFIX.sub("", parsed.title)[:120]
    return PurePath(filename).stem[:120] or "Treino"


def _preview(parsed: ParsedPlan, file_id: uuid.UUID, filename: str) -> ImportPreview:
    """The parser already bounds every value to what these schemas accept."""
    return ImportPreview(
        file_id=file_id,
        filename=filename,
        name=_plan_name(parsed, filename),
        valid_until=parsed.valid_until,
        rest_days=parsed.rest_days,
        days=[
            DayPreview(
                weekday=day.weekday,
                label=day.label,
                exercises=[ExercisePreview(**vars(exercise)) for exercise in day.exercises],
            )
            for day in parsed.days
        ],
    )


async def import_pdf(
    session: AsyncSession,
    storage: Storage,
    parser: PlanParser,
    user_id: uuid.UUID,
    upload: UploadFile,
) -> ImportPreview:
    data = await files.read_upload(upload, max_bytes=MAX_PDF_BYTES)
    files.require_pdf(data)
    try:
        # pdfminer is CPU-bound: keep it off the event loop.
        text = await asyncio.to_thread(extract_text, data)
    except UnreadablePdfError as exc:
        raise PdfUnreadableError from exc
    if not text:
        raise PdfNoTextError  # a scan: the LLM only reads text
    try:
        parsed = await parser.parse(text)
    except NoWorkoutStructureError as exc:
        raise PdfNoStructureError from exc
    except ParserUnavailableError as exc:
        logger.warning("Workout-plan reader unavailable: %s", exc)
        raise PdfReaderUnavailableError from exc
    # Only PDFs that parsed are kept.
    stored = await files.store_file(
        session,
        storage,
        user_id=user_id,
        kind=FileKind.WORKOUT_PDF,
        filename=upload.filename,
        content_type="application/pdf",
        data=data,
    )
    await session.commit()
    return _preview(parsed, stored.id, stored.filename)


async def create_plan(session: AsyncSession, user_id: uuid.UUID, data: PlanCreate) -> WorkoutPlan:
    if data.source_file_id is not None:
        await files.get_user_file(session, user_id, data.source_file_id)  # ownership check
    if data.activate:
        await session.execute(
            update(WorkoutPlan)
            .where(WorkoutPlan.user_id == user_id, WorkoutPlan.is_active)
            .values(is_active=False)
        )
    plan = WorkoutPlan(
        user_id=user_id,
        name=data.name,
        source_file_id=data.source_file_id,
        valid_until=data.valid_until,
        is_active=data.activate,
        days=[
            WorkoutDay(
                weekday=day.weekday,
                label=day.label,
                position=day_position,
                exercises=[
                    Exercise(**exercise.model_dump(), position=position)
                    for position, exercise in enumerate(day.exercises)
                ],
            )
            for day_position, day in enumerate(data.days)
        ],
    )
    session.add(plan)
    await session.commit()
    return await get_plan(session, user_id, plan.id)


async def get_plan(session: AsyncSession, user_id: uuid.UUID, plan_id: uuid.UUID) -> WorkoutPlan:
    plan = await session.scalar(
        select(WorkoutPlan)
        .where(WorkoutPlan.id == plan_id, WorkoutPlan.user_id == user_id)
        .options(selectinload(WorkoutPlan.days).selectinload(WorkoutDay.exercises))
        .execution_options(populate_existing=True)
    )
    if plan is None:
        raise PlanNotFoundError
    return plan


async def list_plans(session: AsyncSession, user_id: uuid.UUID) -> list[PlanSummary]:
    exercise_count = (
        select(func.count(Exercise.id))
        .join(WorkoutDay, Exercise.day_id == WorkoutDay.id)
        .where(WorkoutDay.plan_id == WorkoutPlan.id)
        .scalar_subquery()
    )
    weekdays = (
        select(func.array_agg(WorkoutDay.weekday).filter(WorkoutDay.weekday.is_not(None)))
        .where(WorkoutDay.plan_id == WorkoutPlan.id)
        .scalar_subquery()
    )
    rows = await session.execute(
        select(WorkoutPlan, exercise_count, weekdays)
        .where(WorkoutPlan.user_id == user_id)
        .order_by(WorkoutPlan.is_active.desc(), WorkoutPlan.created_at.desc())
    )
    return [
        PlanSummary(
            id=plan.id,
            name=plan.name,
            is_active=plan.is_active,
            valid_until=plan.valid_until,
            source_file_id=plan.source_file_id,
            created_at=plan.created_at,
            weekdays=sorted(days or []),
            exercise_count=count,
        )
        for plan, count, days in rows.all()
    ]
