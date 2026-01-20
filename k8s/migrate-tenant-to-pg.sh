#!/bin/bash

# Migrate a tenant from SQLite to PostgreSQL
# This script helps migrate tenant data from SQLite backups to PostgreSQL

set -e

# Function to display usage
usage() {
    echo "Usage: $0 <tenant_id> [sqlite_backup_path]"
    echo ""
    echo "Parameters:"
    echo "  tenant_id          - The tenant ID (e.g., develop, drenlia)"
    echo "  sqlite_backup_path - Optional: Path to SQLite backup file"
    echo "                       Default: Uses latest backup from backups/<tenant_id>/"
    echo ""
    echo "Example:"
    echo "  $0 develop"
    echo "  $0 develop backups/develop/kanban-develop-backup-20260119_040001.db"
    echo ""
    echo "This script will:"
    echo "  1. Find the latest SQLite backup for the tenant"
    echo "  2. Port-forward to PostgreSQL in easy-kanban-pg namespace"
    echo "  3. Run the migration script to copy data to PostgreSQL"
    exit 1
}

# Check parameters
if [ $# -lt 1 ]; then
    echo "❌ Error: Missing tenant ID"
    usage
fi

TENANT_ID="$1"
SQLITE_BACKUP_PATH="$2"
NAMESPACE="easy-kanban-pg"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Validate tenant ID
if [[ ! "$TENANT_ID" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]]; then
    echo "❌ Error: Tenant ID must contain only lowercase letters, numbers, and hyphens"
    exit 1
fi

echo "🚀 Migrating tenant '${TENANT_ID}' from SQLite to PostgreSQL"
echo ""

# Check if PostgreSQL is running
if ! kubectl get deployment postgres -n "${NAMESPACE}" &>/dev/null; then
    echo "❌ Error: PostgreSQL deployment not found in namespace ${NAMESPACE}"
    echo "   Please deploy the PostgreSQL instance first:"
    echo "   ./k8s/deploy-instance-pg.sh ${TENANT_ID} basic"
    exit 1
fi

# Find SQLite backup file
if [ -z "$SQLITE_BACKUP_PATH" ]; then
    echo "📂 Looking for latest SQLite backup..."
    BACKUP_DIR="${PROJECT_ROOT}/backups/${TENANT_ID}"
    
    if [ ! -d "$BACKUP_DIR" ]; then
        echo "❌ Error: Backup directory not found: ${BACKUP_DIR}"
        exit 1
    fi
    
    # Find latest backup file
    LATEST_BACKUP=$(ls -t "${BACKUP_DIR}"/kanban-${TENANT_ID}-backup-*.db 2>/dev/null | head -1)
    
    if [ -z "$LATEST_BACKUP" ]; then
        echo "❌ Error: No backup files found in ${BACKUP_DIR}"
        echo "   Expected pattern: kanban-${TENANT_ID}-backup-*.db"
        exit 1
    fi
    
    SQLITE_BACKUP_PATH="$LATEST_BACKUP"
    echo "   ✅ Found: $(basename "$SQLITE_BACKUP_PATH")"
else
    if [ ! -f "$SQLITE_BACKUP_PATH" ]; then
        echo "❌ Error: SQLite backup file not found: ${SQLITE_BACKUP_PATH}"
        exit 1
    fi
    echo "📂 Using SQLite backup: ${SQLITE_BACKUP_PATH}"
fi

echo ""
echo "📋 Migration Configuration:"
echo "   Tenant ID: ${TENANT_ID}"
echo "   SQLite DB: ${SQLITE_BACKUP_PATH}"
echo "   PostgreSQL: postgres.easy-kanban-pg.svc.cluster.local:5432"
echo "   Database: easykanban"
echo "   Schema: ${TENANT_ID}"
echo ""

# Check if migration script exists
MIGRATION_SCRIPT="${PROJECT_ROOT}/scripts/migrate-sqlite-to-postgres.js"
if [ ! -f "$MIGRATION_SCRIPT" ]; then
    echo "❌ Error: Migration script not found: ${MIGRATION_SCRIPT}"
    exit 1
fi

# Set up port-forward to PostgreSQL
echo "🔌 Setting up port-forward to PostgreSQL..."
echo "   This will run in the background"
kubectl port-forward -n "${NAMESPACE}" service/postgres 5432:5432 > /dev/null 2>&1 &
PORT_FORWARD_PID=$!

# Wait for port-forward to be ready
echo "   ⏳ Waiting for port-forward to be ready..."
sleep 3

# Check if port-forward is working
if ! nc -z localhost 5432 2>/dev/null; then
    echo "   ⚠️  Port-forward may not be ready, but continuing..."
fi

# Cleanup function
cleanup() {
    echo ""
    echo "🧹 Cleaning up port-forward..."
    kill $PORT_FORWARD_PID 2>/dev/null || true
    wait $PORT_FORWARD_PID 2>/dev/null || true
}

trap cleanup EXIT

echo "   ✅ Port-forward active (PID: ${PORT_FORWARD_PID})"
echo ""

# Run migration script
echo "🔄 Running migration script..."
echo ""

cd "${PROJECT_ROOT}"

# Set environment variables for migration
export SQLITE_DB_PATH="${SQLITE_BACKUP_PATH}"
export POSTGRES_HOST="localhost"
export POSTGRES_PORT="5432"
export POSTGRES_DB="easykanban"
export POSTGRES_USER="kanban"
export POSTGRES_PASSWORD="kanban_password"
export MULTI_TENANT="true"

# Run the migration script
node "${MIGRATION_SCRIPT}" --tenant-id "${TENANT_ID}"

MIGRATION_EXIT_CODE=$?

if [ $MIGRATION_EXIT_CODE -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
    echo ""
    echo "📋 Next Steps:"
    echo "   1. Verify the data in PostgreSQL:"
    echo "      kubectl exec -it -n ${NAMESPACE} deployment/postgres -- psql -U kanban -d easykanban -c \"\\dn\""
    echo "      kubectl exec -it -n ${NAMESPACE} deployment/postgres -- psql -U kanban -d easykanban -c \"SET search_path TO ${TENANT_ID}; \\dt\""
    echo ""
    echo "   2. Test the application:"
    echo "      Visit: https://${TENANT_ID}.ezkan.cloud"
    echo ""
    echo "   3. If everything looks good, you can switch traffic to PostgreSQL"
else
    echo ""
    echo "❌ Migration failed with exit code: ${MIGRATION_EXIT_CODE}"
    exit 1
fi
