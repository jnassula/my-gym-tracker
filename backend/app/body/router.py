import uuid

from fastapi import APIRouter, status

from app.auth.dependencies import CurrentUser
from app.body import service
from app.body.schemas import BodyOverview, MeasurementCreate, MeasurementRead
from app.core.db import SessionDep
from app.progress.schemas import Range

router = APIRouter(prefix="/body", tags=["body"])


@router.get("")
async def overview(user: CurrentUser, session: SessionDep, range: Range = "3m") -> BodyOverview:
    """The latest weighing, the weight over the range (a point per day, per week over a year)
    and the range's weighings."""
    return await service.overview(session, user, range)


@router.post("/measurements", status_code=status.HTTP_201_CREATED)
async def add(body: MeasurementCreate, user: CurrentUser, session: SessionDep) -> MeasurementRead:
    """A weighing, typed in or read from the scale."""
    return await service.add(session, user, body)


@router.delete("/measurements/{measurement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove(measurement_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> None:
    await service.remove(session, user, measurement_id)
