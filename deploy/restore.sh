#!/bin/sh
# Restores a backup taken by backup.sh: the database and, given its archive, the stored files.
# The app is stopped meanwhile, and whatever was written after the backup is lost.
#   sh restore.sh backups/db-<time>.dump [backups/files-<time>.tar.gz]
set -eu

db=${1:?usage: sh restore.sh <db-dump> [files-archive]}
files=${2:-}
for file in "$db" $files; do
    [ -f "$file" ] || {
        echo "No such file: $file" >&2
        exit 1
    }
done
# The paths are read before moving next to compose.yml.
db=$(cd "$(dirname "$db")" && pwd)/$(basename "$db")
[ -z "$files" ] || files=$(cd "$(dirname "$files")" && pwd)/$(basename "$files")
cd "$(dirname "$0")"

echo "==> Stopping the app"
docker compose stop caddy frontend backend

echo "==> Restoring the database from $db"
docker compose up --detach --wait db
# shellcheck disable=SC2016 # expanded inside the container
docker compose exec -T db sh -c \
    'pg_restore --clean --if-exists --no-owner --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"' \
    <"$db"

if [ -n "$files" ]; then
    echo "==> Restoring the stored files from $files"
    docker compose stop storage
    docker compose run --rm --no-deps -T --entrypoint sh storage \
        -c 'rm -rf /data/..?* /data/.[!.]* /data/* && tar -xzf - -C /data' <"$files"
fi

echo "==> Starting the app"
docker compose up --detach --wait
echo "==> Restored"
