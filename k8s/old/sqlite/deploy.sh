#!/bin/bash
# RETIRED: SQLite + NFS multi-tenant deploy path has been removed.
# Easy Kanban is PostgreSQL-only. Use the PG deploy scripts instead.
#
#   ./k8s/deploy-pg.sh
#   ./k8s/deploy-instance-pg.sh <instance_name> <plan>
#
set -e
echo "ERROR: k8s/deploy.sh (SQLite/NFS stack) is retired."
echo "Use: ./k8s/deploy-pg.sh and ./k8s/deploy-instance-pg.sh"
exit 1
