# myGymTracker

[![CI/CD](https://github.com/jnassula/my-gym-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/jnassula/my-gym-tracker/actions/workflows/ci.yml)
[![CodeQL](https://github.com/jnassula/my-gym-tracker/actions/workflows/codeql.yml/badge.svg)](https://github.com/jnassula/my-gym-tracker/actions/workflows/codeql.yml)

App mobile-first para registar treinos de ginásio: importa o plano a partir de um PDF, regista peso × repetições por série, mostra a evolução em gráficos e cruza as sessões com dados do Apple Health.

| Camada | Tecnologia |
| --- | --- |
| Backend | Python 3.13, FastAPI, SQLAlchemy 2 (async) + asyncpg, Alembic, Pydantic v2 |
| Base de dados | PostgreSQL 17 |
| Ficheiros | RustFS (compatível com S3), SDK `minio` |
| PDF | pdfplumber (texto) + agente LLM com Google ADK, DeepSeek por omissão (`backend/app/workouts/parser`) |
| Frontend | React 19, Vite 8, TypeScript, Tailwind CSS 4, shadcn/ui (Base UI), TanStack Router + Query, react-hook-form + zod, i18next (pt/en/es), Recharts (gráficos), vite-plugin-pwa (Workbox) |
| Notificações | Web Push com VAPID (pywebpush) |
| Produção | Caddy (HTTPS) + nginx a servir a PWA, imagens no GHCR, backups diários (`deploy/`) |
| CI/CD | GitHub Actions: testes, smoke test da stack de produção, deploy do `main` por SSH; CodeQL e Dependabot |
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
| Consola do RustFS (S3) | http://localhost:9101 (credenciais `S3_ACCESS_KEY`/`S3_SECRET_KEY` do `.env`) |
| Mailpit (emails de desenvolvimento) | http://localhost:8026 |
| Postgres | `localhost:5440` |

Todas as portas publicadas ficam em `127.0.0.1` e podem ser mudadas no `.env` (`FRONTEND_PORT`, `BACKEND_PORT`, `POSTGRES_PORT`, `S3_API_PORT`, `S3_CONSOLE_PORT`, `MAILPIT_UI_PORT`).

Os ficheiros ficam no [RustFS](https://rustfs.com), compatível com S3, que substituiu o MinIO quando as imagens deste deixaram de ser publicadas. Num `.env` anterior a essa mudança, renomeia `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_API_PORT` e `MINIO_CONSOLE_PORT` para `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_API_PORT` e `S3_CONSOLE_PORT`.

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
| `POST /api/auth/register` | cria a conta, inicia a sessão e envia o email de boas-vindas |
| `POST /api/auth/login` | `{email, password, remember}` |
| `POST /api/auth/refresh` | usa o cookie; roda o refresh token |
| `POST /api/auth/logout` | revoga a sessão e apaga o cookie |
| `POST /api/auth/forgot-password` | responde sempre 202 (não revela se a conta existe) |
| `POST /api/auth/reset-password/check` | valida o link e devolve o email |
| `POST /api/auth/reset-password` | define a nova palavra-passe e inicia a sessão |
| `POST /api/auth/change-password` | autenticado; devolve um access token novo |
| `GET /api/users/me` | autenticado |

### Emails

A app envia dois emails, no idioma da conta (pt, en, es): as **boas-vindas** ao criar a conta e a **recuperação de palavra-passe**. Cada um segue em texto simples e em HTML com a identidade da app (Nocturne, sempre escuro): as boas-vindas são um "treino de arranque" com a conta já riscada e o botão para importar o plano; na recuperação, a validade do link aparece como o anel do descanso.

- Os textos estão em `backend/app/auth/emails.py`; o layout e os blocos (`paragraph`, `checklist`, `countdown`, `button`, `note`) em `backend/app/core/email_layout.py`. Um email novo compõe-se com esses blocos.
- O logótipo vai dentro da mensagem (`cid:`), por isso aparece sem o cliente de email carregar imagens remotas.
- Em desenvolvimento, os emails aparecem no Mailpit (http://localhost:8026). Para ver amostras sem criar contas:

```bash
docker compose exec backend python -m app.auth.email_samples tu@exemplo.pt        # pt
docker compose exec backend python -m app.auth.email_samples tu@exemplo.pt en     # ou es
```

## Importar um plano em PDF

1. **Upload** (`POST /api/workouts/import`, multipart, até 20 MB). O ficheiro passa pela API em vez de ir por URL presigned: o backend precisa dos bytes na hora para a leitura, valida o tipo pelos bytes (`%PDF-`) e o tamanho antes de guardar, e o armazenamento fica privado (sem CORS, sem endpoint público). Com PDFs deste tamanho, o custo de passar pela API é irrelevante. Só são guardados os PDFs que foram lidos com sucesso.
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
- **Treino:** toca num treino desta semana (na Consistência) para ver a duração, as séries e a carga máxima de cada exercício e, com o Apple Health ligado, a FC média, as calorias, o gráfico da frequência cardíaca e o pico de cada exercício.
- **Comparação semanal:** esta semana contra a passada até ao mesmo dia da semana, o volume por dia e os exercícios de hoje contra há uma semana.
- **Anilhas:** no ecrã do exercício, as anilhas por lado para a carga no ecrã (barra de 20, 15 ou 10 kg; anilhas em lb para quem usa lb).

Os números de progresso ignoram as séries de aquecimento e seguem cada exercício de plano para plano (mesmo nome e grupo muscular). Um recorde é uma sessão mais pesada do que qualquer data anterior; a primeira vez não conta.

| Endpoint | |
| --- | --- |
| `GET /api/progress` | visão geral |
| `GET /api/progress/exercises/{id}?range=4w\|3m\|1y` | um exercício ao longo do tempo |
| `GET /api/progress/calendar?month=2026-09-01` | um mês (por omissão, o atual) |
| `GET /api/progress/weeks` | esta semana contra a passada |
| `GET /api/progress/sessions/{id}` | um treino, com os dados do Apple Watch quando os há |

## Definições

- **Perfil** (nome), **idioma** (pt/en/es), **unidades** (kg/lb), **tema escuro**, **descanso automático** (registar uma série inicia o descanso) e **fuso horário** (pesquisa, ou o do dispositivo). As alterações aplicam-se logo e gravam-se em segundo plano.
- **Foto de perfil** (Definições → Perfil): adicionar, alterar ou remover. O browser recorta a imagem num quadrado ao centro, reduz para 512 px e envia um JPEG de algumas dezenas de KB. O servidor não confia nisso: descodifica o que recebe (com o Pillow), endireita a foto, recorta, reduz e grava um JPEG novo sem metadados, por isso os dados da câmara (como o local onde foi tirada) nunca ficam guardados, venha a foto da app ou de um pedido direto à API. Fica no armazenamento de objetos e só a própria pessoa a vê; aparece no Início, nas Definições e no Perfil. Sem foto, mostra-se a inicial do nome.
- Datas e números seguem o idioma: pt → pt-PT, en → en-GB, es → es-ES (`intlLocale()` em `src/i18n`).
- **PDFs importados**: renomear o plano, torná-lo ativo, abrir o PDF original e apagar. Apagar esconde o plano e apaga o PDF do armazenamento; as cargas registadas continuam no histórico e no progresso.
- **Notificações**: ver abaixo.

| Endpoint | |
| --- | --- |
| `PATCH /api/users/me` | `{name?, language?, timezone?, unit?, auto_rest?}` |
| `PATCH /api/workouts/{id}` | `{name?, is_active?}` |
| `DELETE /api/workouts/{id}` | esconde o plano e apaga o PDF; o histórico fica |
| `PUT /api/users/me/avatar` | a foto (multipart `file`: JPEG, PNG ou WebP, até 1 MB e 16 megapíxeis); fica guardada como JPEG quadrado até 512 px e substitui a anterior |
| `DELETE /api/users/me/avatar` | remove a foto |
| `GET /api/files/{id}/content` | o PDF original, ou a foto (`avatar_file_id` do utilizador), só para o dono |

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

## Apple Health

A web não tem acesso ao HealthKit: só apps instaladas no iPhone leem a app Saúde. Por isso a ligação é um **atalho** da app Atalhos, que lê a frequência cardíaca e a energia ativa dos últimos 3 dias e as envia para a API com um código pessoal.

1. Em **Definições → Apple Health**, toca em "Ligar Apple Health". A app mostra o endereço e o cabeçalho `Authorization` a colar no atalho (o código só aparece dessa vez; "Gerar novo código" substitui-o).
2. No iPhone, cria o atalho **myGymTracker** seguindo os passos no ecrã: duas vezes "Procurar amostras de Saúde" + "Formatar data" (ISO 8601 com hora) e um "Obter conteúdo do URL" (POST, JSON com `hr_t`, `hr_v`, `ae_t`, `ae_v`).
3. Corre-o uma vez à mão para autorizar a leitura na Saúde e escolher "Permitir sempre" no envio para o endereço.
4. Depois: "Sincronizar agora" (no ecrã Apple Health, no resumo do treino ou num treino sem dados) abre o atalho; uma automação diária em Atalhos serve de reserva.

O que a app guarda:

- Só as amostras que caem dentro de um treino: de 5 minutos antes da primeira série até "Terminar treino" (ou 3 minutos depois da última série, no máximo 20). O resto do dia fica no iPhone.
- Reenviar as mesmas amostras não duplica nada (cada corrida do atalho sobrepõe-se à anterior).
- Desligar a frequência cardíaca ou as calorias apaga o que já foi importado desse tipo; "Desligar Apple Health" revoga o código e apaga tudo o que veio da Saúde. Os treinos ficam.

Limitações: com o iPhone bloqueado a Saúde não deixa ler os dados, por isso uma automação a essa hora pode não enviar nada (a seguinte recupera). A app Atalhos não lê os treinos do Apple Watch, por isso a duração é a do treino registado na app.

| Endpoint | |
| --- | --- |
| `GET /api/health` | ligado ou não, última sincronização, treinos desta semana com dados do relógio |
| `POST /api/health/connection` | gera o código do atalho (mostrado uma vez); de novo, substitui-o |
| `DELETE /api/health/connection` | revoga o código e apaga os dados importados |
| `PATCH /api/health/settings` | `{heart_rate?, calories?}` |
| `POST /api/health/sync` | o atalho: `Authorization: Bearer <código>`; listas (ou texto com um item por linha) de datas ISO 8601 e valores |

## Backoffice

Para acompanhar o crescimento da app há uma área de administração em `/admin` (também em **Definições → Administração → Backoffice**). Mostra números e dados de conta, nunca o que cada pessoa treina: os planos, os PDFs, as cargas e os dados do Apple Health não passam por aqui.

- **Visão geral**: contas no total, novas e ativas nos últimos 7 e 30 dias (contra o período anterior), treinos registados, o gráfico de crescimento (novas, total ou ativas; por dia, semana ou mês; com tabela), até onde as contas chegam (criaram conta → criaram um plano → registaram um treino → treinaram nos últimos 30 dias) e a utilização (Apple Health, notificações, idiomas).
- **Contas**: todas as contas, da mais recente para a mais antiga, com procura por nome ou email: data de registo, idioma, número de planos e de treinos, data do último treino.

No menu de cada conta (⋮) em **Contas**:

- **Inativar**: a sessão termina em todos os dispositivos e a pessoa deixa de poder entrar (no início de sessão vê "Esta conta foi inativada"); o atalho do Apple Health e os lembretes também param. Os dados ficam, e **Reativar** devolve o acesso.
- **Apagar**: apaga a conta e tudo o que lhe pertence (planos, treinos, PDFs no armazenamento, dados do Apple Health, dispositivos). Não pode ser desfeito, por isso pede o email da conta escrito por extenso. O endereço fica livre para um novo registo.

As contas de administração (as de `ADMIN_EMAILS`, a tua incluída) não têm menu: para fechar uma, tira-a primeiro da lista. Cada ação fica nos logs do backend, com os ids de quem a fez e da conta.

"Ativa" é uma conta que registou pelo menos um treino no período. Os dias, semanas e meses do gráfico são os do fuso horário de quem administra.

Quem pode entrar são os emails em `ADMIN_EMAILS` (no `.env`, separados por vírgulas; vazio = ninguém). **Cria primeiro a conta na app e só depois junta o email à lista**: como o registo não confirma o email, um endereço da lista deixa de poder ser registado, para ninguém o reclamar antes de ti. Depois de mudar a lista, recria o backend (`docker compose up -d backend`).

| Endpoint | |
| --- | --- |
| `GET /api/admin/overview` | os números principais, o funil e a utilização |
| `GET /api/admin/growth?range=30d\|12w\|12m` | novas, total e ativas por dia, semana ou mês |
| `GET /api/admin/users?q=&limit=&offset=` | as contas, com contagens |
| `PATCH /api/admin/users/{id}` | `{active}`: inativa ou reativa a conta |
| `DELETE /api/admin/users/{id}` | apaga a conta e os seus dados |

Quem não está na lista recebe `403 forbidden`; `GET /api/users/me` diz `is_admin`.

## Testar no telemóvel (ngrok)

O Web Push, a instalação da PWA e o atalho do Apple Health precisam de HTTPS e de um endereço a que o telemóvel chegue. Para testar sem servidor, um túnel [ngrok](https://ngrok.com) serve:

1. Cria uma conta grátis, instala o ngrok (`brew install ngrok`) e liga-o à conta (`ngrok config add-authtoken …`).
2. Em **Domains**, reserva o domínio estático grátis (por exemplo `nome.ngrok-free.app`): a PWA instalada, as notificações e o atalho ficam presos ao endereço.
3. No `.env`, `DEV_ALLOWED_HOSTS=nome.ngrok-free.app`, e recria o frontend: `docker compose up -d frontend`.
4. `ngrok http --url=https://nome.ngrok-free.app 5173` (só o frontend fica exposto; ele encaminha `/api`).

O plano grátis mostra uma página de aviso do ngrok na primeira visita (no Safari e outra vez na app instalada): toca em "Visit Site". No atalho, junta o cabeçalho `ngrok-skip-browser-warning: 1` (o ecrã de configuração lembra-o quando está aberto num domínio ngrok).

## App instalável (PWA)

O frontend é uma PWA ([vite-plugin-pwa](https://vite-pwa-org.netlify.app/)) com um service worker próprio (`frontend/src/sw/`): guarda em cache os ficheiros do build, abre a app sem rede e mostra as notificações. Quando há uma versão nova, a app mostra um aviso com "Atualizar". O service worker também corre no dev server.

## Produção e CI/CD

A produção é um servidor com Docker: o Caddy (HTTPS com Let's Encrypt) à frente do nginx, que serve a PWA e faz proxy da API, com Postgres, RustFS e um backup diário numa rede interna. Tudo isto está em [`deploy/`](deploy/), com o runbook em [`deploy/README.md`](deploy/README.md): preparar o servidor e o GitHub, voltar a uma versão anterior, backups e restauro, correr a mesma stack localmente.

- **CI/CD** (`.github/workflows/ci.yml`), a cada push e pull request: ruff, mypy e pytest (com Postgres); oxlint, tsc, Vitest e o build; depois as imagens de produção são construídas e a stack completa arranca no runner para um smoke test. No `main`, as imagens vão para o GHCR, marcadas com o commit, e são publicadas no servidor (`deploy.yml`). Se a versão nova não ficar saudável, a anterior volta sozinha.
- **Deploy** à mão ou rollback: Actions → Deploy → Run workflow, com o SHA do commit.
- **CodeQL** analisa o Python, o TypeScript e os workflows. O **Dependabot** abre PRs semanais (uv, npm, Docker, Compose, Actions), agrupados por app.
- `GET /health` diz o commit que está a correr (`release`).
- Com `ENVIRONMENT=production`, o backend recusa arrancar com os valores de exemplo do `.env.example`, sem `COOKIE_SECURE` ou sem `https://` no `FRONTEND_URL`.

## Testes e linters

O CI corre tudo isto a cada push. Localmente, com a stack a correr:

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
    features/       código por funcionalidade (auth, workouts, training, progress, settings, notifications, health)
    sw/             service worker (cache da PWA e Web Push)
    components/ui/  componentes shadcn (gerados pela CLI; ajustes do design notados em CLAUDE.md)
    components/     componentes partilhados (shell da app, logótipo)
    lib/            cliente da API e sessão em memória
    i18n/           i18next + traduções pt/en/es
deploy/             stack de produção (Compose, Caddy), deploy.sh, backups, restauro, runbook
.github/            CI/CD, deploy, CodeQL, Dependabot
design/             referência do design (canvas do Claude Design + resumo do Nocturne)
samples/            PDFs pessoais de exemplo (locais, não commitados)
```

Todos os erros da API têm o formato `{"detail": str, "code": str}`; os erros de validação acrescentam `errors: [{loc, msg, type}]` e nunca devolvem o valor enviado.
