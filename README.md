# myGymTracker

App mobile-first para registar treinos de ginásio: importa o plano a partir de um PDF, regista peso × repetições por série, mostra a evolução em gráficos e cruza as sessões com dados do Apple Health.

| Camada | Tecnologia |
| --- | --- |
| Backend | Python 3.13, FastAPI, SQLAlchemy 2 (async) + asyncpg, Alembic, Pydantic v2 |
| Base de dados | PostgreSQL 17 |
| Ficheiros | MinIO (compatível com S3), SDK `minio` |
| PDF | pdfplumber (texto) + agente LLM com Google ADK, DeepSeek por omissão (`backend/app/workouts/parser`) |
| Frontend | React 19, Vite 8, TypeScript, Tailwind CSS 4, shadcn/ui (Base UI), TanStack Router + Query, react-hook-form + zod, i18next (pt/en/es), Recharts (gráficos), vite-plugin-pwa (Workbox) |
| Notificações | Web Push com VAPID (pywebpush) |
| Produção | nginx a servir o build do frontend (`docker-compose.prod.yml`) |
| Autenticação | JWT (PyJWT) + refresh token rotativo, Argon2id (pwdlib), rate limit (slowapi) |
| Testes | pytest + pytest-asyncio (backend), Vitest + Testing Library (frontend) |
| Qualidade | ruff + mypy `--strict` (backend), oxlint + `tsc` (frontend) |

## Arranque rápido

Requisitos: Docker com Compose v2.

```bash
cp .env.example .env        # ajusta passwords/portas, gera um JWT_SECRET e põe a LLM_API_KEY
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

1. **Upload** (`POST /api/workouts/import`, multipart, até 20 MB). O ficheiro passa pela API em vez de ir por URL presigned: o backend precisa dos bytes na hora para a leitura, valida o tipo pelos bytes (`%PDF-`) e o tamanho antes de guardar, e o MinIO fica privado (sem CORS, sem endpoint público). Com PDFs deste tamanho, o custo de passar pela API é irrelevante. Só são guardados no MinIO os PDFs que foram lidos com sucesso.
2. **Pré-visualização**: a resposta traz a estrutura que o LLM leu (dias → exercícios com grupo muscular, séries, reps e descanso), com avisos quando algo merece revisão: técnicas como drop set ou rest pause, exercícios combinados ou alternativos, séries em falta, grupo desconhecido.
3. **Revisão** no ecrã: renomear o plano, editar exercícios, "Mover para…" outro dia ou grupo, reordenar, apagar e adicionar.
4. **Confirmação** (`POST /api/workouts`) grava o plano e, por defeito, torna-o o plano ativo. Cancelar apaga o upload (`DELETE /api/files/{id}`).

A leitura tem três passos (`backend/app/workouts/parser`):

- **Extração** (`extract.py`): o pdfplumber tira o texto do PDF localmente, em duas vistas do mesmo conteúdo. O texto da página com o layout preservado mantém cada exercício na mesma linha do seu descanso. As células das tabelas, quando o PDF desenha uma grelha (como os exportados de folhas de cálculo), dizem sem ambiguidade que foco fica debaixo de que dia no resumo; no texto da página essas colunas ficam coladas. Um PDF sem texto (digitalizado) para aqui com `pdf_no_text`: o DeepSeek só lê texto.
- **Agente** (`agent.py`, `prompt.py`): um `LlmAgent` do [Google ADK](https://google.github.io/adk-docs/) recebe o texto e devolve JSON com dias, exercícios, grupo muscular, séries, reps, descanso e avisos. O modelo é chamado através do `OpenAILlm` do ADK, que fala com qualquer API compatível com a da OpenAI; por omissão aponta para o DeepSeek. O raciocínio do modelo fica desligado (`reasoning_effort: none`): ligado, mesmo no mínimo, um plano de uma semana demorava 90–120 s e esgotava o limite de tokens; desligado, demora 10–16 s e lê igual. Cada importação corre numa sessão nova, apagada no fim, e uma resposta que não seja JSON válido tem uma segunda tentativa.
- **Normalização** (`output.py`): função pura que valida a resposta e a limita ao que a pré-visualização aceita (grupos conhecidos, cada dia da semana uma só vez, tamanhos máximos, descanso mín ≤ máx). Os avisos "sem séries" e "grupo desconhecido" são calculados aqui; os de técnica, exercício combinado e alternativa vêm do modelo.

Configuração no `.env`: `LLM_API_KEY` (obrigatória para importar; sem ela a app funciona, mas a importação responde `503`), `LLM_BASE_URL` (`https://api.deepseek.com`) e `LLM_MODEL` (`deepseek-flash`; a conta também tem `deepseek-v4-pro`). **O texto do PDF é enviado ao fornecedor do LLM**, incluindo o nome do aluno que aparece no cabeçalho.

Os erros têm códigos próprios: `pdf_no_text` (PDF digitalizado), `pdf_no_structure` (não é um plano de treino), `pdf_unreadable`, `pdf_reader_unavailable` (`503`: o LLM falhou, excedeu o tempo ou não está configurado), `file_too_large` e `unsupported_file_type`.

Os PDFs pessoais em `samples/` **não são commitados** (estão no `.gitignore`). Os testes normais nunca chamam o LLM: usam um modelo com respostas pré-definidas e um layout anonimizado (`backend/tests/workouts/layout.py`), que também é convertido num PDF real. Os testes com o LLM real sobre os samples (`test_sample_pdfs.py`) são opcionais, porque custam dinheiro e demoram minutos:

```bash
docker compose exec -e LLM_LIVE_TESTS=1 backend pytest -m llm
```

## Treinar e registar cargas

- **Hoje** abre logo o dia de hoje do plano ativo (pelo fuso horário do utilizador). Num dia sem treino mostra o próximo; sem plano, convida a importar um PDF.
- **Treinos → plano** mostra a semana: cada dia com a data, o foco e o que já foi feito.
- **Dia**: exercícios por grupo muscular, séries feitas/planeadas e a carga da última vez. Os aquecimentos (e qualquer exercício) podem ser marcados como feitos sem registar séries. "Terminar treino" fecha a sessão e mostra o resumo: séries, volume, duração e recordes pessoais.
- **Exercício**: a carga começa na da última vez e as reps no que o plano prescreve para a série seguinte. Os botões +5 … +25 (ou −, com "− diminuir") ajustam a carga, e "Registar série" abre uma folha para afinar (±2,5 e ±1) e confirmar. Confirmar arranca o descanso do plano (90 s se o plano não tiver) com ±15 s, pausa e saltar, e o telemóvel vibra no fim. Tocar numa série registada permite corrigi-la ou apagá-la.

Uma sessão é um dia do plano treinado numa data (a data local do utilizador): começa com a primeira série registada, "Terminar treino" fecha-a e uma série registada depois reabre-a. As cargas são guardadas sempre em kg; quem usa lb vê e escreve libras. O histórico de um exercício continua no plano seguinte quando o nome e o grupo muscular coincidem.

| Endpoint | |
| --- | --- |
| `GET /api/logs/days/{day_id}` | sessão de hoje desse dia e a última vez de cada exercício |
| `GET /api/logs/plans/{plan_id}/week` | a semana atual (segunda a domingo) do plano |
| `POST /api/logs/exercises/{id}/sets` | `{weight, reps}` (kg); a primeira do dia cria a sessão |
| `PUT`/`DELETE /api/logs/exercises/{id}/done` | marcar/desmarcar como feito sem séries |
| `GET /api/logs/exercises/{id}/history` | últimas 4 sessões e a carga máxima |
| `PATCH`/`DELETE /api/logs/sets/{id}` | corrigir ou apagar uma série (as seguintes são renumeradas) |
| `POST /api/logs/sessions/{id}/finish` | termina a sessão e devolve o resumo |

## Progresso

- **Visão geral:** semanas seguidas (toca para o calendário), volume da semana (toca para a comparação semanal), PRs deste mês, séries por grupo muscular esta semana e cada exercício com a evolução das últimas 8 sessões.
- **Exercício:** 4 semanas, 3 meses ou 1 ano; gráfico da carga máxima por sessão (por semana no ano), PR, volume, tendência e as últimas sessões. Abre também a partir do cartão "Progressão" no ecrã do exercício.
- **Consistência:** o mês com dias treinados, falhados e de descanso face ao plano ativo, o plano cumprido nos últimos 30 dias e os treinos desta semana.
- **Comparação semanal:** esta semana contra a passada até ao mesmo dia da semana, o volume por dia e os exercícios de hoje contra há uma semana.
- **Anilhas:** no ecrã do exercício, as anilhas por lado para a carga no ecrã (barra de 20, 15 ou 10 kg; anilhas em lb para quem usa lb).

Os números de progresso ignoram as séries de aquecimento e seguem cada exercício de plano para plano (mesmo nome e grupo muscular). Um recorde é uma sessão mais pesada do que qualquer data anterior; a primeira vez não conta.

| Endpoint | |
| --- | --- |
| `GET /api/progress` | visão geral |
| `GET /api/progress/exercises/{id}?range=4w\|3m\|1y` | um exercício ao longo do tempo |
| `GET /api/progress/calendar?month=2026-09-01` | um mês (por omissão, o atual) |
| `GET /api/progress/weeks` | esta semana contra a passada |

## Definições

- **Perfil** (nome), **idioma** (pt/en/es), **unidades** (kg/lb), **tema escuro**, **descanso automático** (registar uma série inicia o descanso) e **fuso horário** (pesquisa, ou o do dispositivo). As alterações aplicam-se logo e gravam-se em segundo plano.
- Datas e números seguem o idioma: pt → pt-PT, en → en-GB, es → es-ES (`intlLocale()` em `src/i18n`).
- **PDFs importados**: renomear o plano, torná-lo ativo, abrir o PDF original e apagar. Apagar esconde o plano e apaga o PDF do MinIO; as cargas registadas continuam no histórico e no progresso.
- **Notificações**: ver abaixo.

| Endpoint | |
| --- | --- |
| `PATCH /api/users/me` | `{name?, language?, timezone?, unit?, auto_rest?}` |
| `PATCH /api/workouts/{id}` | `{name?, is_active?}` |
| `DELETE /api/workouts/{id}` | esconde o plano e apaga o PDF; o histórico fica |
| `GET /api/files/{id}/content` | o PDF original (inline) |

## Notificações (Web Push)

O backend envia Web Push com [pywebpush](https://github.com/web-push-libs/pywebpush) e uma chave VAPID. Para ativar, gera a chave uma vez, põe-na no `.env` e reinicia o backend:

```bash
docker compose exec backend python -m app.notifications.keys   # imprime VAPID_PRIVATE_KEY=...
docker compose up -d backend
```

Guarda a chave: uma chave nova invalida as subscrições de todos os dispositivos. Sem ela a app funciona, o ecrã de notificações diz que o servidor não as tem configuradas e o agendador não corre.

Cada dispositivo ativa-as em **Definições → Notificações** (o browser pede autorização). O Web Push precisa de HTTPS (em desenvolvimento, `localhost` conta como seguro). No iPhone só funciona com a app instalada no ecrã principal (iOS 16.4 ou mais recente).

| Notificação | Quando |
| --- | --- |
| Lembrete de treino | nos dias do plano ativo, à hora escolhida (17:30 por omissão, no fuso do utilizador), se ainda não treinou; não sai com mais de 3 h de atraso |
| Resumo semanal | domingo às 20:00: treinos e toneladas da semana (desligado por omissão) |
| Plano a expirar | uma vez, 14 dias antes da data "trocar até" |
| Fim do descanso | só com a app em segundo plano: ao sair a meio de um descanso a app pede-o ao servidor, e ao voltar cancela-o. Com a app aberta, vibra e toca um sinal |
| Novo recorde | aviso na app ao registar a série |

O agendador corre dentro do backend, uma vez por minuto (`app/notifications/scheduler.py`). Cada lembrete é reservado em `notification_deliveries` antes de sair, por isso não se repete mesmo com dois backends. O fim do descanso fica num temporizador em memória: se o backend reiniciar a meio, essa notificação perde-se.

| Endpoint | |
| --- | --- |
| `GET /api/notifications` | a chave pública VAPID (`null` sem configuração) e as definições |
| `PATCH /api/notifications/settings` | liga/desliga cada notificação e a hora do lembrete |
| `POST /api/notifications/subscriptions` | a subscrição do browser (`{endpoint, keys}`) |
| `DELETE /api/notifications/subscriptions?endpoint=…` | esquece este dispositivo |
| `POST /api/notifications/test` | envia uma notificação de teste |
| `POST`/`DELETE /api/notifications/rest` | agenda/cancela o fim do descanso (`{ends_at}`) |

## App instalável (PWA) e produção

O frontend é uma PWA ([vite-plugin-pwa](https://vite-pwa-org.netlify.app/)) com um service worker próprio (`frontend/src/sw/`): guarda em cache os ficheiros do build, abre a app sem rede e mostra as notificações. Quando há uma versão nova, a app mostra um aviso com "Atualizar". O service worker também corre no dev server.

Para correr a stack como em produção (o frontend compilado servido pelo nginx, que faz proxy de `/api` e `/health`; o backend sem `--reload` nem bind mounts):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build
```

Em produção a sério falta um proxy com HTTPS à frente: os cookies `Secure`, o Web Push e a instalação da PWA precisam dele. Mantém `COOKIE_SECURE=true` e define `FORWARDED_ALLOW_IPS` com o IP do proxy.

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
    auth/ users/ workouts/ exercises/ logs/ files/ progress/ notifications/ health/
                    um domínio por pasta: router.py, schemas.py, models.py, service.py
    models.py       regista todos os modelos (Alembic e testes)
    main.py         app FastAPI; os routers dos domínios ficam em /api
  alembic/          migrações
  tests/
frontend/
  src/
    routes/         rotas (TanStack Router, file-based); _auth = só visitantes, _app = autenticado
    features/       código por funcionalidade (auth, workouts, training, progress, settings, notifications)
    sw/             service worker (cache da PWA e Web Push)
    components/ui/  componentes shadcn (gerados pela CLI; ajustes do design notados em CLAUDE.md)
    components/     componentes partilhados (shell da app, logótipo)
    lib/            cliente da API e sessão em memória
    i18n/           i18next + traduções pt/en/es
design/             referência do design (canvas do Claude Design + resumo do Nocturne)
samples/            PDFs pessoais de exemplo (locais, não commitados)
```

Todos os erros da API têm o formato `{"detail": str, "code": str}`; os erros de validação acrescentam `errors: [{loc, msg, type}]` e nunca devolvem o valor enviado.
