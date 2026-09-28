# myGymTracker

App mobile-first para registar treinos de ginásio: importa o plano a partir de um PDF, regista peso × repetições por série, mostra a evolução em gráficos e cruza as sessões com dados do Apple Health.

| Camada | Tecnologia |
| --- | --- |
| Backend | Python 3.13, FastAPI, SQLAlchemy 2 (async) + asyncpg, Alembic, Pydantic v2 |
| Base de dados | PostgreSQL 17 |
| Ficheiros | MinIO (compatível com S3) |
| Frontend | React 19, Vite 8, TypeScript, Tailwind CSS 4, shadcn/ui (Base UI), TanStack Query |
| Testes | pytest + pytest-asyncio (backend), Vitest + Testing Library (frontend) |
| Qualidade | ruff + mypy `--strict` (backend), oxlint + `tsc` (frontend) |

## Arranque rápido

Requisitos: Docker com Compose v2.

```bash
cp .env.example .env        # ajusta passwords/portas se quiseres
docker compose up --build
```

| Serviço | URL |
| --- | --- |
| App (frontend) | http://localhost:5173 |
| API: healthcheck | http://localhost:8200/health |
| API: documentação OpenAPI | http://localhost:8200/docs |
| Consola MinIO | http://localhost:9101 (credenciais `MINIO_ROOT_*` do `.env`) |
| Postgres | `localhost:5440` |

Todas as portas publicadas ficam em `127.0.0.1` e podem ser mudadas no `.env` (`FRONTEND_PORT`, `BACKEND_PORT`, `POSTGRES_PORT`, `MINIO_API_PORT`, `MINIO_CONSOLE_PORT`).

O backend corre `alembic upgrade head` ao arrancar e recarrega com as alterações ao código (`--reload`). O frontend usa o dev server do Vite com HMR e faz proxy de `/api` e `/health` para o backend: o browser fala sempre com a mesma origem, por isso não há CORS e o cookie do refresh token fica first-party.

`GET /health` devolve `200 {"status": "ok", ...}` com a base de dados acessível e `503 {"status": "degraded", "database": "unavailable"}` quando não está.

## Testes e linters

Com a stack a correr:

```bash
# Backend
docker compose exec backend pytest
docker compose exec backend ruff check .
docker compose exec backend ruff format --check .
docker compose exec backend mypy .

# Frontend
docker compose exec frontend npm run lint
docker compose exec frontend npm run typecheck
docker compose exec frontend npm test
```

Os testes do backend usam uma base de dados própria, `<POSTGRES_DB>_test`: é criada automaticamente, reconstruída a partir das migrações em cada execução, e cada teste corre numa transação que é revertida no fim.

Para correr fora do Docker (precisa de [uv](https://docs.astral.sh/uv/) e Node 24):

```bash
cd backend
export DATABASE_URL=postgresql+asyncpg://gym:change-me-postgres@localhost:5440/mygymtracker
uv run pytest

cd ../frontend
npm ci && npm test
```

## Migrações

```bash
# Depois de alterar um models.py
docker compose exec backend alembic revision --autogenerate -m "descrição curta"
docker compose exec backend alembic upgrade head
```

Revê sempre o ficheiro gerado em `backend/alembic/versions/`. O teste `test_migrations_match_models` falha se um modelo mudar sem a revisão correspondente.

## Estrutura

```
backend/
  app/
    core/           config, sessão de BD, formato de erros, healthcheck
    auth/ users/ workouts/ exercises/ logs/ files/ health/
                    um domínio por pasta: router.py, schemas.py, models.py, service.py
    models.py       regista todos os modelos (Alembic e testes)
    main.py         app FastAPI; os routers dos domínios ficam em /api
  alembic/          migrações
  tests/
frontend/
  src/
    components/ui/  componentes shadcn (gerados pela CLI; não editar à mão)
    components/     componentes partilhados (tema, ...)
    features/       código por funcionalidade
samples/            PDFs de exemplo para os testes do parser
```

Todos os erros da API têm o formato `{"detail": str, "code": str}`; os erros de validação acrescentam `errors: [{loc, msg, type}]` e nunca devolvem o valor enviado.
