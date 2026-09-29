# Produção

O myGymTracker corre num servidor com Docker, numa stack Compose (`compose.yml`):

```
Internet ──443──▶ Caddy (TLS, Let's Encrypt) ──▶ nginx (PWA, proxy /api) ──▶ backend (FastAPI)
                                                                               │
                                     rede interna, sem saída ──────────────────┤
                                     Postgres · RustFS (S3, os PDFs) · backup diário
```

O caminho de um commit até produção:

1. **Push** para qualquer ramo ou pull request: o workflow **CI/CD** corre ruff, mypy, pytest, oxlint, tsc, Vitest e o build. Depois constrói as duas imagens de produção, arranca a stack completa num runner (Caddy em `localhost`) e verifica o health, os headers, um registo, o redirect para HTTPS e um backup (`smoke-test.sh`).
2. **Push para o `main`**: as imagens são publicadas no GHCR (`ghcr.io/jnassula/my-gym-tracker/{backend,frontend}:<sha>`), e o workflow **Deploy** copia esta pasta para o servidor por SSH e corre `deploy.sh <sha>` lá.
3. **`deploy.sh`** valida o `.env`, descarrega as imagens, faz um dump da base de dados (a versão nova pode migrá-la), reinicia o que mudou e espera que tudo fique saudável. Se a versão nova não arrancar, repõe a anterior sozinho. No fim, o workflow confirma que `https://<domínio>/health` responde com o commit novo.

Enquanto a variável `DEPLOY_HOST` não existir no GitHub, o passo de deploy é saltado e o resto do CI corre normalmente.

## Preparar o servidor (uma vez)

Ubuntu 24.04 (ou outro Linux) com Docker Engine e o plugin Compose ≥ 2.20 (`docker compose version`).

```bash
# Um utilizador só para deploys, com acesso ao Docker
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy

# A chave com que o GitHub Actions entra (gera-a no teu computador, não no servidor)
ssh-keygen -t ed25519 -N "" -C "github-actions-deploy" -f mygymtracker_deploy
# mygymtracker_deploy.pub vai para o servidor; a privada, mygymtracker_deploy, vai para o GitHub
sudo -u deploy sh -c 'mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys' < mygymtracker_deploy.pub

# A pasta da stack
sudo install -d -o deploy -g deploy -m 750 /opt/mygymtracker

# Firewall: só SSH e web
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

**DNS**: o registo A (e AAAA, se o servidor tiver IPv6) do domínio aponta para o servidor. O Caddy pede o certificado no primeiro arranque.

**`.env`**: o primeiro deploy copia o `.env.example` para `/opt/mygymtracker`. Antes disso, cria o `.env` à mão com o conteúdo do [`.env.example`](.env.example):

```bash
sudo -u deploy -i
cd /opt/mygymtracker
nano .env            # DOMAIN, as passwords, SMTP, LLM_API_KEY...
chmod 600 .env
openssl rand -hex 32 # uma vez por password/segredo
```

O backend recusa arrancar em produção com um valor de exemplo (`change-me…`), com `COOKIE_SECURE` desligado ou sem `https://` no endereço: o erro aparece em `docker compose logs backend`. O SMTP é o do teu fornecedor de email (porta 587 com STARTTLS). Sem ele, a recuperação da palavra-passe não envia nada.

## Configurar o GitHub (uma vez)

Em **Settings → Environments → New environment**, cria `production`:

- **Deployment branches**: só `main`. Assim, um ramo ou um pull request nunca chega à chave SSH.
- **Environment secret** `DEPLOY_SSH_KEY`: o conteúdo de `mygymtracker_deploy` (a chave privada).
- Opcional: **Required reviewers**, para aprovares cada deploy à mão.

Em **Settings → Secrets and variables → Actions → Variables**, cria as variáveis do repositório:

| Variável | Valor |
| --- | --- |
| `DEPLOY_HOST` | o endereço SSH do servidor. Sem esta variável não há deploy |
| `DEPLOY_KNOWN_HOSTS` | a saída de `ssh-keyscan -t ed25519 <host>`. Confirma a impressão digital com a que o fornecedor mostra (ou com `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` no servidor) |
| `APP_DOMAIN` | o domínio público (o `DOMAIN` do `.env`) |
| `DEPLOY_USER` | opcional, por omissão `deploy` |
| `DEPLOY_PATH` | opcional, por omissão `/opt/mygymtracker` |
| `DEPLOY_PORT` | opcional, por omissão `22` |

Recomendado, em **Settings → Code security**: Dependabot alerts e security updates, secret scanning com push protection e private vulnerability reporting (é o canal do [SECURITY.md](../SECURITY.md)). Em **Settings → Rules**, uma regra para o `main` que exige os checks do CI/CD protege a produção de um push partido.

As imagens ficam em **Packages** no perfil do GitHub. O servidor descarrega-as com o token do próprio job, por isso podem ficar privadas.

## O primeiro deploy

Faz push para o `main`, ou **Actions → Deploy → Run workflow** com o commit. Depois do primeiro deploy:

```bash
cd /opt/mygymtracker
docker compose ps                                   # tudo "healthy"
docker compose exec backend python -m app.notifications.keys   # a chave do Web Push
nano .env                                           # VAPID_PRIVATE_KEY=... (guarda-a para sempre)
docker compose up -d backend
```

## Operação

No servidor, dentro de `/opt/mygymtracker`, o `docker compose` já sabe que versão está em produção (o `IMAGE_TAG` que o `deploy.sh` grava no `.env`):

```bash
docker compose ps
docker compose logs -f --tail 100 backend
docker compose restart backend
```

**Voltar a uma versão anterior**: **Actions → Deploy → Run workflow** com o SHA do commit (`git log --oneline main`), ou no servidor `sh deploy.sh <sha>`. Voltar atrás troca as imagens mas **não desfaz as migrações**. Por isso cada migração tem de deixar a versão anterior do código a funcionar: acrescentar colunas e tabelas primeiro, remover só num deploy seguinte. Quando isso não for possível, repõe o backup tirado antes do deploy (ver abaixo).

**Logs**: os de cada contentor rodam aos 10 MB (5 ficheiros).

### Backups

O serviço `backup` guarda em `/opt/mygymtracker/backups`, todos os dias às `BACKUP_HOUR_UTC` (3h por omissão), durante `BACKUP_KEEP_DAYS` dias (14):

- `db-<data>.dump`: a base de dados (`pg_dump`, formato custom). O `deploy.sh` tira um destes antes de cada versão nova.
- `files-<data>.tar.gz`: os PDFs importados (a pasta de dados do RustFS).

```bash
docker compose run --rm --no-deps backup now      # um backup completo agora
ls -lh backups/
```

**Estes backups estão no mesmo disco que os dados.** Guarda uma cópia fora do servidor: os snapshots do fornecedor da VPS, ou um `rsync`/`rclone` da pasta `backups/` para outro sítio.

### Repor um backup

Para a app enquanto repõe, e perde-se o que foi escrito depois do backup:

```bash
sh restore.sh backups/db-20260929T030000Z.dump backups/files-20260929T030000Z.tar.gz
```

O arquivo dos ficheiros é opcional (só a base de dados: `sh restore.sh backups/db-….dump`). Num servidor novo: prepara-o como acima, faz um deploy, copia os backups para `backups/` e corre o `restore.sh`.

### Mudar segredos

- `JWT_SECRET`: termina todas as sessões. Muda no `.env` e faz `docker compose up -d backend`.
- `S3_SECRET_KEY`: muda no `.env` e faz `docker compose up -d storage backend`.
- `POSTGRES_PASSWORD`: o Postgres só lê a variável na criação da base de dados. Primeiro `docker compose exec db psql -U gym -d mygymtracker -c "ALTER USER gym PASSWORD '…'"`, depois muda o `.env` e faz `docker compose up -d`.
- `VAPID_PRIVATE_KEY`: não mudes. Uma chave nova invalida as notificações de todos os dispositivos.

### Atualizar o Postgres para uma versão major

O Dependabot não propõe estas atualizações: os dados de uma versão major não abrem noutra. Faz um backup, muda a imagem (`db` e `backup` no `compose.yml`), apaga o volume `db-data` e repõe o dump com o `restore.sh`.

## Outras apps no mesmo servidor

O Caddy desta stack ocupa as portas 80 e 443, por isso é ele que termina o TLS de todos os sites do servidor. Para servir outra app, sem mexer neste repositório:

1. Um ficheiro por site em `/opt/mygymtracker/caddy/sites/`, por exemplo `outra.caddy`:
   ```
   outra.example.com {
   	reverse_proxy outra-web:80
   }
   ```
2. O Caddy precisa de chegar ao contentor da outra app. Copia o [`compose.override.example.yml`](compose.override.example.yml) para `compose.override.yml` e põe lá a rede Docker dessa app (`docker network ls`). O Compose lê este ficheiro sozinho e o deploy nunca lhe toca.
3. `docker compose up -d caddy`, e depois de mudar um site, `docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`.

Opções globais do Caddy (por exemplo `metrics`, para um Prometheus) vão em `caddy/global/*.caddy`.

## Correr a stack de produção localmente

A mesma stack, com as imagens construídas a partir do código e um certificado da CA local do Caddy:

```bash
cp deploy/.env.example deploy/.env
# no deploy/.env: DOMAIN=localhost, IMAGE_TAG=local, HTTP_PORT=8080, HTTPS_PORT=8443,
# passwords e JWT_SECRET quaisquer, SMTP_HOST=smtp.invalid
docker compose -f deploy/compose.yml -f deploy/compose.build.yml up --build -d --wait
CURL_OPTS=--insecure sh deploy/smoke-test.sh https://localhost:8443 local
docker compose -f deploy/compose.yml down -v      # e apagar tudo
```

O browser avisa que o certificado não é de confiança (é da CA local do Caddy): aceita-o para testar.
