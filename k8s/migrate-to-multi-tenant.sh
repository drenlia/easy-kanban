#!/bin/bash

# Migration script to move a self-hosted database to multi-tenant setup
# 
# This script moves the database file and associated files from single-tenant
# paths to tenant-specific paths. NO database schema changes are required.
#
# Usage: ./migrate-to-multi-tenant.sh <tenant-id> [options]

set -e

TENANT_ID="$1"
NAMESPACE="easy-kanban"

if [ -z "$TENANT_ID" ]; then
    echo "❌ Error: Tenant ID is required"
    echo ""
    echo "Usage: $0 <tenant-id> [options]"
    echo ""
    echo "This script moves your existing single-tenant database from:"
    echo "  /data/easy-kanban-pv/easy-kanban-<tenant-id>-data/kanban.db"
    echo "To the new multi-tenant NFS structure:"
    echo "  /data/nfs-server/data/tenants/<tenant-id>/kanban.db"
    echo ""
    echo "No database schema changes are needed - it's just a file move!"
    echo ""
    echo "Example: To migrate 'amanda' tenant:"
    echo "  $0 amanda"
    echo ""
    echo "Options:"
    echo "  --dry-run          Show what would be done without making changes"
    echo "  --skip-attachments Skip migrating attachments directory"
    echo "  --skip-avatars     Skip migrating avatars directory"
    echo ""
    echo "Example:"
    echo "  $0 mycompany"
    echo "  $0 mycompany --dry-run"
    exit 1
fi

# Validate tenant ID format (must match regex: ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$)
if ! [[ "$TENANT_ID" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]]; then
    echo "❌ Error: Invalid tenant ID format"
    echo "   Tenant ID must be lowercase alphanumeric with optional hyphens"
    echo "   Examples: 'mycompany', 'customer-1', 'tenant123'"
    exit 1
fi

DRY_RUN=false
SKIP_ATTACHMENTS=false
SKIP_AVATARS=false

# Parse options
shift
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --skip-attachments)
            SKIP_ATTACHMENTS=true
            shift
            ;;
        --skip-avatars)
            SKIP_AVATARS=true
            shift
            ;;
        *)
            echo "❌ Unknown option: $1"
            exit 1
            ;;
    esac
done

echo "🚀 Moving self-hosted database to multi-tenant location"
echo "   Tenant ID: $TENANT_ID"
echo "   Namespace: $NAMESPACE"
echo "   Note: No database schema changes needed - just moving files!"
if [ "$DRY_RUN" = true ]; then
    echo "   Mode: DRY RUN (no changes will be made)"
fi
echo ""

# Verify NFS server is accessible
if [ ! -d "/data/nfs-server" ]; then
    echo "❌ Error: NFS server directory not found at /data/nfs-server"
    echo "   Make sure you're running this on the Kubernetes host where NFS is mounted"
    exit 1
fi

echo "✅ NFS server directory found at /data/nfs-server"
echo ""

# Define paths
# Old single-tenant structure: /data/easy-kanban-pv/easy-kanban-{tenant-id}-{type}/
OLD_DB_PATH="/data/easy-kanban-pv/easy-kanban-${TENANT_ID}-data/kanban.db"
OLD_ATTACHMENTS_DIR="/data/easy-kanban-pv/easy-kanban-${TENANT_ID}-attachments"
OLD_AVATARS_DIR="/data/easy-kanban-pv/easy-kanban-${TENANT_ID}-avatars"

# New multi-tenant NFS structure: /data/nfs-server/{type}/tenants/{tenant-id}/
NEW_DB_DIR="/data/nfs-server/data/tenants/$TENANT_ID"
NEW_DB_PATH="$NEW_DB_DIR/kanban.db"
NEW_ATTACHMENTS_DIR="/data/nfs-server/attachments/tenants/$TENANT_ID"
NEW_AVATARS_DIR="/data/nfs-server/avatars/tenants/$TENANT_ID"

# Check if old database exists (on the host, not in pod)
echo "📋 Checking for old single-tenant database..."
if [ ! -f "$OLD_DB_PATH" ]; then
    echo "❌ Error: Database not found at $OLD_DB_PATH"
    echo "   Make sure the tenant ID is correct and the old database exists"
    echo "   Expected path: /data/easy-kanban-pv/easy-kanban-${TENANT_ID}-data/kanban.db"
    exit 1
fi

echo "✅ Found old database at: $OLD_DB_PATH"
echo ""

# Check if tenant database already exists (on the host, not in pod)
if [ -f "$NEW_DB_PATH" ]; then
    echo "⚠️  Warning: Tenant database already exists at $NEW_DB_PATH"
    read -p "   Do you want to overwrite it? (yes/no): " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
        echo "❌ Migration cancelled"
        exit 1
    fi
fi

# Migration steps (just file moves, no schema changes)
echo "📦 Steps (file moves only, no database schema changes):"
echo "   1. Create tenant directory: $NEW_DB_DIR"
echo "   2. Copy database file: $OLD_DB_PATH -> $NEW_DB_PATH"
if [ "$SKIP_ATTACHMENTS" = false ]; then
    echo "   3. Copy attachments: $OLD_ATTACHMENTS_DIR -> $NEW_ATTACHMENTS_DIR"
fi
if [ "$SKIP_AVATARS" = false ]; then
    echo "   4. Copy avatars: $OLD_AVATARS_DIR -> $NEW_AVATARS_DIR"
fi
echo ""

if [ "$DRY_RUN" = true ]; then
    echo "🔍 DRY RUN - Would execute the following commands:"
    echo ""
    echo "   mkdir -p $NEW_DB_DIR"
    echo "   cp $OLD_DB_PATH $NEW_DB_PATH"
    if [ "$SKIP_ATTACHMENTS" = false ]; then
        echo "   mkdir -p $NEW_ATTACHMENTS_DIR"
        echo "   cp -r $OLD_ATTACHMENTS_DIR/* $NEW_ATTACHMENTS_DIR/ 2>/dev/null || true"
    fi
    if [ "$SKIP_AVATARS" = false ]; then
        echo "   mkdir -p $NEW_AVATARS_DIR"
        echo "   cp -r $OLD_AVATARS_DIR/* $NEW_AVATARS_DIR/ 2>/dev/null || true"
    fi
    echo ""
    echo "✅ Dry run complete. Run without --dry-run to execute migration."
    exit 0
fi

# Confirm migration
read -p "⚠️  This will copy your database and files. Continue? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "❌ Migration cancelled"
    exit 1
fi

echo ""
echo "🔄 Starting migration..."
echo ""

# Step 1: Create tenant directory
echo "📁 Step 1: Creating tenant directory..."
mkdir -p "$NEW_DB_DIR"
echo "   ✅ Created: $NEW_DB_DIR"
echo ""

# Step 2: Copy database
echo "💾 Step 2: Copying database..."
cp "$OLD_DB_PATH" "$NEW_DB_PATH"
DB_SIZE=$(stat -f%z "$NEW_DB_PATH" 2>/dev/null || stat -c%s "$NEW_DB_PATH" 2>/dev/null || echo "unknown")
echo "   ✅ Database copied: $NEW_DB_PATH (size: $DB_SIZE bytes)"
echo ""

# Step 3: Migrate attachments (if not skipped)
if [ "$SKIP_ATTACHMENTS" = false ]; then
    echo "📎 Step 3: Migrating attachments..."
    if [ -d "$OLD_ATTACHMENTS_DIR" ]; then
        mkdir -p "$NEW_ATTACHMENTS_DIR"
        # Copy files (ignore errors if directory is empty)
        cp -r "$OLD_ATTACHMENTS_DIR"/* "$NEW_ATTACHMENTS_DIR/" 2>/dev/null || true
        ATTACHMENT_COUNT=$(find "$NEW_ATTACHMENTS_DIR" -type f 2>/dev/null | wc -l | tr -d ' ')
        echo "   ✅ Attachments migrated: $NEW_ATTACHMENTS_DIR ($ATTACHMENT_COUNT files)"
    else
        echo "   ℹ️  No attachments directory found at $OLD_ATTACHMENTS_DIR, skipping"
    fi
    echo ""
fi

# Step 4: Migrate avatars (if not skipped)
if [ "$SKIP_AVATARS" = false ]; then
    echo "👤 Step 4: Migrating avatars..."
    if [ -d "$OLD_AVATARS_DIR" ]; then
        mkdir -p "$NEW_AVATARS_DIR"
        # Copy files (ignore errors if directory is empty)
        cp -r "$OLD_AVATARS_DIR"/* "$NEW_AVATARS_DIR/" 2>/dev/null || true
        AVATAR_COUNT=$(find "$NEW_AVATARS_DIR" -type f 2>/dev/null | wc -l | tr -d ' ')
        echo "   ✅ Avatars migrated: $NEW_AVATARS_DIR ($AVATAR_COUNT files)"
    else
        echo "   ℹ️  No avatars directory found at $OLD_AVATARS_DIR, skipping"
    fi
    echo ""
fi

echo "✅ File migration complete!"
echo ""
echo "📋 Next steps:"
echo ""
echo "   1. Create an ingress rule for this tenant (points to shared pods):"
echo "      ./k8s/deploy-instance.sh $TENANT_ID basic"
echo ""
echo "      This will:"
echo "      - Create ingress rule: easy-kanban-ingress-${TENANT_ID}"
echo "      - Route ${TENANT_ID}.ezkan.cloud -> shared easy-kanban service"
echo "      - The shared pods will automatically use the migrated database"
echo ""
echo "   ⚠️  IMPORTANT - Update External Reverse Proxy:"
echo "      Update your nginx reverse proxy vhost for ${TENANT_ID}.ezkan.cloud"
echo "      to use the multi-tenant instance's NodePort instead of the old"
echo "      self-contained instance's port."
echo "      "
echo "      Get the correct NodePort:"
echo "      kubectl get service easy-kanban-nodeport -n easy-kanban -o jsonpath='{.spec.ports[?(@.name==\"frontend\")].nodePort}'"
echo "      "
echo "      Example nginx config:"
echo "        proxy_pass http://<k8s-node-ip>:<nodeport-from-command-above>;"
echo "      "
echo "      Then reload nginx: sudo systemctl reload nginx"
echo "      "
echo "      ⚠️  WARNING: The old instance (easy-kanban-${TENANT_ID}) is still running!"
echo "      Make sure your reverse proxy points to the NEW port, or you'll have"
echo "      data split between old and new databases."
echo ""
echo "   ⚠️  IMPORTANT - Update Admin Portal Instance Token:"
echo "      The new multi-tenant instance uses a shared INSTANCE_TOKEN."
echo "      Update the instance token in your admin portal database to match"
echo "      the token used by other multi-tenant instances (app, amanda, etc.)."
echo "      "
echo "      You can get the current token with:"
echo "      kubectl get configmap easy-kanban-config -n easy-kanban -o jsonpath='{.data.INSTANCE_TOKEN}'"
echo ""
echo "   2. Verify the migration works:"
echo "      - Access: https://${TENANT_ID}.ezkan.cloud"
echo "      - Check that your data is present"
echo "      - Verify tasks/updates persist (old instance should be stopped)"
echo ""
echo "   3. Delete the old single-tenant namespace (after verification):"
echo "      kubectl delete namespace easy-kanban-${TENANT_ID}"
echo ""
echo "      This will delete:"
echo "      - Old pod (easy-kanban-${TENANT_ID}-*)"
echo "      - Old ingress (easy-kanban-${TENANT_ID}-ingress)"
echo "      - Old namespace (easy-kanban-${TENANT_ID})"
echo "      - Old NodePort service (prevents port conflicts)"
echo ""
echo "   4. Clean up old files (after verification):"
echo "      rm -rf /data/easy-kanban-pv/easy-kanban-${TENANT_ID}-*"
echo ""
echo "⚠️  Important: Make sure MULTI_TENANT=true is set in your ConfigMap"
echo "   and that TENANT_DOMAIN is configured correctly (e.g., ezkan.cloud)"
echo ""
echo "ℹ️  How it works:"
echo "   - The shared pods in 'easy-kanban' namespace will extract tenant ID"
echo "     from the hostname (${TENANT_ID}.ezkan.cloud)"
echo "   - They'll automatically load the database from:"
echo "     /data/nfs-server/data/tenants/${TENANT_ID}/kanban.db"
echo "   - No pod deletion needed - the shared pods handle all tenants!"
echo ""

