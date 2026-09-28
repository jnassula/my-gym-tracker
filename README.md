# myGymTracker

App mobile-first para registar treinos de ginásio: importa o plano a partir de um PDF, regista peso × repetições por série, mostra a evolução em gráficos e cruza as sessões com dados do Apple Health.

| Camada | Tecnologia |
| --- | --- |
| Backend | Python 3.13, FastAPI, SQLAlchemy 2 (async) + asyncpg, Alembic, Pydantic v2 |
| Base de dados | PostgreSQL 17 |
| Ficheiros | MinIO (compatível com S3), SDK `minio` |
| PDF | pdfplumber + regras próprias (`backend/app/workouts/parser`) |
| Frontend | React 19, Vite 8, TypeScript, Tailwind CSS 4, shadcn/ui (Base UI), TanStack Router + Query, react-hook-form + zod, i18next (pt/en/es) |
| Autenticação | JWT (PyJWT) + refresh token rotativo, Argon2id (pwdlib), rate limit (slowapi) |
| Testes | pytest + pytest-asyncio (backend), Vitest + Testing Library (frontend) |
| Qualidade | ruff + mypy `--strict` (backend), oxlint + `tsc` (frontend) |

## Arranque rápido

Requisitos: Docker com Compose v2.

```bash
cp .env.example .env        # ajusta passwords/portas e gera um JWT_SECRET
docker compose up --build
```

Depois de mudar dependências do frontend (`package.json`), recria o volume de `node_modules` do contentor: `docker compose up --build -V frontend`.

| Serviço | URL |
| --- | --- |
| App (frontend) | http://localhost:5173 |
| API: healthcheck | http://localhost:8200/health |
| API: documentação OpenAPI | http://localhost:8200/docs |
| Consola MinIO | http://localhost:9101 (credenciais `MINIO_ROOT_*` do `.env`) |
| Mailpit (emails de desenvolvimento) | http://localhost:8026 |
| Postgres | `localhost:5440` |

Todas as portas publicadas ficam em `127.0.0.1` e podem ser mudadas no `.env` (`FRONTEND_PORT`, `BACKEND_PORT`, `POSTGRES_PORT`, `MINIO_API_PORT`, `MINIO_CONSOLE_PORT`, `MAILPIT_UI_PORT`).

O backend corre `alembic upgrade head` ao arrancar e recarrega com as alterações ao código (`--reload`). O frontend usa o dev server do Vite com HMR e faz proxy de `/api` e `/health` para o backend: o browser fala sempre com a mesma origem, por isso não há CORS e o cookie do refresh token fica first-party.

`GET /health` devolve `200 {"status": "ok", ...}` com a base de dados acessível e `503 {"status": "degraded", "database": "unavailable"}` quando não está.

## Autenticação

- **Access token** (JWT, 15 min): vai no corpo das respostas de login/registo/refresh. O frontend guarda-o só em memória e envia-o como `Authorization: Bearer`.
- **Refresh token** (opaco, 7 dias): vai num cookie `httpOnly`, `SameSite=Lax`, com `Path=/api/auth`. Na base de dados só fica o hash. Cada refresh roda o token; se um token já rodado voltar a aparecer, toda a família é revogada (deteção de roubo). "Lembrar-me" desligado = cookie de sessão.
- **Mudar ou recuperar a palavra-passe** revoga os access tokens emitidos antes (`password_changed_at`) e termina as outras sessões. O link de recuperação expira em 30 minutos, só serve uma vez e leva o token no fragmento (`#token=…`), que nunca chega aos logs do servidor.
- **Rate limit** por IP nos endpoints de auth: devolve `429 {"code": "rate_limited"}` com `Retry-After`. Os contadores ficam em memória, o que chega para uma instância. Atrás de um proxy, define `FORWARDED_ALLOW_IPS` com o IP do proxy.
- Os routers protegidos usam a dependência `CurrentUser` (`app/auth/dependencies.py`).

| Endpoint | |
| --- | --- |
| `POST /api/auth/register` | cria a conta e inicia a sessão |
| `POST /api/auth/login` | `{email, password, remember}` |
| `POST /api/auth/refresh` | usa o cookie; roda o refresh token |
| `POST /api/auth/logout` | revoga a sessão e apaga o cookie |
| `POST /api/auth/forgot-password` | responde sempre 202 (não revela se a conta existe) |
| `POST /api/auth/reset-password/check` | valida o link e devolve o email |
| `POST /api/auth/reset-password` | define a nova palavra-passe e inicia a sessão |
| `POST /api/auth/change-password` | autenticado; devolve um access token novo |
| `GET /api/users/me` | autenticado |

Em desenvolvimento, os emails de recuperação aparecem no Mailpit (http://localhost:8026).

## Importar um plano em PDF

1. **Upload** (`POST /api/workouts/import`, multipart, até 20 MB). O ficheiro passa pela API em vez de ir por URL presigned: o backend precisa dos bytes na hora para o parse, valida o tipo pelos bytes (`%PDF-`) e o tamanho antes de guardar, e o MinIO fica privado (sem CORS, sem endpoint público). Com PDFs deste tamanho, o custo de passar pela API é irrelevante. Só são guardados no MinIO os PDFs que o parser consegue ler.
2. **Pré-visualização**: a resposta traz a estrutura que o parser entendeu (dias → exercícios com grupo muscular, séries, reps e descanso), com avisos quando algo merece revisão: técnicas como drop set ou rest pause, exercícios combinados ou alternativos, séries em falta, grupo desconhecido.
3. **Revisão** no ecrã: renomear o plano, editar exercícios, "Mover para…" outro dia ou grupo, reordenar, apagar e adicionar.
4. **Confirmação** (`POST /api/workouts`) grava o plano e, por defeito, torna-o o plano ativo. Cancelar apaga o upload (`DELETE /api/files/{id}`).

O parser tem duas camadas:

- **Extração** (`parser/extract.py`): pdfplumber → linhas com a posição de cada palavra.
- **Interpretação** (`parser/parse.py`, `prescription.py`, `muscle_groups.py`): funções puras, das linhas para o plano. Usa a coluna "Tempo de intervalo" para o descanso, as colunas do resumo para o foco de cada dia, o bloco "Aquecimento" (mostrado primeiro) e os dias `DayOff`.

Os erros têm códigos próprios: `pdf_no_text` (PDF digitalizado), `pdf_no_structure`, `pdf_unreadable`, `file_too_large` e `unsupported_file_type`.

Os PDFs pessoais em `samples/` **não são commitados** (estão no `.gitignore`). Os testes do parser usam um layout anonimizado (`backend/tests/workouts/layout.py`), que também é convertido num PDF real. Os testes com os samples (`test_sample_pdfs.py`) correm quando os ficheiros existem e são ignorados quando não existem.

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
    core/           config, sessão de BD, formato de erros, healthcheck, email, rate limit
    auth/ users/ workouts/ exercises/ logs/ files/ health/
                    um domínio por pasta: router.py, schemas.py, models.py, service.py
    models.py       regista todos os modelos (Alembic e testes)
    main.py         app FastAPI; os routers dos domínios ficam em /api
  alembic/          migrações
  tests/
frontend/
  src/
    routes/         rotas (TanStack Router, file-based); _auth = só visitantes, _app = autenticado
    features/       código por funcionalidade (auth, workouts: import, revisão, planos)
    components/ui/  componentes shadcn (gerados pela CLI; ajustes do design notados em CLAUDE.md)
    components/     componentes partilhados (shell da app, logótipo)
    lib/            cliente da API e sessão em memória
    i18n/           i18next + traduções pt/en/es
design/             referência do design (canvas do Claude Design + resumo do Nocturne)
samples/            PDFs pessoais de exemplo (locais, não commitados)
```

Todos os erros da API têm o formato `{"detail": str, "code": str}`; os erros de validação acrescentam `errors: [{loc, msg, type}]` e nunca devolvem o valor enviado.
