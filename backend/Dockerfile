# Base images by digest: a tag can be moved to other content, a digest can't. Dependabot
# updates both.
FROM python:3.13-slim@sha256:3dd7cc108ec1493442514f5c2a871af6af0ec31d768ff6e378a93340c3b3db5f AS base

COPY --from=ghcr.io/astral-sh/uv:0.11@sha256:77280f2f771df71f90786c314fe1bbc1e023feac652969bbf139c280babf2eb7 /uv /uvx /bin/

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
# deploy.sh prunes old releases by this label, and nothing else on the server.
LABEL mygymtracker.image=backend
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-install-project --no-dev
COPY . .
# The running app installs nothing: the installer stays out of its reach.
RUN useradd --system --uid 10001 app && chown -R app /app && rm /bin/uv /bin/uvx
USER app
# The commit CI built this image from and its version (deploy/version.sh); /health reports them
# so a deploy can confirm what is live.
ARG APP_RELEASE=dev
ARG APP_VERSION=dev
ENV APP_RELEASE=${APP_RELEASE} APP_VERSION=${APP_VERSION}
EXPOSE 8000
# One worker on purpose: the reminder scheduler, rate-limit counters and rest timers live in it.
# No access log: nginx keeps one, without the query strings this one would write.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --no-server-header --no-access-log"]
