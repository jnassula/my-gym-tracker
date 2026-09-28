import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded

from app import __version__
from app.auth.router import router as auth_router
from app.core import healthcheck
from app.core.config import get_settings
from app.core.db import engine
from app.core.errors import ErrorResponse, register_exception_handlers
from app.core.rate_limit import limiter, rate_limit_exceeded_handler
from app.core.storage import ensure_bucket
from app.exercises.router import router as exercises_router
from app.files.router import router as files_router
from app.health.router import router as health_router
from app.logs.router import router as logs_router
from app.users.router import router as users_router
from app.workouts.router import router as workouts_router

DOMAIN_ROUTERS = (
    auth_router,
    users_router,
    workouts_router,
    exercises_router,
    logs_router,
    files_router,
    health_router,
)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await ensure_bucket()
    yield
    await engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    logging.basicConfig(level=settings.log_level)

    app = FastAPI(
        title="myGymTracker API",
        version=__version__,
        lifespan=lifespan,
        responses={"default": {"model": ErrorResponse}},
    )
    register_exception_handlers(app)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(healthcheck.router)
    api = APIRouter(prefix="/api")
    for router in DOMAIN_ROUTERS:
        api.include_router(router)
    app.include_router(api)
    return app


app = create_app()
