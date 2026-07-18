#!/bin/bash
# Easy Kanban PostgreSQL restore (Docker Compose)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(cd "$SCRIPT_DIR/.." && pwd)"

CONTAINER_NAME="${POSTGRES_CONTAINER:-easy-kanban-postgres}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
LATEST_LINK="${BACKUP_DIR}/kanban-latest.sql.gz"

POSTGRES_USER="${POSTGRES_USER:-kanban_user}"
POSTGRES_DB="${POSTGRES_DB:-kanban}"

BACKUP_FILE="${1:-}"
if [ -z "$BACKUP_FILE" ]; then
  if [ -L "$LATEST_LINK" ] || [ -f "$LATEST_LINK" ]; then
    BACKUP_FILE="$LATEST_LINK"
  else
    echo "Usage: $0 [backup.sql.gz]"
    echo "Default: ${LATEST_LINK}"
    exit 1
  fi
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup not found: $BACKUP_FILE"
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  echo "ERROR: Postgres container '${CONTAINER_NAME}' is not running."
  exit 1
fi

echo "Restoring ${BACKUP_FILE} into ${POSTGRES_DB} on ${CONTAINER_NAME}..."
gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
echo "Restore complete."
