import uuid
from datetime import date

from fastapi import APIRouter

from app.auth.dependencies import CurrentUser
from app.core.db import SessionDep
from app.progress import service
from app.progress.schemas import (
    ExerciseProgress,
    ProgressCalendar,
    ProgressOverview,
    Range,
    SessionDetail,
    WeekComparison,
)

router = APIRouter(prefix="/progress", tags=["progress"])


@router.get("")
async def overview(user: CurrentUser, session: SessionDep) -> ProgressOverview:
    """Streak, this week's volume and sets by group, records this month, and every exercise."""
    return await service.overview(session, user)


@router.get("/exercises/{exercise_id}")
async def exercise_progress(
    exercise_id: uuid.UUID, user: CurrentUser, session: SessionDep, range: Range = "3m"
) -> ExerciseProgress:
    """One exercise across plans: heaviest set per session (per week for "1y")."""
    return await service.exercise_progress(session, user, exercise_id, range)


@router.get("/calendar")
async def calendar(
    user: CurrentUser, session: SessionDep, month: date | None = None
) -> ProgressCalendar:
    """A month of trained, missed and rest days (any date in the month; default: this one)."""
    return await service.calendar(session, user, month)


@router.get("/weeks")
async def week_comparison(user: CurrentUser, session: SessionDep) -> WeekComparison:
    return await service.week_comparison(session, user)


@router.get("/sessions/{session_id}")
async def session_detail(
    session_id: uuid.UUID, user: CurrentUser, session: SessionDep
) -> SessionDetail:
    """One session's exercises and, once a data source has synced, the watch's data."""
    return await service.session_detail(session, user, session_id)
