#!/bin/bash
# Easy Kanban PostgreSQL backup (Docker Compose)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(cd "$SCRIPT_DIR/.." && pwd)"

CONTAINER_NAME="${POSTGRES_CONTAINER:-easy-kanban-postgres}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/kanban-backup-${TIMESTAMP}.sql.gz"
LATEST_LINK="${BACKUP_DIR}/kanban-latest.sql.gz"

POSTGRES_USER="${POSTGRES_USER:-kanban_user}"
POSTGRES_DB="${POSTGRES_DB:-kanban}"

mkdir -p "$BACKUP_DIR"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  echo "ERROR: Postgres container '${CONTAINER_NAME}' is not running."
  exit 1
fi

echo "Backing up ${POSTGRES_DB} from ${CONTAINER_NAME}..."
docker exec "$CONTAINER_NAME" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
  | gzip > "$BACKUP_FILE"

ln -sfn "$(basename "$BACKUP_FILE")" "$LATEST_LINK"
echo "Wrote ${BACKUP_FILE}"
echo "Latest link: ${LATEST_LINK}"

# Keep last 10 dumps
ls -1t "$BACKUP_DIR"/kanban-backup-*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm -f
