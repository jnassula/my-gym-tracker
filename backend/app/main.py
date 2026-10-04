import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded

from app.admin.router import router as admin_router
from app.auth.dependencies import client_key
from app.auth.router import router as auth_router
from app.body.router import router as body_router
from app.core import healthcheck
from app.core.body_limit import BodyLimitMiddleware
from app.core.config import Settings, get_settings
from app.core.db import SessionLocal, engine
from app.core.errors import ErrorResponse, register_exception_handlers
from app.core.no_store import NoStoreMiddleware
from app.core.rate_limit import GlobalRateLimit, limiter, rate_limit_exceeded_handler
from app.core.storage import ensure_bucket
from app.exercises.router import router as exercises_router
from app.files.router import router as files_router
from app.health import sweeper
from app.health.dependencies import MAX_BODY_BYTES
from app.health.router import router as health_router
from app.logs.router import router as logs_router
from app.notifications import scheduler
from app.notifications.router import router as notifications_router
from app.notifications.sender import get_push_sender
from app.progress.router import router as progress_router
from app.users.router import router as users_router
from app.users.service import MAX_AVATAR_BYTES
from app.workouts.router import router as workouts_router
from app.workouts.service import MAX_PDF_BYTES

DOMAIN_ROUTERS = (
    auth_router,
    users_router,
    workouts_router,
    exercises_router,
    logs_router,
    progress_router,
    notifications_router,
    files_router,
    health_router,
    body_router,
    admin_router,
)

API_PREFIX = "/api/"
# Per client (the account, or the address when signed out), over every endpoint together.
GLOBAL_LIMIT = "300/minute"

# What a request body may weigh: small JSON, except where a route takes a file or a batch.
# Uploads get room for the multipart framing around the file their service accepts.
DEFAULT_BODY_BYTES = 256 * 1024
_MB = 1024 * 1024
BODY_LIMITS = {
    ("POST", "/api/workouts/import"): MAX_PDF_BYTES + _MB,
    ("POST", "/api/workouts"): 2 * _MB,  # a week of days, each exercise with its notes
    ("PUT", "/api/users/me/avatar"): MAX_AVATAR_BYTES + _MB,
    ("POST", "/api/health/sync"): MAX_BODY_BYTES,
}


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await ensure_bucket()
    sender = get_push_sender()
    background = [asyncio.create_task(sweeper.run_forever(SessionLocal))]
    if sender.public_key is not None:
        background.append(asyncio.create_task(scheduler.run_forever(SessionLocal, sender)))
    yield
    for task in background:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
    await engine.dispose()


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=settings.log_level)

    # The API's description is for whoever develops it: the live site doesn't hand it out.
    docs = settings.environment != "production"
    app = FastAPI(
        title="myGymTracker API",
        version=settings.app_version,
        lifespan=lifespan,
        responses={"default": {"model": ErrorResponse}},
        docs_url="/docs" if docs else None,
        redoc_url="/redoc" if docs else None,
        openapi_url="/openapi.json" if docs else None,
    )
    register_exception_handlers(app)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

    # The last one added runs first: a client over its limit is turned away before its body
    # is counted, and every answer of the API, these refusals included, says not to keep it.
    app.add_middleware(BodyLimitMiddleware, default=DEFAULT_BODY_BYTES, limits=BODY_LIMITS)
    app.add_middleware(GlobalRateLimit, limit=GLOBAL_LIMIT, prefix=API_PREFIX, key=client_key)
    app.add_middleware(NoStoreMiddleware, prefix=API_PREFIX)
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(healthcheck.router)
    api = APIRouter(prefix=API_PREFIX.rstrip("/"))
    for router in DOMAIN_ROUTERS:
        api.include_router(router)
    app.include_router(api)
    return app


app = create_app()
