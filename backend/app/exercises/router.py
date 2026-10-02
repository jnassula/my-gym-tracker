from fastapi import APIRouter

from app.auth.dependencies import CurrentUser
from app.core.db import SessionDep
from app.exercises import service
from app.exercises.schemas import Library

router = APIRouter(prefix="/exercises", tags=["exercises"])


@router.get("/library")
async def get_library(user: CurrentUser, session: SessionDep) -> Library:
    """Exercises to pick from when building a plan: the user's own, then the base list."""
    return await service.library(session, user)
