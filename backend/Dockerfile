FROM python:3.13-slim AS base

COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /uvx /bin/

# The venv lives outside /app so the dev bind mount of ./backend does not hide it.
ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# ---- dev: all dependency groups (tests, linters), code bind-mounted by compose ----
FROM base AS dev
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-install-project
COPY . .
EXPOSE 8000
# exec: uvicorn replaces the shell as PID 1, so `docker stop` (SIGTERM) reaches it.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"]

# ---- prod: runtime dependencies only, unprivileged user ----
FROM base AS prod
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-install-project --no-dev
COPY . .
RUN useradd --system --uid 10001 app && chown -R app /app
USER app
# The commit CI built this image from; /health reports it so a deploy can confirm what is live.
ARG APP_RELEASE=dev
ENV APP_RELEASE=${APP_RELEASE}
EXPOSE 8000
# One worker on purpose: the reminder scheduler, rate-limit counters and rest timers live in it.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --no-server-header"]
