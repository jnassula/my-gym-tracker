"""Business logic for the workouts domain. Routers only map HTTP to these functions.

Import is two steps: ``import_pdf`` stores the upload and returns what the LLM understood;
the client lets the user fix it and ``create_plan`` saves the confirmed structure.
"""

import asyncio
import logging
import re
import uuid
from pathlib import PurePath
from zoneinfo import ZoneInfo

from fastapi import UploadFile
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.db import utcnow
from app.core.storage import Storage
from app.exercises import service as exercises
from app.exercises.key import exercise_key
from app.exercises.models import Exercise
from app.files import service as files
from app.files.models import FileKind, StoredFile
from app.users.models import User
from app.workouts.errors import (
    PdfNoStructureError,
    PdfNoTextError,
    PdfReaderUnavailableError,
    PdfUnreadableError,
    PlanNotFoundError,
)
from app.workouts.export import render_plan_pdf
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
    PlanUpdate,
    SourceFile,
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
        await _deactivate_all(session, user_id)
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


async def _deactivate_all(session: AsyncSession, user_id: uuid.UUID) -> None:
    await session.execute(
        update(WorkoutPlan)
        .where(WorkoutPlan.user_id == user_id, WorkoutPlan.is_active)
        .values(is_active=False)
    )


async def get_plan(session: AsyncSession, user_id: uuid.UUID, plan_id: uuid.UUID) -> WorkoutPlan:
    """A plan of the user's that hasn't been deleted."""
    plan = await session.scalar(
        select(WorkoutPlan)
        .where(
            WorkoutPlan.id == plan_id,
            WorkoutPlan.user_id == user_id,
            WorkoutPlan.deleted_at.is_(None),
        )
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
    day_count = (
        select(func.count(WorkoutDay.id))
        .where(WorkoutDay.plan_id == WorkoutPlan.id)
        .scalar_subquery()
    )
    rows = await session.execute(
        select(WorkoutPlan, exercise_count, weekdays, day_count, StoredFile)
        .outerjoin(StoredFile, WorkoutPlan.source_file_id == StoredFile.id)
        .where(WorkoutPlan.user_id == user_id, WorkoutPlan.deleted_at.is_(None))
        .order_by(WorkoutPlan.is_active.desc(), WorkoutPlan.created_at.desc())
    )
    return [
        PlanSummary(
            id=plan.id,
            name=plan.name,
            is_active=plan.is_active,
            valid_until=plan.valid_until,
            source_file_id=plan.source_file_id,
            source_file=(
                SourceFile(id=file.id, filename=file.filename, size_bytes=file.size_bytes)
                if file
                else None
            ),
            created_at=plan.created_at,
            weekdays=sorted(days or []),
            day_count=n_days,
            exercise_count=count,
        )
        for plan, count, days, n_days, file in rows.all()
    ]


async def update_plan(
    session: AsyncSession, user_id: uuid.UUID, plan_id: uuid.UUID, data: PlanUpdate
) -> WorkoutPlan:
    plan = await get_plan(session, user_id, plan_id)
    if data.name is not None:
        plan.name = data.name
    if data.is_active is not None and data.is_active != plan.is_active:
        if data.is_active:
            await _deactivate_all(session, user_id)
        plan.is_active = data.is_active
    await session.commit()
    return await get_plan(session, user_id, plan_id)


async def delete_plan(
    session: AsyncSession, storage: Storage, user_id: uuid.UUID, plan_id: uuid.UUID
) -> None:
    """Hide the plan and delete its PDF; the logged weights stay in the history."""
    plan = await get_plan(session, user_id, plan_id)
    plan.deleted_at = utcnow()
    plan.is_active = False
    source_file_id, plan.source_file_id = plan.source_file_id, None
    await session.flush()
    if source_file_id is not None:
        await files.delete_file(session, storage, user_id, source_file_id)
    await session.commit()


_UNSAFE = re.compile(r"[^\w\- ]+", re.UNICODE)


def export_filename(name: str) -> str:
    """ "Treino 01 / fase A" → "Treino 01  fase A.pdf": a name every OS accepts."""
    stem = _UNSAFE.sub("", name).strip() or "treino"
    return f"{stem[:80]}.pdf"


async def export_pdf(
    session: AsyncSession, user: User, plan_id: uuid.UUID, *, include_weights: bool
) -> tuple[bytes, str]:
    """The plan as a PDF in the trainer's format, with the last weight logged on each
    exercise when asked. Dated in the user's time zone."""
    plan = await get_plan(session, user.id, plan_id)
    weights = None
    if include_weights:
        by_key = await exercises.last_weights(session, user)
        weights = {
            exercise.id: weight
            for day in plan.days
            for exercise in day.exercises
            if (weight := by_key.get(exercise_key(exercise.name, exercise.muscle_group)))
        }
    today = utcnow().astimezone(ZoneInfo(user.timezone)).date()
    data = await asyncio.to_thread(
        render_plan_pdf,
        plan,
        student=user.name,
        language=user.language,
        today=today,
        weights=weights,
    )
    return data, export_filename(plan.name)
