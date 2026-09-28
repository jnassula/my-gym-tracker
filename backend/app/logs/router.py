import uuid

from fastapi import APIRouter, status

from app.auth.dependencies import CurrentUser
from app.core.db import SessionDep
from app.logs import service
from app.logs.schemas import (
    DayLog,
    ExerciseHistory,
    PlanWeek,
    SessionRead,
    SessionSummary,
    SetCreate,
    SetUpdate,
)

router = APIRouter(prefix="/logs", tags=["logs"])


@router.get("/days/{day_id}")
async def day_log(day_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> DayLog:
    """Today's session for a plan day, and when each of its exercises was last trained."""
    return await service.day_log(session, user, day_id)


@router.get("/plans/{plan_id}/week")
async def plan_week(plan_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> PlanWeek:
    return await service.plan_week(session, user, plan_id)


@router.post("/exercises/{exercise_id}/sets", status_code=status.HTTP_201_CREATED)
async def log_set(
    exercise_id: uuid.UUID, body: SetCreate, user: CurrentUser, session: SessionDep
) -> SessionRead:
    """Log a set (weight in kg). The first one of the day starts today's session."""
    return await service.log_set(session, user, exercise_id, body)


@router.put("/exercises/{exercise_id}/done")
async def mark_done(exercise_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> SessionRead:
    """Tick an exercise off without logging its sets (a treadmill warm-up, say)."""
    return await service.mark_done(session, user, exercise_id)


@router.delete("/exercises/{exercise_id}/done")
async def unmark_done(
    exercise_id: uuid.UUID, user: CurrentUser, session: SessionDep
) -> SessionRead | None:
    """Untick it. Returns null when that leaves today's session empty (it is removed)."""
    return await service.unmark_done(session, user, exercise_id)


@router.get("/exercises/{exercise_id}/history")
async def exercise_history(
    exercise_id: uuid.UUID, user: CurrentUser, session: SessionDep
) -> ExerciseHistory:
    return await service.exercise_history(session, user, exercise_id)


@router.patch("/sets/{set_id}")
async def update_set(
    set_id: uuid.UUID, body: SetUpdate, user: CurrentUser, session: SessionDep
) -> SessionRead:
    return await service.update_set(session, user, set_id, body)


@router.delete("/sets/{set_id}")
async def delete_set(
    set_id: uuid.UUID, user: CurrentUser, session: SessionDep
) -> SessionRead | None:
    """Returns null when it was the session's last set (the session is removed)."""
    return await service.delete_set(session, user, set_id)


@router.post("/sessions/{session_id}/finish")
async def finish_session(
    session_id: uuid.UUID, user: CurrentUser, session: SessionDep
) -> SessionSummary:
    """Ends the session ("Terminar treino"; idempotent) and sums it up."""
    return await service.finish_session(session, user, session_id)
