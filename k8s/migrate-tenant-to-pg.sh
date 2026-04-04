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
# Hostname for migrated PG tenant: https://${TENANT_ID}.${TENANT_DOMAIN}/...
TENANT_DOMAIN="${TENANT_DOMAIN:-ezkan.cloud}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# If GOOGLE_CALLBACK_URL was migrated from SQLite, rewrite its host to the PG tenant host
# (e.g. drenlia.ezkan.cloud → drenlia-pg.ezkan.cloud when TENANT_ID=drenlia-pg).
rewrite_google_callback_url_for_pg_tenant() {
    local schema_q="\"tenant_${TENANT_ID}\""
    local current
    current=$(kubectl exec -n "${NAMESPACE}" deployment/postgres -- psql -U kanban -d easykanban -tAc \
        "SELECT COALESCE(value, '') FROM ${schema_q}.settings WHERE key = 'GOOGLE_CALLBACK_URL' LIMIT 1;" 2>/dev/null \
        | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

    if [ -z "$current" ]; then
        echo "   ℹ️  GOOGLE_CALLBACK_URL is empty — skipping OAuth callback host rewrite"
        return 0
    fi

    local new_host="${TENANT_ID}.${TENANT_DOMAIN}"
    local new_url=""

    if command -v python3 >/dev/null 2>&1; then
        new_url=$(python3 -c "
import urllib.parse
import sys
u = urllib.parse.urlparse(sys.argv[1])
print(urllib.parse.urlunparse((u.scheme, sys.argv[2], u.path, u.params, u.query, u.fragment)))
" "$current" "$new_host" 2>/dev/null) || new_url=""
    fi
    if [ -z "$new_url" ]; then
        new_url=$(echo "$current" | sed -E "s#^(https?://)[^/?#]+#\1${new_host}#") || true
    fi

    if [ -z "$new_url" ] || [ "$new_url" = "$current" ]; then
        if [ "$new_url" = "$current" ]; then
            echo "   ℹ️  GOOGLE_CALLBACK_URL already targets ${new_host}"
        fi
        return 0
    fi

    echo "   🔗 Rewriting GOOGLE_CALLBACK_URL for PostgreSQL tenant host:"
    echo "      was: ${current}"
    echo "      now: ${new_url}"

    local esc="${new_url//\'/\'\'}"
    if kubectl exec -n "${NAMESPACE}" deployment/postgres -- psql -U kanban -d easykanban -c \
        "UPDATE ${schema_q}.settings SET value = '${esc}', updated_at = CURRENT_TIMESTAMP WHERE key = 'GOOGLE_CALLBACK_URL';" \
        >/dev/null 2>&1; then
        echo "   ✅ Updated GOOGLE_CALLBACK_URL"
    else
        echo "   ⚠️  Failed to update GOOGLE_CALLBACK_URL (run psql manually)"
    fi
}

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
echo "   OAuth callback host: ${TENANT_ID}.${TENANT_DOMAIN} (when GOOGLE_CALLBACK_URL is set)"
echo "   SQLite DB: ${SQLITE_BACKUP_PATH}"
echo "   PostgreSQL: postgres.easy-kanban-pg.svc.cluster.local:5432"
echo "   Database: easykanban"
echo "   PostgreSQL schema: tenant_${TENANT_ID}"
echo ""

# Check if migration script exists
MIGRATION_SCRIPT="${PROJECT_ROOT}/scripts/migrate-sqlite-to-postgres.js"
if [ ! -f "$MIGRATION_SCRIPT" ]; then
    echo "❌ Error: Migration script not found: ${MIGRATION_SCRIPT}"
    exit 1
fi

# Get an app pod to run the migration in
echo "🔍 Finding an app pod to run migration..."
APP_POD=$(kubectl get pod -n "${NAMESPACE}" -l app=easy-kanban -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

if [ -z "$APP_POD" ]; then
    echo "❌ Error: No app pods found in namespace ${NAMESPACE}"
    echo "   Please ensure the application is deployed first:"
    echo "   ./k8s/deploy-instance-pg.sh ${TENANT_ID} basic"
    exit 1
fi

echo "   ✅ Found pod: ${APP_POD}"
echo ""

# Copy SQLite backup file into the pod
# The migration script expects it at: /app/server/data/tenants/${TENANT_ID}/kanban.db
# OR we can use SQLITE_DB_PATH env var to override
echo "📤 Copying SQLite backup into pod..."
BACKUP_FILENAME=$(basename "$SQLITE_BACKUP_PATH")

# Create the tenant directory structure expected by the migration script
TENANT_DATA_DIR="/app/server/data/tenants/${TENANT_ID}"
POD_BACKUP_PATH="${TENANT_DATA_DIR}/kanban.db"

# Create tenant directory in pod if it doesn't exist
kubectl exec -n "${NAMESPACE}" "${APP_POD}" -- mkdir -p "${TENANT_DATA_DIR}"

# Copy the backup file to the expected location
kubectl cp "${SQLITE_BACKUP_PATH}" "${NAMESPACE}/${APP_POD}:${POD_BACKUP_PATH}" || {
    echo "❌ Error: Failed to copy backup file into pod"
    exit 1
}

echo "   ✅ Backup file copied to pod: ${POD_BACKUP_PATH}"
echo ""

# Copy migration script into the pod (use /app/scripts to match project structure)
echo "📤 Copying migration script into pod..."
POD_SCRIPT_PATH="/app/scripts/migrate-sqlite-to-postgres.js"

# Ensure scripts directory exists
kubectl exec -n "${NAMESPACE}" "${APP_POD}" -- mkdir -p /app/scripts

kubectl cp "${MIGRATION_SCRIPT}" "${NAMESPACE}/${APP_POD}:${POD_SCRIPT_PATH}" || {
    echo "❌ Error: Failed to copy migration script into pod"
    exit 1
}

echo "   ✅ Migration script copied to pod: ${POD_SCRIPT_PATH}"
echo ""

# Run migration script inside the pod
echo "🔄 Running migration script inside pod..."
echo ""

# Set environment variables and run migration in the pod
# Use PostgreSQL service name directly (no port-forward needed)
# Run from /app directory so node_modules resolution works correctly
# Note: SQLITE_DB_PATH is ignored when isMultiTenant && tenantId is true,
# so we copy the file to the expected location: /app/server/data/tenants/${TENANT_ID}/kanban.db
# Run migration script with --skip-confirm flag to avoid interactive prompt
kubectl exec -n "${NAMESPACE}" "${APP_POD}" -- sh -c "cd /app && env \
    POSTGRES_HOST=\"postgres.easy-kanban-pg.svc.cluster.local\" \
    POSTGRES_PORT=\"5432\" \
    POSTGRES_DB=\"easykanban\" \
    POSTGRES_USER=\"kanban\" \
    POSTGRES_PASSWORD=\"kanban_password\" \
    MULTI_TENANT=\"true\" \
    node \"${POD_SCRIPT_PATH}\" --tenant-id \"${TENANT_ID}\" --skip-confirm"

MIGRATION_EXIT_CODE=$?

# Copy attachments and avatars from source tenant to target tenant
if [ $MIGRATION_EXIT_CODE -eq 0 ]; then
    echo ""
    echo "🔗 OAuth callback URL (if migrated from SQLite)..."
    rewrite_google_callback_url_for_pg_tenant

    echo ""
    echo "📁 Copying attachments and avatars from source tenant to target tenant..."
    
    # Determine source tenant (remove -pg suffix if present)
    # For develop-pg, source is develop
    SOURCE_TENANT=$(echo "${TENANT_ID}" | sed 's/-pg$//')
    
    # Get NFS pod
    NFS_NAMESPACE="easy-kanban"
    NFS_POD=$(kubectl get pod -n "${NFS_NAMESPACE}" -l app=nfs-server -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
    
    if [ -n "$NFS_POD" ]; then
        # Copy attachments
        echo "   📎 Copying attachments from ${SOURCE_TENANT} to ${TENANT_ID}..."
        SOURCE_ATTACHMENTS="/exports/attachments/tenants/${SOURCE_TENANT}"
        TARGET_ATTACHMENTS="/exports/attachments/tenants/${TENANT_ID}"
        
        if kubectl exec -n "${NFS_NAMESPACE}" "${NFS_POD}" -- test -d "${SOURCE_ATTACHMENTS}" 2>/dev/null; then
            kubectl exec -n "${NFS_NAMESPACE}" "${NFS_POD}" -- sh -c "mkdir -p ${TARGET_ATTACHMENTS} && cp -r ${SOURCE_ATTACHMENTS}/* ${TARGET_ATTACHMENTS}/ 2>/dev/null || true"
            ATTACHMENT_COUNT=$(kubectl exec -n "${NFS_NAMESPACE}" "${NFS_POD}" -- sh -c "find ${TARGET_ATTACHMENTS} -type f 2>/dev/null | wc -l" 2>/dev/null || echo "0")
            echo "      ✅ Copied attachments (${ATTACHMENT_COUNT} files)"
        else
            echo "      ⚠️  Source attachments directory not found, skipping"
        fi
        
        # Copy avatars
        echo "   👤 Copying avatars from ${SOURCE_TENANT} to ${TENANT_ID}..."
        SOURCE_AVATARS="/exports/avatars/tenants/${SOURCE_TENANT}"
        TARGET_AVATARS="/exports/avatars/tenants/${TENANT_ID}"
        
        if kubectl exec -n "${NFS_NAMESPACE}" "${NFS_POD}" -- test -d "${SOURCE_AVATARS}" 2>/dev/null; then
            kubectl exec -n "${NFS_NAMESPACE}" "${NFS_POD}" -- sh -c "mkdir -p ${TARGET_AVATARS} && cp -r ${SOURCE_AVATARS}/* ${TARGET_AVATARS}/ 2>/dev/null || true"
            AVATAR_COUNT=$(kubectl exec -n "${NFS_NAMESPACE}" "${NFS_POD}" -- sh -c "find ${TARGET_AVATARS} -type f 2>/dev/null | wc -l" 2>/dev/null || echo "0")
            echo "      ✅ Copied avatars (${AVATAR_COUNT} files)"
        else
            echo "      ⚠️  Source avatars directory not found, skipping"
        fi
    else
        echo "   ⚠️  NFS pod not found, cannot copy files"
    fi
    echo ""
fi

# Cleanup: Remove temporary files from pod
echo ""
echo "🧹 Cleaning up temporary files in pod..."
kubectl exec -n "${NAMESPACE}" "${APP_POD}" -- sh -c "rm -f ${POD_BACKUP_PATH}" 2>/dev/null || true
# Note: We keep the script in /app/scripts as it might be useful for future migrations
echo "   ✅ Cleanup complete (backup file removed, script kept in /app/scripts)"
echo ""

if [ $MIGRATION_EXIT_CODE -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
    echo ""
    echo "📋 Next Steps:"
    echo "   1. Verify the data in PostgreSQL:"
    echo "      kubectl exec -it -n ${NAMESPACE} deployment/postgres -- psql -U kanban -d easykanban -c \"\\dn\""
    echo "      kubectl exec -it -n ${NAMESPACE} deployment/postgres -- psql -U kanban -d easykanban -c \"SELECT tablename FROM pg_tables WHERE schemaname = 'tenant_${TENANT_ID}' ORDER BY 1;\""
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
