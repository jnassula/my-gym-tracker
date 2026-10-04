import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Response

from app.auth.dependencies import CurrentUser
from app.core.db import SessionDep
from app.core.storage import Storage, get_storage
from app.demos import service
from app.demos.schemas import DemoRead

router = APIRouter(prefix="/demos", tags=["demos"])

StorageDep = Annotated[Storage, Depends(get_storage)]
DemoId = Annotated[str, Path(pattern=r"^[A-Za-z0-9]{4,32}$")]


@router.get("/exercises/{exercise_id}")
async def exercise_demo(
    exercise_id: uuid.UUID, user: CurrentUser, session: SessionDep
) -> DemoRead | None:
    """The animation that shows one of the user's exercises; null when it has none (yet: a new
    plan's exercises are linked within a minute)."""
    demo = await service.demo_of(session, user, exercise_id)
    return DemoRead.model_validate(demo) if demo else None


@router.get("/{demo_id}.gif")
async def demo_gif(
    demo_id: DemoId, _: CurrentUser, session: SessionDep, storage: StorageDep
) -> Response:
    """An animation's bytes. The same for everyone and never changing: the browser may keep it."""
    return Response(
        content=await service.read_gif(session, storage, demo_id),
        media_type=service.GIF_TYPE,
        headers={"Cache-Control": "private, max-age=31536000, immutable"},
    )
