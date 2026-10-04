#!/bin/sh
# Backups of the production data into /backups (./backups next to compose.yml):
#   db-<time>.dump        Postgres, pg_dump custom format (restore with pg_restore)
#   files-<time>.tar.gz   the object storage's data directory (RustFS: the imported PDFs)
#   demos.tar             the exercise animations, which are the same for everyone and only
#                         change when `python -m app.demos.sync` runs: one archive, written
#                         again when they changed, instead of 150 MB more in every day's
# Kept BACKUP_KEEP_DAYS days. It runs as the backup service and takes both every day at
# BACKUP_HOUR_UTC; `backup.sh now` takes both once, `backup.sh db` only the database (what
# deploy.sh does before every release).
set -eu
umask 077 # the dumps hold everyone's data

keep_days=${BACKUP_KEEP_DAYS:-14}
hour=${BACKUP_HOUR_UTC:-3}
# This runs as root; each backup goes to the folder's owner (the deploy user, see deploy.sh),
# who restores them and copies them off the server.
owner=$(stat -c '%u:%g' /backups)

# Written under a temporary name first: a half-written file never looks like a backup.
publish() {
    mv "/backups/$1.tmp" "/backups/$1" && chown "$owner" "/backups/$1" && echo "backup: $1"
}

backup_db() {
    name=db-$(date -u +%Y%m%dT%H%M%SZ).dump
    pg_dump --format=custom --file="/backups/$name.tmp" && publish "$name"
}

backup_files() {
    name=files-$(date -u +%Y%m%dT%H%M%SZ).tar.gz
    tar -C /storage --exclude='./*/demos' -czf "/backups/$name.tmp" . && publish "$name"
}

# <bucket>/demos, when there is one and something in it is newer than its archive.
backup_demos() {
    cd /storage
    set -- ./*/demos
    [ -d "$1" ] || return 0
    if [ -f /backups/demos.tar ] && [ -z "$(find "$@" -newer /backups/demos.tar | head -n 1)" ]; then
        return 0
    fi
    tar -cf /backups/demos.tar.tmp "$@" && publish demos.tar # GIFs: nothing to compress
}

prune() {
    find /backups -maxdepth 1 -type f -name '*.tmp' -delete
    find /backups -maxdepth 1 -type f \( -name 'db-*' -o -name 'files-*' \) \
        -mtime +"$keep_days" -delete
}

case ${1:-daily} in
db)
    backup_db
    exit
    ;;
now)
    backup_db && backup_files && backup_demos && prune
    exit
    ;;
esac

# `docker stop` interrupts the wait right away (a trap only runs between commands).
trap 'exit 0' TERM INT
while :; do
    now=$(date -u +%s)
    seconds=$(((hour * 3600 - now % 86400 + 86400) % 86400))
    sleep "$seconds" &
    wait $!
    backup_db || echo "backup: the database dump failed" >&2
    backup_files || echo "backup: the files archive failed" >&2
    backup_demos || echo "backup: the animations archive failed" >&2
    prune
    sleep 60 # past the hour, so the next wait is a whole day
done
