#!/bin/bash

# Destroy Easy Kanban instance (namespace + persistent volumes + data)
# Usage: ./destroy-instance.sh <instance_name>

set -e

# Check if instance name is provided
if [ $# -eq 0 ]; then
    echo "❌ Error: Instance name is required"
    echo "Usage: $0 <instance_name>"
    echo ""
    echo "Examples:"
    echo "  $0 code7"
    echo "  $0 demo1"
    exit 1
fi

INSTANCE_NAME="$1"
NAMESPACE="easy-kanban-${INSTANCE_NAME}"

echo "💥 Destroying Easy Kanban instance: ${INSTANCE_NAME}"
echo "📍 Namespace: ${NAMESPACE}"
echo ""

# Check if namespace exists
if ! kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1; then
    echo "⚠️  Namespace '${NAMESPACE}' does not exist"
else
    # Show what will be removed
    echo "📋 Kubernetes resources that will be removed:"
    kubectl get all -n "${NAMESPACE}" 2>/dev/null || echo "  No resources found in namespace"
    echo ""
fi

# Show persistent volumes that will be removed
echo "💾 Persistent volumes that will be removed:"
kubectl get pv | grep "easy-kanban-${INSTANCE_NAME}-" || echo "  No persistent volumes found"
echo ""

# Show storage directories that will be removed
STORAGE_BASE="/data/easy-kanban-pv"
DATA_DIR="${STORAGE_BASE}/easy-kanban-${INSTANCE_NAME}-data"
ATTACHMENTS_DIR="${STORAGE_BASE}/easy-kanban-${INSTANCE_NAME}-attachments"
AVATARS_DIR="${STORAGE_BASE}/easy-kanban-${INSTANCE_NAME}-avatars"

echo "📁 Storage directories that will be removed:"
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
echo "   - All Kubernetes resources"
echo "   - All persistent volumes"
echo "   - All stored data (database, attachments, avatars)"
echo "   - This action CANNOT be undone!"
echo ""

echo "💥 Destroying instance..."

# Step 1: Delete namespace (this will remove all resources)
if kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1; then
    echo "🗑️  Deleting namespace '${NAMESPACE}'..."
    kubectl delete namespace "${NAMESPACE}"
    
    # Wait for namespace to be deleted
    echo "⏳ Waiting for namespace to be deleted..."
    kubectl wait --for=delete namespace/${NAMESPACE} --timeout=60s || echo "⚠️  Namespace deletion may still be in progress"
else
    echo "⚠️  Namespace '${NAMESPACE}' does not exist, skipping..."
fi

# Step 2: Delete persistent volumes
echo "🗑️  Deleting persistent volumes..."
kubectl get pv | grep "easy-kanban-${INSTANCE_NAME}-" | awk '{print $1}' | while read pv_name; do
    if [ -n "$pv_name" ]; then
        echo "  Deleting PV: $pv_name"
        kubectl delete pv "$pv_name" || echo "    ⚠️  Failed to delete PV: $pv_name"
    fi
done

# Step 3: Remove storage directories
echo "🗑️  Removing storage directories..."
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
echo "  - Namespace: ${NAMESPACE}"
echo "  - All Kubernetes resources (pods, services, deployments, etc.)"
echo "  - All persistent volumes"
echo "  - All storage directories and data"
echo ""
echo "🎯 The instance and all its data have been permanently deleted."
