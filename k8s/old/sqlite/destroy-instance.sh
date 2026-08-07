#!/bin/bash

# Destroy Easy Kanban instance (ingress + tenant data from shared NFS)
# Usage: ./destroy-instance.sh <instance_name>
# 
# Note: In multi-tenant mode, all instances share:
#   - The same namespace (easy-kanban)
#   - The same deployment (easy-kanban)
#   - The same NFS persistent volumes
# Each instance only has:
#   - Its own ingress rule (easy-kanban-ingress-${INSTANCE_NAME})
#   - Its own tenant data in NFS subdirectories

set -e

# Check if instance name is provided
if [ $# -eq 0 ]; then
    echo "❌ Error: Instance name is required"
    echo "Usage: $0 <instance_name>"
    echo ""
    echo "Examples:"
    echo "  $0 app"
    echo "  $0 demo1"
    exit 1
fi

INSTANCE_NAME="$1"
# Shared namespace for all tenants
NAMESPACE="easy-kanban"
INGRESS_NAME="easy-kanban-ingress-${INSTANCE_NAME}"

echo "💥 Destroying Easy Kanban instance: ${INSTANCE_NAME}"
echo "📍 Namespace: ${NAMESPACE} (shared)"
echo ""

# Check if ingress exists
if ! kubectl get ingress "${INGRESS_NAME}" -n "${NAMESPACE}" >/dev/null 2>&1; then
    echo "⚠️  Ingress '${INGRESS_NAME}' does not exist"
else
    echo "📋 Ingress rule that will be removed:"
    kubectl get ingress "${INGRESS_NAME}" -n "${NAMESPACE}" 2>/dev/null || echo "  No ingress found"
    echo ""
fi

# Show tenant data directories that will be removed
# NFS server stores data at /data/nfs-server, which is mounted to /exports/* in the container
# Tenant data is in subdirectories: tenants/${INSTANCE_NAME}/
NFS_BASE="/data/nfs-server"
DATA_DIR="${NFS_BASE}/data/tenants/${INSTANCE_NAME}"
ATTACHMENTS_DIR="${NFS_BASE}/attachments/tenants/${INSTANCE_NAME}"
AVATARS_DIR="${NFS_BASE}/avatars/tenants/${INSTANCE_NAME}"

echo "📁 Tenant data directories that will be removed:"
if [ -d "$DATA_DIR" ]; then
    echo "  - ${DATA_DIR} ($(du -sh "$DATA_DIR" 2>/dev/null | cut -f1 || echo "unknown size"))"
else
    echo "  - ${DATA_DIR} (not found)"
fi

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
echo "   - All tenant data (database, attachments, avatars)"
echo "   - This action CANNOT be undone!"
echo ""
echo "ℹ️  Note: Shared resources (namespace, deployment, NFS volumes) will NOT be deleted"
echo ""

echo "💥 Destroying instance..."

# Track if anything was actually deleted
INGRESS_DELETED=false
DATA_DELETED=false
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

# Step 2: Remove tenant data directories from NFS
echo "🗑️  Removing tenant data directories from NFS..."

# Try to delete via NFS server pod (preferred method - works from anywhere)
NFS_POD=$(kubectl get pod -n "${NAMESPACE}" -l app=nfs-server -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

if [ -n "$NFS_POD" ]; then
    echo "   Using NFS server pod: $NFS_POD"
    
    # Delete data directory
    echo "   Removing: /exports/data/tenants/${INSTANCE_NAME}"
    DELETE_RESULT=$(kubectl exec -n "${NAMESPACE}" "$NFS_POD" -- sh -c "
        if [ -d /exports/data/tenants/${INSTANCE_NAME} ]; then
            rm -rf /exports/data/tenants/${INSTANCE_NAME} && echo 'deleted'
        else
            echo 'notfound'
        fi
    " 2>/dev/null || echo "failed")
    
    if [ "$DELETE_RESULT" = "deleted" ]; then
        echo "      ✅ Deleted successfully"
        DATA_DELETED=true
    elif [ "$DELETE_RESULT" = "notfound" ]; then
        echo "      ℹ️  Directory not found"
    else
        echo "      ⚠️  Failed to delete data directory"
    fi
    
    # Delete attachments directory
    echo "   Removing: /exports/attachments/tenants/${INSTANCE_NAME}"
    DELETE_RESULT=$(kubectl exec -n "${NAMESPACE}" "$NFS_POD" -- sh -c "
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
    DELETE_RESULT=$(kubectl exec -n "${NAMESPACE}" "$NFS_POD" -- sh -c "
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
    VERIFY_RESULT=$(kubectl exec -n "${NAMESPACE}" "$NFS_POD" -- sh -c "
        if [ ! -d /exports/data/tenants/${INSTANCE_NAME} ] && \
           [ ! -d /exports/attachments/tenants/${INSTANCE_NAME} ] && \
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
    
    if [ -d "$DATA_DIR" ]; then
        echo "   Removing: $DATA_DIR"
        if sudo -n rm -rf "$DATA_DIR" 2>/dev/null; then
            echo "      ✅ Deleted successfully"
            DATA_DELETED=true
        else
            echo "      ⚠️  Failed to remove: $DATA_DIR (may require sudo password or wrong node)"
        fi
    else
        echo "   Directory not found: $DATA_DIR"
    fi
    
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
if [ "$INGRESS_DELETED" = false ] && [ "$DATA_DELETED" = false ] && [ "$ATTACHMENTS_DELETED" = false ] && [ "$AVATARS_DELETED" = false ]; then
    echo "ℹ️  Nothing to do - instance '${INSTANCE_NAME}' does not exist or was already destroyed."
    echo "   - Ingress rule does not exist"
    echo "   - No tenant data directories found"
    exit 0
fi

echo "✅ Instance '${INSTANCE_NAME}' destruction process completed!"
echo ""
echo "📋 What was removed:"
if [ "$INGRESS_DELETED" = true ]; then
    echo "  - Ingress rule: ${INGRESS_NAME}"
fi
if [ "$DATA_DELETED" = true ]; then
    if [ -n "$NFS_POD" ]; then
        echo "  - Tenant database: /exports/data/tenants/${INSTANCE_NAME}"
    else
        echo "  - Tenant database: ${DATA_DIR}"
    fi
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
