#!/bin/bash

# Destroy Easy Kanban PostgreSQL instance (ingress + PostgreSQL schema + tenant data from shared NFS)
# Usage: ./destroy-instance-pg.sh <instance_name>
# 
# Note: In multi-tenant mode, all instances share:
#   - The same namespace (easy-kanban-pg)
#   - The same deployment (easy-kanban)
#   - The same PostgreSQL database (different schemas per tenant)
#   - The same NFS persistent volumes (for attachments and avatars)
# Each instance only has:
#   - Its own ingress rule (easy-kanban-ingress-${INSTANCE_NAME})
#   - Its own PostgreSQL schema (tenant_${INSTANCE_NAME})
#   - Its own tenant data in NFS subdirectories (attachments, avatars)

set -e

# Check if instance name is provided
if [ $# -eq 0 ]; then
    echo "❌ Error: Instance name is required"
    echo "Usage: $0 <instance_name>"
    echo ""
    echo "Examples:"
    echo "  $0 app-pg"
    echo "  $0 develop"
    exit 1
fi

INSTANCE_NAME="$1"
# Shared namespace for all PostgreSQL tenants
NAMESPACE="easy-kanban-pg"
INGRESS_NAME="easy-kanban-ingress-${INSTANCE_NAME}"
# PostgreSQL schema name (quoted to handle hyphens)
SCHEMA_NAME="tenant_${INSTANCE_NAME}"
QUOTED_SCHEMA_NAME="\"${SCHEMA_NAME}\""

echo "💥 Destroying Easy Kanban PostgreSQL instance: ${INSTANCE_NAME}"
echo "📍 Namespace: ${NAMESPACE} (shared)"
echo "🗄️  PostgreSQL schema: ${SCHEMA_NAME}"
echo ""

# Check if ingress exists
if ! kubectl get ingress "${INGRESS_NAME}" -n "${NAMESPACE}" >/dev/null 2>&1; then
    echo "⚠️  Ingress '${INGRESS_NAME}' does not exist"
else
    echo "📋 Ingress rule that will be removed:"
    kubectl get ingress "${INGRESS_NAME}" -n "${NAMESPACE}" 2>/dev/null || echo "  No ingress found"
    echo ""
fi

# Check if PostgreSQL schema exists
echo "🗄️  Checking PostgreSQL schema..."
POSTGRES_POD=$(kubectl get pod -n "${NAMESPACE}" -l app=postgres -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
POSTGRES_PASSWORD="kanban_password"  # Hardcoded to match deploy-pg.sh
if [ -n "$POSTGRES_POD" ]; then
    SCHEMA_EXISTS=$(kubectl exec -n "${NAMESPACE}" "$POSTGRES_POD" -- env PGPASSWORD="${POSTGRES_PASSWORD}" psql -U kanban -d easykanban -tAc "SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = '${SCHEMA_NAME}');" 2>/dev/null || echo "false")
    if [ "$SCHEMA_EXISTS" = "t" ]; then
        echo "   ✅ Schema '${SCHEMA_NAME}' exists in PostgreSQL"
    else
        echo "   ℹ️  Schema '${SCHEMA_NAME}' does not exist in PostgreSQL"
    fi
else
    echo "   ⚠️  PostgreSQL pod not found, cannot check schema"
fi

# Show tenant data directories that will be removed
# NFS server stores data at /data/nfs-server, which is mounted to /exports/* in the container
# Tenant data is in subdirectories: tenants/${INSTANCE_NAME}/
# Note: NFS server is in easy-kanban namespace, not easy-kanban-pg
NFS_NAMESPACE="easy-kanban"
NFS_BASE="/data/nfs-server"
ATTACHMENTS_DIR="${NFS_BASE}/attachments/tenants/${INSTANCE_NAME}"
AVATARS_DIR="${NFS_BASE}/avatars/tenants/${INSTANCE_NAME}"

echo ""
echo "📁 Tenant data directories that will be removed:"
if [ -d "$ATTACHMENTS_DIR" ]; then
    echo "  - ${ATTACHMENTS_DIR} ($(du -sh "$ATTACHMENTS_DIR" 2>/dev/null | cut -f1 || echo "unknown size"))"
else
    echo "  - ${ATTACHMENTS_DIR} (not found)"
fi

if [ -d "$AVATARS_DIR" ]; then
    echo "  - ${AVATARS_DIR} ($(du -sh "$AVATARS_DIR" 2>/dev/null | cut -f1 || echo "unknown size"))"
else
    echo "  - ${AVATARS_DIR} (not found)"
fi

echo ""

# Show warning but proceed without confirmation (for admin portal use)
echo "⚠️  WARNING: Permanently deleting ALL data for instance '${INSTANCE_NAME}'!"
echo "   - Ingress rule for this tenant"
echo "   - PostgreSQL schema (tenant_${INSTANCE_NAME}) and all its data"
echo "   - All tenant data (attachments, avatars)"
echo "   - This action CANNOT be undone!"
echo ""
echo "ℹ️  Note: Shared resources (namespace, deployment, PostgreSQL database, NFS volumes) will NOT be deleted"
echo ""

echo "💥 Destroying instance..."

# Track if anything was actually deleted
INGRESS_DELETED=false
SCHEMA_DELETED=false
ATTACHMENTS_DELETED=false
AVATARS_DELETED=false

# Step 1: Delete ingress rule for this tenant
if kubectl get ingress "${INGRESS_NAME}" -n "${NAMESPACE}" >/dev/null 2>&1; then
    echo "🗑️  Deleting ingress rule '${INGRESS_NAME}'..."
    kubectl delete ingress "${INGRESS_NAME}" -n "${NAMESPACE}"
    echo "   ✅ Ingress rule deleted"
    INGRESS_DELETED=true
else
    echo "⚠️  Ingress '${INGRESS_NAME}' does not exist, skipping..."
fi

# Step 2: Drop PostgreSQL schema
echo ""
echo "🗄️  Dropping PostgreSQL schema '${SCHEMA_NAME}'..."

if [ -z "$POSTGRES_POD" ]; then
    echo "   ⚠️  PostgreSQL pod not found, cannot drop schema"
else
    # Check if schema exists before attempting to drop
    SCHEMA_EXISTS=$(kubectl exec -n "${NAMESPACE}" "$POSTGRES_POD" -- env PGPASSWORD="${POSTGRES_PASSWORD}" psql -U kanban -d easykanban -tAc "SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = '${SCHEMA_NAME}');" 2>/dev/null || echo "false")
    
    if [ "$SCHEMA_EXISTS" = "t" ]; then
        echo "   Dropping schema ${QUOTED_SCHEMA_NAME}..."
        DROP_RESULT=$(kubectl exec -n "${NAMESPACE}" "$POSTGRES_POD" -- env PGPASSWORD="${POSTGRES_PASSWORD}" psql -U kanban -d easykanban -c "DROP SCHEMA IF EXISTS ${QUOTED_SCHEMA_NAME} CASCADE;" 2>&1)
        
        if echo "$DROP_RESULT" | grep -q "DROP SCHEMA" || echo "$DROP_RESULT" | grep -q "does not exist"; then
            echo "   ✅ Schema dropped successfully"
            SCHEMA_DELETED=true
        else
            echo "   ⚠️  Failed to drop schema:"
            echo "$DROP_RESULT" | sed 's/^/      /'
        fi
    else
        echo "   ℹ️  Schema '${SCHEMA_NAME}' does not exist, skipping..."
    fi
fi

# Step 3: Remove tenant data directories from NFS (attachments and avatars)
echo ""
echo "🗑️  Removing tenant data directories from NFS..."

# Try to delete via NFS server pod (preferred method - works from anywhere)
# Note: NFS server is in easy-kanban namespace, not easy-kanban-pg
NFS_POD=$(kubectl get pod -n "${NFS_NAMESPACE}" -l app=nfs-server -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

if [ -n "$NFS_POD" ]; then
    echo "   Using NFS server pod: $NFS_POD (namespace: ${NFS_NAMESPACE})"
    
    # Delete attachments directory
    echo "   Removing: /exports/attachments/tenants/${INSTANCE_NAME}"
    DELETE_RESULT=$(kubectl exec -n "${NFS_NAMESPACE}" "$NFS_POD" -- sh -c "
        if [ -d /exports/attachments/tenants/${INSTANCE_NAME} ]; then
            rm -rf /exports/attachments/tenants/${INSTANCE_NAME} && echo 'deleted'
        else
            echo 'notfound'
        fi
    " 2>/dev/null || echo "failed")
    
    if [ "$DELETE_RESULT" = "deleted" ]; then
        echo "      ✅ Deleted successfully"
        ATTACHMENTS_DELETED=true
    elif [ "$DELETE_RESULT" = "notfound" ]; then
        echo "      ℹ️  Directory not found"
    else
        echo "      ⚠️  Failed to delete attachments directory"
    fi
    
    # Delete avatars directory
    echo "   Removing: /exports/avatars/tenants/${INSTANCE_NAME}"
    DELETE_RESULT=$(kubectl exec -n "${NFS_NAMESPACE}" "$NFS_POD" -- sh -c "
        if [ -d /exports/avatars/tenants/${INSTANCE_NAME} ]; then
            rm -rf /exports/avatars/tenants/${INSTANCE_NAME} && echo 'deleted'
        else
            echo 'notfound'
        fi
    " 2>/dev/null || echo "failed")
    
    if [ "$DELETE_RESULT" = "deleted" ]; then
        echo "      ✅ Deleted successfully"
        AVATARS_DELETED=true
    elif [ "$DELETE_RESULT" = "notfound" ]; then
        echo "      ℹ️  Directory not found"
    else
        echo "      ⚠️  Failed to delete avatars directory"
    fi
    
    # Verify deletion
    echo "   Verifying deletion..."
    VERIFY_RESULT=$(kubectl exec -n "${NFS_NAMESPACE}" "$NFS_POD" -- sh -c "
        if [ ! -d /exports/attachments/tenants/${INSTANCE_NAME} ] && \
           [ ! -d /exports/avatars/tenants/${INSTANCE_NAME} ]; then
            echo 'success'
        else
            echo 'partial'
        fi
    " 2>/dev/null || echo "failed")
    
    if [ "$VERIFY_RESULT" = "success" ]; then
        echo "   ✅ All tenant directories deleted successfully"
    elif [ "$VERIFY_RESULT" = "partial" ]; then
        echo "   ⚠️  Some directories may still exist"
    else
        echo "   ⚠️  Could not verify deletion"
    fi
else
    # Fallback: Try direct host path deletion (requires sudo and running on NFS node)
    echo "   ⚠️  NFS server pod not found, trying direct host path deletion..."
    echo "   ⚠️  Note: This requires passwordless sudo and must run on NFS server node"
    
    if [ -d "$ATTACHMENTS_DIR" ]; then
        echo "   Removing: $ATTACHMENTS_DIR"
        if sudo -n rm -rf "$ATTACHMENTS_DIR" 2>/dev/null; then
            echo "      ✅ Deleted successfully"
            ATTACHMENTS_DELETED=true
        else
            echo "      ⚠️  Failed to remove: $ATTACHMENTS_DIR (may require sudo password or wrong node)"
        fi
    else
        echo "   Directory not found: $ATTACHMENTS_DIR"
    fi
    
    if [ -d "$AVATARS_DIR" ]; then
        echo "   Removing: $AVATARS_DIR"
        if sudo -n rm -rf "$AVATARS_DIR" 2>/dev/null; then
            echo "      ✅ Deleted successfully"
            AVATARS_DELETED=true
        else
            echo "      ⚠️  Failed to remove: $AVATARS_DIR (may require sudo password or wrong node)"
        fi
    else
        echo "   Directory not found: $AVATARS_DIR"
    fi
fi

echo ""

# Check if anything was actually deleted
if [ "$INGRESS_DELETED" = false ] && [ "$SCHEMA_DELETED" = false ] && [ "$ATTACHMENTS_DELETED" = false ] && [ "$AVATARS_DELETED" = false ]; then
    echo "ℹ️  Nothing to do - instance '${INSTANCE_NAME}' does not exist or was already destroyed."
    echo "   - Ingress rule does not exist"
    echo "   - PostgreSQL schema does not exist"
    echo "   - No tenant data directories found"
    exit 0
fi

echo "✅ Instance '${INSTANCE_NAME}' destruction process completed!"
echo ""
echo "📋 What was removed:"
if [ "$INGRESS_DELETED" = true ]; then
    echo "  - Ingress rule: ${INGRESS_NAME}"
fi
if [ "$SCHEMA_DELETED" = true ]; then
    echo "  - PostgreSQL schema: ${SCHEMA_NAME} (and all its data)"
fi
if [ "$ATTACHMENTS_DELETED" = true ]; then
    if [ -n "$NFS_POD" ]; then
        echo "  - Tenant attachments: /exports/attachments/tenants/${INSTANCE_NAME}"
    else
        echo "  - Tenant attachments: ${ATTACHMENTS_DIR}"
    fi
fi
if [ "$AVATARS_DELETED" = true ]; then
    if [ -n "$NFS_POD" ]; then
        echo "  - Tenant avatars: /exports/avatars/tenants/${INSTANCE_NAME}"
    else
        echo "  - Tenant avatars: ${AVATARS_DIR}"
    fi
fi
echo ""
echo "🎯 The instance and all its data have been permanently deleted."
