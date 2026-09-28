import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Request, UploadFile, status

from app.auth.dependencies import CurrentUser
from app.core.db import SessionDep
from app.core.rate_limit import limiter
from app.core.storage import Storage, get_storage
from app.workouts import service
from app.workouts.parser import PlanParser, get_plan_parser
from app.workouts.schemas import ImportPreview, PlanCreate, PlanRead, PlanSummary, PlanUpdate

router = APIRouter(prefix="/workouts", tags=["workouts"])

StorageDep = Annotated[Storage, Depends(get_storage)]
ParserDep = Annotated[PlanParser, Depends(get_plan_parser)]


@router.post("/import")
@limiter.limit("30/hour")
async def import_pdf(
    request: Request,
    *,
    user: CurrentUser,
    session: SessionDep,
    storage: StorageDep,
    parser: ParserDep,
    file: Annotated[UploadFile, File(description="Workout plan PDF, up to 20 MB")],
) -> ImportPreview:
    """Upload a PDF and get the structure the LLM read from it, for review before saving."""
    return await service.import_pdf(session, storage, parser, user.id, file)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_plan(body: PlanCreate, user: CurrentUser, session: SessionDep) -> PlanRead:
    return PlanRead.model_validate(await service.create_plan(session, user.id, body))


@router.get("")
async def list_plans(user: CurrentUser, session: SessionDep) -> list[PlanSummary]:
    return await service.list_plans(session, user.id)


@router.get("/{plan_id}")
async def get_plan(plan_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> PlanRead:
    return PlanRead.model_validate(await service.get_plan(session, user.id, plan_id))


@router.patch("/{plan_id}")
async def update_plan(
    plan_id: uuid.UUID, body: PlanUpdate, user: CurrentUser, session: SessionDep
) -> PlanRead:
    """Rename, activate (the previous active plan stops being active) or deactivate."""
    return PlanRead.model_validate(await service.update_plan(session, user.id, plan_id, body))


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_plan(
    plan_id: uuid.UUID, user: CurrentUser, session: SessionDep, storage: StorageDep
) -> None:
    """Remove the plan and its PDF. Weights logged on its exercises stay in the history."""
    await service.delete_plan(session, storage, user.id, plan_id)
