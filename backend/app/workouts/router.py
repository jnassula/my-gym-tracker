import uuid
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile, status
from limits import parse

from app.auth.dependencies import CurrentUser, client_key
from app.core.config import get_settings
from app.core.db import SessionDep
from app.core.rate_limit import limiter
from app.core.storage import Storage, get_storage
from app.workouts import service
from app.workouts.errors import ImportBudgetReachedError
from app.workouts.parser import PlanParser, get_plan_parser
from app.workouts.schemas import ImportPreview, PlanCreate, PlanRead, PlanSummary, PlanUpdate

router = APIRouter(prefix="/workouts", tags=["workouts"])

StorageDep = Annotated[Storage, Depends(get_storage)]
ParserDep = Annotated[PlanParser, Depends(get_plan_parser)]


def _spend_daily_import() -> None:
    """Every import is a paid call to the LLM: a ceiling for all accounts together, counted
    only once the caller's own limits let the request through."""
    budget = get_settings().llm_daily_imports
    if budget and limiter.enabled and not limiter.limiter.hit(parse(f"{budget}/day"), "imports"):
        raise ImportBudgetReachedError


@router.post("/import")
@limiter.limit("30/hour")
@limiter.limit("20/day", key_func=client_key)
async def import_files(
    request: Request,
    *,
    user: CurrentUser,
    session: SessionDep,
    storage: StorageDep,
    parser: ParserDep,
    file: Annotated[UploadFile | None, File(description="Workout plan PDF, up to 20 MB")] = None,
    files: Annotated[
        list[UploadFile], File(description="Photos of printed sheets (JPEG, PNG, WebP) or a PDF")
    ] = [],  # noqa: B006  # FastAPI reads the default; nothing mutates it
) -> ImportPreview:
    """Upload a plan and get the structure the LLM read, for review before saving.

    ``file`` is the single PDF older apps send; ``files`` takes a PDF or up to 10 photos.
    """
    _spend_daily_import()
    uploads = ([file] if file is not None else []) + files
    return await service.import_files(session, storage, parser, user.id, uploads)


@router.post("", status_code=status.HTTP_201_CREATED)
@limiter.limit("30/hour", key_func=client_key)
async def create_plan(
    request: Request, body: PlanCreate, user: CurrentUser, session: SessionDep
) -> PlanRead:
    return PlanRead.model_validate(await service.create_plan(session, user.id, body))


@router.get("")
async def list_plans(user: CurrentUser, session: SessionDep) -> list[PlanSummary]:
    return await service.list_plans(session, user.id)


@router.get("/{plan_id}")
async def get_plan(plan_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> PlanRead:
    return PlanRead.model_validate(await service.get_plan(session, user.id, plan_id))


@router.get("/{plan_id}/export.pdf")
@limiter.limit("20/minute", key_func=client_key)
async def export_plan(
    request: Request,
    plan_id: uuid.UUID,
    user: CurrentUser,
    session: SessionDep,
    weights: bool = False,
) -> Response:
    """The plan as an A4 PDF in the trainer's format; ``weights`` adds the last logged weights."""
    data, filename = await service.export_pdf(session, user, plan_id, include_weights=weights)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


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
