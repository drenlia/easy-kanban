#!/bin/bash

# Remove Easy Kanban instance (namespace only, preserves data)
# Usage: ./remove-instance.sh <instance_name>

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

echo "🗑️  Removing Easy Kanban instance: ${INSTANCE_NAME}"
echo "📍 Namespace: ${NAMESPACE}"
echo ""

# Check if namespace exists
if ! kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1; then
    echo "❌ Error: Namespace '${NAMESPACE}' does not exist"
    echo "Available namespaces:"
    kubectl get namespaces | grep easy-kanban || echo "  No Easy Kanban namespaces found"
    exit 1
fi

# Show what will be removed
echo "📋 Resources that will be removed:"
kubectl get all -n "${NAMESPACE}" 2>/dev/null || echo "  No resources found in namespace"
echo ""

# Show warning but proceed without confirmation (for admin portal use)
echo "⚠️  Removing instance '${INSTANCE_NAME}' (data will be preserved)..."

echo ""
echo "🔄 Removing instance..."

# Delete the namespace (this will remove all resources in the namespace)
echo "🗑️  Deleting namespace '${NAMESPACE}'..."
kubectl delete namespace "${NAMESPACE}"

# Wait for namespace to be deleted
echo "⏳ Waiting for namespace to be deleted..."
kubectl wait --for=delete namespace/${NAMESPACE} --timeout=60s || echo "⚠️  Namespace deletion may still be in progress"

echo ""
echo "✅ Instance '${INSTANCE_NAME}' removed successfully!"
echo ""
echo "📋 What was removed:"
echo "  - Namespace: ${NAMESPACE}"
echo "  - All pods, services, deployments, configmaps, etc."
echo "  - Ingress rules"
echo ""
echo "💾 What was preserved:"
echo "  - Persistent volumes (data is safe)"
echo "  - Storage directories in /data/easy-kanban-pv/"
echo ""
echo "🔧 To completely destroy the instance and data, use:"
echo "  ./destroy-instance.sh ${INSTANCE_NAME}"
