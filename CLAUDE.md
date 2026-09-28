# myGymTracker — notes for Claude

Mobile-first gym tracker. FastAPI + Postgres + MinIO backend, React + shadcn frontend, all in Docker Compose. README.md has setup and commands; this file holds the rules and the state of the work.

## Working rules (from the user)

- Work in phases. Finish one, show the result, **wait for "ok"** before starting the next.
- Small conventional commits per phase. Never push. Work on a `feat/phase-N-*` branch.
- Write tests alongside the code. Run linters and tests before calling a phase done.
- Ask before adding dependencies outside the stack. Secrets only through env vars; never commit `.env`.
- At the end of each phase: update this file and give a 5-line summary (done, left out, decisions, how to test, next step).

## Commands

```bash
docker compose up --build                     # full stack (needs .env, copy from .env.example)
docker compose exec backend pytest            # backend tests (own *_test DB, auto-created)
docker compose exec backend sh -c "ruff check . && ruff format --check . && mypy ."
docker compose exec backend alembic revision --autogenerate -m "..."
cd frontend && npm run lint && npm run typecheck && npm test && npm run build
```

Host ports (127.0.0.1): frontend 5173, backend 8200, Postgres 5440, MinIO 9100/9101. The defaults avoid ports other local projects already use (8000, 9000/9001, 5434).

## Backend conventions

- One folder per domain: `auth users workouts exercises logs files health`, each with `router.py`, `schemas.py`, `models.py`, `service.py`. **Routers hold no business logic**: they parse input, call a service function and return a schema.
- Every query filters by the `user_id` from the token. A user never sees another user's data. Tables without `user_id` (`workout_days`, `exercises`) are scoped by joining through `workout_plans`.
- Errors: services raise `AppError` subclasses (`app/core/errors.py`) with a specific `code`. Every error body is `{detail, code}`; validation errors add `errors[]` and never echo the input.
- Models: UUID primary keys (`UUIDPrimaryKey`), `timestamptz` everywhere (UTC). Enums are `str_enum(E)` (VARCHAR) paired with `enum_check(col, E)` in `__table_args__`. Don't use `Enum(create_constraint=True)`: Alembic autogenerate duplicates its CHECK.
- Weights are always stored in kg; `users.unit` is display-only.
- Register new model modules in `app/models.py`, otherwise Alembic won't see them.
- `GET /health` (root) is the healthcheck. The Apple Health domain lives under `/api/health/*`.

## Frontend conventions

- Use shadcn components (Base UI flavour, `base-nova` style) whenever one exists: `npx shadcn@latest add <name>`. Don't hand-edit `src/components/ui/*`.
- No custom CSS outside the Tailwind/shadcn tokens in `src/index.css` without a stated reason.
- Dark theme is the default (`class="dark"` on `<html>` plus `ThemeProvider`, key `mygymtracker-theme`).
- Touch targets ≥ 44px (`size-11` / `h-11`).
- Server state goes through TanStack Query. API calls use relative paths (`/api/...`); Vite proxies them to the backend.
- Tests: Vitest + Testing Library, co-located as `*.test.tsx`. Globals are off; cleanup is registered in `src/test/setup.ts`.
- Strings are temporarily hardcoded in PT. i18next arrives with i18n (phase 6, possibly earlier: see "Next").

## Data model

Initial migration: `users`, `refresh_tokens`, `workout_plans`, `workout_days`, `exercises`, `workout_sessions`, `exercise_logs`, `health_samples`. Differences from the original brief:
- `workout_sessions` added: `health_samples.session_id` needed a target, and progress is aggregated per session.
- `exercise_logs.session_id` added (NOT NULL).
- `order` renamed to `position` (reserved word in SQL).
- `workout_days.weekday` is nullable for plans that rotate A/B/C instead of using weekdays.
- `exercises.reps` is text ("8-12", "10/8/6"); `sets`/`reps` are nullable because PDFs don't always include them.
- `refresh_tokens.family_id` added for rotation with reuse detection.
- Partial unique index: at most one active plan per user.

## Phase status

- [x] **Phase 1: scaffold and infra.** Compose (db, minio, backend, frontend), `/health`, error format, full data model with initial migration, shadcn with dark theme, tests and linters green.
- [ ] Phase 2: auth and users
- [ ] Phase 3: PDF upload and parsing (needs the sample PDF in `samples/`)
- [ ] Phase 4: workout flow and weight logging
- [ ] Phase 5: progress and charts
- [ ] Phase 6: settings, i18n, PWA
- [ ] Phase 7: Apple Health

## Open items

- The Claude Design project (`myGymTracker.dc.html`, `support.js`) has **not** been imported yet: DesignSync needs `/design-login` from an interactive session. The visual tokens are still shadcn defaults (neutral); apply the design before building real screens.
- MinIO runs, but the backend doesn't use it yet. The bucket and S3 settings arrive in phase 3.
- Frontend `Dockerfile` has only a `dev` target. The production build (nginx + PWA) comes in phase 6.
