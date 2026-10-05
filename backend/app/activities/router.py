import uuid
from datetime import date

from fastapi import APIRouter, status

from app.activities import service
from app.activities.schemas import ActivitiesRead, ActivityCreate, ActivityRead, ActivityUpdate
from app.auth.dependencies import CurrentUser
from app.core.db import SessionDep

router = APIRouter(prefix="/activities", tags=["activities"])


@router.get("")
async def overview(user: CurrentUser, session: SessionDep) -> ActivitiesRead:
    """The user's activities (footvolley, surf), and the active plan's days with the regions of
    the body each works, to show what an activity keeps away."""
    return await service.overview(session, user)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create(body: ActivityCreate, user: CurrentUser, session: SessionDep) -> ActivityRead:
    return await service.create(session, user, body)


@router.patch("/{activity_id}")
async def update(
    activity_id: uuid.UUID, body: ActivityUpdate, user: CurrentUser, session: SessionDep
) -> ActivityRead:
    """Changing the fixed weekdays moves no past day: only today's and those to come."""
    return await service.update(session, user, activity_id, body)


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove(activity_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> None:
    """Archives it: off the days to come, its past days kept on the calendar."""
    await service.remove(session, user, activity_id)


@router.put("/{activity_id}/days/{day}", status_code=status.HTTP_204_NO_CONTENT)
async def mark(activity_id: uuid.UUID, day: date, user: CurrentUser, session: SessionDep) -> None:
    """The activity is on that date (within two weeks of today)."""
    await service.mark(session, user, activity_id, day)


@router.delete("/{activity_id}/days/{day}", status_code=status.HTTP_204_NO_CONTENT)
async def unmark(activity_id: uuid.UUID, day: date, user: CurrentUser, session: SessionDep) -> None:
    """The activity isn't on that date ("não fui", for one of its fixed days)."""
    await service.unmark(session, user, activity_id, day)
