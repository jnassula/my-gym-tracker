# myGymTracker — notes for Claude

Mobile-first gym tracker. FastAPI + Postgres + MinIO backend, React + shadcn frontend, all in Docker Compose. README.md has setup, commands and the auth design; this file holds the rules and the state of the work.

## Working rules (from the user)

- Work in phases. Finish one, show the result, **wait for "ok"** before starting the next.
- Small conventional commits per phase. Never push (the user pushes to `origin` on GitHub and rebases `main`). Work on a `feat/phase-N-*` branch created from `main`; list the phase's commits with `git log main..HEAD`.
- Write tests alongside the code. Run linters and tests before calling a phase done.
- Ask before adding dependencies outside the stack. Secrets only through env vars; never commit `.env`.
- At the end of each phase: update this file and give a 5-line summary (done, left out, decisions, how to test, next step).

Dependencies the user approved (2026-09-28): TanStack Router, react-hook-form + zod, Phosphor icons, PyJWT, pwdlib[argon2], slowapi, email-validator, Mailpit (dev SMTP), `minio` (S3 SDK) + python-multipart, and (2026-09-28, phase 3 rework) `google-adk[openai]` to read PDFs with DeepSeek, the only LLM provider the user has. pdfplumber is in the brief. Vitest/Testing Library/jsdom were added in phase 1 as test tooling. The user chose a "Mover para…" menu over drag-and-drop (no dnd-kit).

**Personal PDFs in `samples/` must never be committed** (they're in `.gitignore`); tests use the anonymised layout in `backend/tests/workouts/layout.py`.

## Commands

```bash
docker compose up --build                     # full stack (needs .env, copy from .env.example)
docker compose up --build -V frontend         # after package.json changes (renews node_modules volume)
docker compose exec backend pytest            # backend tests (own *_test DB, auto-created)
docker compose exec -e LLM_LIVE_TESTS=1 backend pytest -m llm   # real DeepSeek on samples/ (paid, minutes)
docker compose exec backend sh -c "ruff check . && ruff format --check . && mypy ."
docker compose exec backend alembic revision --autogenerate -m "..."
cd frontend && npm run lint && npm run typecheck && npm test && npm run build
```

Host ports (127.0.0.1): frontend 5173, backend 8200, Postgres 5440, MinIO 9100/9101 (bucket created on backend startup), Mailpit UI 8026. The defaults avoid ports other local projects already use (8000, 9000/9001, 5434, 8025).

## Backend conventions

- One folder per domain: `auth users workouts exercises logs files health`, each with `router.py`, `schemas.py`, `models.py`, `service.py`. Extra modules are fine when they have a clear job (`auth/security.py` pure crypto, `auth/dependencies.py`, `auth/errors.py`, `auth/emails.py`). **Routers hold no business logic**: they parse input, call a service function and return a schema. Cookies, rate-limit decorators and status codes are HTTP concerns and stay in routers.
- Protected endpoints take `user: CurrentUser` (`app/auth/dependencies.py`). Every query filters by `user.id`. A user never sees another user's data. Tables without `user_id` (`workout_days`, `exercises`) are scoped by joining through `workout_plans`.
- Errors: services raise `AppError` subclasses with a specific `code` (auth ones in `app/auth/errors.py`). Every error body is `{detail, code}`; validation errors add `errors[]` and never echo the input. The frontend translates by `code`, so add new codes to `errors.*` in the locales.
- Rate limits: `@limiter.limit("…")` (`app/core/rate_limit.py`); the endpoint needs a `request: Request` parameter. Tests reset the limiter automatically.
- Email: depend on `Mailer` (`get_mailer`) and send from `BackgroundTasks`. Tests get an in-memory `outbox` fixture.
- Object storage: depend on `Storage` (`get_storage`, `app/core/storage.py`; MinIO SDK in a thread). Tests get an in-memory `storage` fixture. Keys are `users/{user_id}/{kind}/{file_id}`; `files` rows record them. Uploads are read with a size cap (`files.service.read_upload`) and type-checked by bytes (`require_pdf`).
- PDF reading (`app/workouts/parser`) is done by an LLM, not by rules (the user's decision). `extract.py` turns the PDF into text with pdfplumber (in `asyncio.to_thread`), in two views: layout text (keeps each exercise on its rest time's line) plus table cells when the PDF draws a grid (the only reliable way to map the summary's focus to its weekday; layout mode squeezes those columns together); `agent.py` runs a Google ADK `LlmAgent` over it through ADK's `OpenAILlm` pointed at DeepSeek (`LLM_*` settings); `output.py` validates and bounds the JSON reply (pure). DeepSeek is text-only and only guarantees `json_object` mode, so the agent has no `output_schema`: the shape is in `prompt.py` and validated with Pydantic. Thinking must stay off (`effort="none"` via `_EffortConfig`): at any other effort a week's plan takes 90–120 s and runs out of tokens. The instruction is a callable so ADK doesn't template the JSON example's braces. Services get the reader through the `get_plan_parser` dependency; tests override it with `FakePlanParser` (conftest) and `test_agent.py` drives the real agent with a scripted `BaseLlm`. conftest removes `LLM_API_KEY` from the environment so no test calls the API by accident; only `-m llm` with `LLM_LIVE_TESTS=1` does.
- Relationships use `lazy="raise"`: load collections with `selectinload` (see `workouts.service.get_plan`).
- Models: UUID primary keys (`UUIDPrimaryKey`), `timestamptz` everywhere (UTC). Enums are `str_enum(E)` (VARCHAR) paired with `enum_check(col, E)` in `__table_args__`. Don't use `Enum(create_constraint=True)`: Alembic autogenerate duplicates its CHECK. Autogenerate also misses new CHECK constraints: add them by hand.
- Weights are always stored in kg; `users.unit` is display-only. Emails are stored lower-cased (CHECK enforced).
- Register new model modules in `app/models.py`, otherwise Alembic won't see them.
- `GET /health` (root) is the healthcheck. The Apple Health domain lives under `/api/health/*`.

## Frontend conventions

- Design: `design/README.md` (Nocturne on shadcn tokens). The canvas is `design/myGymTracker.dc.html`; it ends with a per-screen list of shadcn components. Follow it screen by screen.
- Use shadcn components (Base UI, `base-nova` style, `iconLibrary: phosphor`) whenever one exists: `npx shadcn@latest add <name>`. `src/components/ui/*` is generated. The only design-system edits are to `button.tsx` (variant `outline-primary`; sizes `touch` 48px, `hero` 52px, `icon-touch` 44px) and to `input.tsx`/`input-group.tsx` (h-12, `bg-card`). Re-apply these if a component is re-added with `--overwrite`. When `add` asks to overwrite `button.tsx`, answer **no** (`printf 'n\n' | npx shadcn@latest add <name>`).
- Generated shadcn controls are small (`SelectTrigger` h-8, menu items py-1): pass `h-12`/`min-h-11` at the call site. `DialogContent` has an English "Close" label: use `showCloseButton={false}` with a translated button.
- Extra tokens beyond shadcn's: `--warning` (low-confidence parse flags, from the design).
- When styling a `Link` as a button, wrap in `cn(buttonVariants(...))`: `buttonVariants` alone doesn't resolve Tailwind conflicts.
- No custom CSS outside the Tailwind/shadcn tokens in `src/index.css` without a stated reason. Icons from `@phosphor-icons/react`.
- Dark is the default theme (`next-themes`, key `mygymtracker-theme`; `class="dark"` preset in `index.html`).
- Touch targets ≥ 44px. Filled `primary` only for the one hero action per screen; other actions are `outline-primary`.
- **No hardcoded strings**: everything goes through i18next (`src/i18n/locales/{pt,en,es}.json`, keys typed from `pt.json`). A test enforces key parity across locales. Form error messages are translation keys (zod messages such as `validation.email`, server errors such as `errors.<code>`), translated at render.
- Routing: TanStack Router, file-based (`src/routes`, generated `routeTree.gen.ts` is committed). `_auth/*` is guest-only and `_app/*` needs a session. `reset-password` is unguarded because it is an email deep link.
- Auth client: the access token lives in memory only (`src/lib/auth/session.ts`). `api()` in `src/lib/api.ts` retries once after a single-flight refresh (Web Locks across tabs). Losing the session re-runs the route guards (`router.tsx`).
- Server state goes through TanStack Query. API calls use relative paths (`/api/...`); Vite proxies them to the backend (with `X-Forwarded-For` for rate limits).
- Tests: Vitest + Testing Library, co-located as `*.test.ts(x)`. Globals are off; cleanup and `pt` language are set in `src/test/setup.ts`. Use `renderWithRouter` (`src/test/render.tsx`) for components with Links.
- Muscle groups and weekdays are keys (`chest`, 0–6) translated via `useWorkoutLabels()` (`features/workouts/labels.ts`). Exercise names stay exactly as the PDF wrote them.
- The import review state is a pure reducer (`features/workouts/import-draft.ts`); keep editing rules there, with tests.
- Vite dev may show "Failed to fetch dynamically imported module" once after new deps are first imported (it re-optimises them): a reload fixes it.

## Data model

Migrations: `initial schema` (all tables), `auth password tracking and persistent sessions`, `files, plan source file and exercise rest`. Differences from the original brief:

- `workout_sessions` added: `health_samples.session_id` needed a target, and progress is aggregated per session.
- `exercise_logs.session_id` added (NOT NULL).
- `order` renamed to `position` (reserved word in SQL).
- `workout_days.weekday` is nullable for plans that rotate A/B/C instead of using weekdays.
- `exercises.reps` is text ("8-12", "10/8/6"); `sets`/`reps` are nullable because PDFs don't always include them.
- `refresh_tokens.family_id` (rotation with reuse detection) and `refresh_tokens.persistent` ("remember me").
- `users.password_changed_at`: access tokens issued earlier are rejected. JWT `iat` is a float for sub-second precision.
- Partial unique index: at most one active plan per user.
- No table for password-reset tokens: they are signed JWTs carrying a fingerprint of the password hash, so they become single-use once the password changes.
- `files` table (uploads exist before the plan they produce); `workout_plans.source_file_id` (FK, SET NULL) replaces `source_file_key`; `workout_plans.valid_until` ("Trocar até").
- `exercises.rest_seconds`/`rest_max_seconds` (the rest timer in phase 4 needs them) and `exercises.muscle_group` as a key enum.

## Phase status

- [x] **Phase 1: scaffold and infra.** Compose, `/health`, error format, full data model, shadcn dark theme.
- [x] **Phase 2: auth and users** (branch `feat/phase-2-auth`). Design imported (Nocturne theme, Inter, Phosphor). Backend: register/login/refresh/logout/forgot/reset/change password, `/users/me`, rate limits, Mailpit. Frontend: welcome, login, sign-up (strength meter), forgot/reset password, protected shell with bottom tabs, settings (change password, log out), i18n pt/en/es.
- [x] **Phase 3: PDF upload and parsing** (branch `feat/phase-3-pdf-import`). PDFs read by an LLM (DeepSeek `deepseek-flash`, thinking off, through a Google ADK agent): all 9 samples read in 10–16 s each, 506 exercises, day labels right, 1 flagged for manual sets. Storage in MinIO, import preview → review (edit/move/reorder/delete/add) → confirm, Treinos list, read-only plan detail.
- [ ] Phase 4: workout flow and weight logging
- [ ] Phase 5: progress and charts
- [ ] Phase 6: settings, i18n (language switcher, date formats), PWA
- [ ] Phase 7: Apple Health

## Open items

- Designed but not built: Apple/Google sign-in buttons (not in the brief), the terms checkbox at sign-up (no terms content exists), post-signup onboarding (3 steps), profile fields (body weight, height, photo), delete account.
- Hoje and Progresso show empty states until phases 4–5. The plan detail is read-only; phase 4 turns it into days → day → exercise screens.
- Uploads left behind by an abandoned review (the tab closed before confirming or cancelling) stay in MinIO. A cleanup of files not linked to any plan after N days is pending. Deleting an account doesn't delete its objects yet.
- Scanned PDFs are refused (`pdf_no_text`): DeepSeek can't read images. OCR (Tesseract) would need a new dependency.
- Designed but not built in phase 3: drag-and-drop reordering (replaced by the menu, as the user chose), renaming a whole muscle group, and the imported-PDFs management screen (phase 6).
- Frontend `Dockerfile` has only a `dev` target. The production build (nginx + PWA) comes in phase 6. In production, set `COOKIE_SECURE=true` (the default) and `FORWARDED_ALLOW_IPS` to the reverse proxy.
- Rate-limit counters are in-memory (single backend instance). Move them to Redis if the backend is ever scaled out.
