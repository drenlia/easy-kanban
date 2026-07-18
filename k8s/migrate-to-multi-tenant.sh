#!/bin/bash
# RETIRED: Legacy SQLite → NFS multi-tenant migration.
# Easy Kanban is PostgreSQL-only. Use k8s/deploy-pg.sh / deploy-instance-pg.sh.
set -e
echo "ERROR: k8s/migrate-to-multi-tenant.sh is retired (SQLite/NFS)."
echo "Use the PostgreSQL K8s stack: ./k8s/deploy-pg.sh"
exit 1
