#!/bin/bash
# RETIRED: This script backed up SQLite files from NFS/K8s.
# Easy Kanban is PostgreSQL-only. Use pg_dump against the Postgres pod, e.g.:
#
#   kubectl exec -n easy-kanban-pg deploy/postgres -- \
#     pg_dump -U kanban -d easykanban --clean --if-exists | gzip > backup.sql.gz
#
# Or for Docker Compose: ./scripts/backup-postgres.sh
set -e
echo "ERROR: scripts/backup-k8s-tenants.sh (SQLite/NFS) is retired."
echo "Use pg_dump against the PostgreSQL deployment, or ./scripts/backup-postgres.sh for Docker."
exit 1
