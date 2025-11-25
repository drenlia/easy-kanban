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

# Step 1: Delete ingress rule for this tenant
if kubectl get ingress "${INGRESS_NAME}" -n "${NAMESPACE}" >/dev/null 2>&1; then
    echo "🗑️  Deleting ingress rule '${INGRESS_NAME}'..."
    kubectl delete ingress "${INGRESS_NAME}" -n "${NAMESPACE}"
    echo "   ✅ Ingress rule deleted"
else
    echo "⚠️  Ingress '${INGRESS_NAME}' does not exist, skipping..."
fi

# Step 2: Remove tenant data directories from NFS
echo "🗑️  Removing tenant data directories from NFS..."
if [ -d "$DATA_DIR" ]; then
    echo "  Removing: $DATA_DIR"
    sudo -n rm -rf "$DATA_DIR" || echo "    ⚠️  Failed to remove: $DATA_DIR"
else
    echo "  Directory not found: $DATA_DIR"
fi

if [ -d "$ATTACHMENTS_DIR" ]; then
    echo "  Removing: $ATTACHMENTS_DIR"
    sudo -n rm -rf "$ATTACHMENTS_DIR" || echo "    ⚠️  Failed to remove: $ATTACHMENTS_DIR"
else
    echo "  Directory not found: $ATTACHMENTS_DIR"
fi

if [ -d "$AVATARS_DIR" ]; then
    echo "  Removing: $AVATARS_DIR"
    sudo -n rm -rf "$AVATARS_DIR" || echo "    ⚠️  Failed to remove: $AVATARS_DIR"
else
    echo "  Directory not found: $AVATARS_DIR"
fi

echo ""
echo "✅ Instance '${INSTANCE_NAME}' completely destroyed!"
echo ""
echo "📋 What was removed:"
echo "  - Ingress rule: ${INGRESS_NAME}"
echo "  - Tenant database: ${DATA_DIR}"
echo "  - Tenant attachments: ${ATTACHMENTS_DIR}"
echo "  - Tenant avatars: ${AVATARS_DIR}"
echo ""
echo "ℹ️  What was preserved (shared resources):"
echo "  - Namespace: ${NAMESPACE} (shared by all tenants)"
echo "  - Deployment: easy-kanban (shared by all tenants)"
echo "  - NFS persistent volumes (shared by all tenants)"
echo ""
echo "🎯 The instance and all its data have been permanently deleted."
