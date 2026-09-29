#!/bin/sh
# Puts one release live on the server: checks the settings, pulls the images, backs up the
# database (the new release may migrate it), restarts what changed and waits until every
# service is healthy. If the new release doesn't come up, the previous one is started again.
#
#   sh deploy.sh <image-tag>     the deploy workflow runs it with the commit's SHA;
#                                by hand, with an older SHA, it rolls back.
set -eu

tag=${1:?usage: sh deploy.sh <image-tag>}
cd "$(dirname "$0")"

if [ ! -f .env ]; then
    echo "No .env here: copy .env.example to .env and fill it in (see README.md)." >&2
    exit 1
fi
previous=$(sed -n 's/^IMAGE_TAG=//p' .env | tail -n 1)
# Created by this user, not by Docker as root: the backups (and their restore) stay its own.
mkdir -p backups caddy/sites caddy/global

# Only the running release's tag is kept in .env, so plain `docker compose` commands on the
# server keep working; a shell variable overrides it for one command.
remember_tag() {
    if grep -q '^IMAGE_TAG=' .env; then
        # Rewritten in place (cat, not mv): .env keeps its owner and mode (600).
        sed "s/^IMAGE_TAG=.*/IMAGE_TAG=$1/" .env >.env.new
        cat .env.new >.env
        rm .env.new
    else
        printf '\nIMAGE_TAG=%s\n' "$1" >>.env
    fi
}

start() {
    IMAGE_TAG=$1 docker compose up --detach --remove-orphans --wait --wait-timeout 180
}

IMAGE_TAG=$tag docker compose config --quiet

echo "==> Pulling $tag"
IMAGE_TAG=$tag docker compose pull --quiet

if [ -n "$previous" ] && docker compose ps --status running --services | grep -qx db; then
    echo "==> Backing up the database"
    docker compose run --rm --no-deps backup db
fi

echo "==> Starting $tag"
if ! start "$tag"; then
    echo "!! $tag did not become healthy" >&2
    IMAGE_TAG=$tag docker compose logs --tail 80 backend frontend >&2 || true
    if [ -n "$previous" ] && [ "$previous" != "$tag" ]; then
        echo "==> Rolling back to $previous" >&2
        start "$previous" || true
    fi
    exit 1
fi
remember_tag "$tag"

# Caddy keeps its configuration in memory: pick up a Caddyfile the deploy may have changed.
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile

# Old releases' images go after two weeks (rolling back further pulls them again). Only this
# app's images: the label is set in its Dockerfiles.
docker image prune --all --force --filter "until=336h" --filter "label=mygymtracker.image" \
    >/dev/null

echo "==> $tag is live"
