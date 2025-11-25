#!/bin/bash

# Remove Easy Kanban instance (ingress only, preserves all data)
# Usage: ./remove-instance.sh <instance_name>
# 
# Note: In multi-tenant mode, this only removes the ingress rule.
# All tenant data is preserved and can be restored by redeploying.
#
# This is different from destroy-instance.sh which also deletes tenant data.

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

echo "🗑️  Removing Easy Kanban instance: ${INSTANCE_NAME}"
echo "📍 Namespace: ${NAMESPACE} (shared)"
echo ""

# Check if ingress exists
if ! kubectl get ingress "${INGRESS_NAME}" -n "${NAMESPACE}" >/dev/null 2>&1; then
    echo "❌ Error: Ingress '${INGRESS_NAME}' does not exist"
    echo "Available ingress rules:"
    kubectl get ingress -n "${NAMESPACE}" | grep easy-kanban-ingress || echo "  No Easy Kanban ingress rules found"
    exit 1
fi

# Show what will be removed
echo "📋 Ingress rule that will be removed:"
kubectl get ingress "${INGRESS_NAME}" -n "${NAMESPACE}" 2>/dev/null || echo "  No ingress found"
echo ""

# Show warning but proceed without confirmation (for admin portal use)
echo "⚠️  Removing instance '${INSTANCE_NAME}' (all data will be preserved)..."
echo ""
echo "ℹ️  This will only remove the ingress rule. Tenant data will remain intact."
echo "   To restore access, simply redeploy the instance."
echo ""

echo "🔄 Removing instance..."

# Delete the ingress rule for this tenant
echo "🗑️  Deleting ingress rule '${INGRESS_NAME}'..."
kubectl delete ingress "${INGRESS_NAME}" -n "${NAMESPACE}"

echo ""
echo "✅ Instance '${INSTANCE_NAME}' removed successfully!"
echo ""
echo "📋 What was removed:"
echo "  - Ingress rule: ${INGRESS_NAME}"
echo ""
echo "💾 What was preserved:"
echo "  - All tenant data (database, attachments, avatars)"
echo "  - Namespace: ${NAMESPACE} (shared by all tenants)"
echo "  - Deployment: easy-kanban (shared by all tenants)"
echo "  - NFS persistent volumes (shared by all tenants)"
echo ""
echo "🔧 To restore access to this instance, use:"
echo "  ./deploy-instance.sh ${INSTANCE_NAME} <token> <plan>"
echo ""
echo "🗑️  To completely destroy the instance and data, use:"
echo "  ./destroy-instance.sh ${INSTANCE_NAME}"
