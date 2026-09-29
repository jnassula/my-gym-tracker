#!/bin/sh
# Backups of the production data into /backups (./backups next to compose.yml):
#   db-<time>.dump        Postgres, pg_dump custom format (restore with pg_restore)
#   files-<time>.tar.gz   the object storage's data directory (RustFS: the imported PDFs)
# Kept BACKUP_KEEP_DAYS days. It runs as the backup service and takes both every day at
# BACKUP_HOUR_UTC; `backup.sh now` takes both once, `backup.sh db` only the database (what
# deploy.sh does before every release).
set -eu
umask 077 # the dumps hold everyone's data

keep_days=${BACKUP_KEEP_DAYS:-14}
hour=${BACKUP_HOUR_UTC:-3}

# Written under a temporary name first: a half-written file never looks like a backup.
backup_db() {
    stamp=$(date -u +%Y%m%dT%H%M%SZ)
    pg_dump --format=custom --file="/backups/db-$stamp.dump.tmp" &&
        mv "/backups/db-$stamp.dump.tmp" "/backups/db-$stamp.dump" &&
        echo "backup: db-$stamp.dump"
}

backup_files() {
    stamp=$(date -u +%Y%m%dT%H%M%SZ)
    tar -C /storage -czf "/backups/files-$stamp.tar.gz.tmp" . &&
        mv "/backups/files-$stamp.tar.gz.tmp" "/backups/files-$stamp.tar.gz" &&
        echo "backup: files-$stamp.tar.gz"
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
    backup_db && backup_files && prune
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
    prune
    sleep 60 # past the hour, so the next wait is a whole day
done
