#!/bin/bash

# Remove Easy Kanban PostgreSQL instance (ingress only, preserves all data)
# Usage: ./remove-instance-pg.sh <instance_name>
# 
# Note: In multi-tenant mode, this only removes the ingress rule.
# All tenant data is preserved and can be restored by redeploying.
#
# This is different from destroy-instance-pg.sh which also deletes tenant data.

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
# Prefer explicit TENANT_DOMAIN, then live ConfigMap, then agila.dev
DOMAIN="${TENANT_DOMAIN:-}"
if [ -z "${DOMAIN}" ]; then
    DOMAIN=$(kubectl get configmap easy-kanban-config-pg -n "${NAMESPACE}" -o jsonpath='{.data.TENANT_DOMAIN}' 2>/dev/null || true)
fi
DOMAIN="${DOMAIN:-agila.dev}"
FULL_HOSTNAME="${INSTANCE_NAME}.${DOMAIN}"
INGRESS_NAME="easy-kanban-ingress-${INSTANCE_NAME}"
WEBSOCKET_INGRESS_NAME="easy-kanban-websocket-ingress-pg"

echo "🗑️  Removing Easy Kanban PostgreSQL instance: ${INSTANCE_NAME}"
echo "📍 Namespace: ${NAMESPACE} (shared)"
echo ""

# Check if ingress exists
if ! kubectl get ingress "${INGRESS_NAME}" -n "${NAMESPACE}" >/dev/null 2>&1; then
    echo "ℹ️  Ingress '${INGRESS_NAME}' does not exist"
    echo "   Instance '${INSTANCE_NAME}' is already removed or was never deployed."
    echo ""
    echo "✅ No action needed - instance is already in the desired state (removed)."
    echo ""
    echo "💾 All tenant data (if any) remains intact:"
    echo "   - PostgreSQL schema: tenant_${INSTANCE_NAME}"
    echo "   - Attachments: /data/nfs-server/attachments/tenants/${INSTANCE_NAME}/"
    echo "   - Avatars: /data/nfs-server/avatars/tenants/${INSTANCE_NAME}/"
    echo ""
    echo "🔧 To deploy this instance, use:"
    echo "   ./k8s/deploy-instance-pg.sh ${INSTANCE_NAME} <plan>"
    exit 0
fi

# Show what will be removed
echo "📋 Ingress rule that will be removed:"
kubectl get ingress "${INGRESS_NAME}" -n "${NAMESPACE}" 2>/dev/null || echo "  No ingress found"
echo ""

# Show warning but proceed without confirmation (for admin portal use)
echo "⚠️  Removing instance '${INSTANCE_NAME}' (all data will be preserved)..."
echo ""
echo "ℹ️  This will ONLY remove the ingress rule. All tenant data will remain intact:"
echo "   - PostgreSQL schema will NOT be deleted"
echo "   - Attachments will NOT be deleted"
echo "   - Avatars will NOT be deleted"
echo "   - To restore access, simply redeploy the instance (data will be reused)"
echo ""

echo "🔄 Removing instance..."

# Delete the ingress rule for this tenant
echo "🗑️  Deleting ingress rule '${INGRESS_NAME}'..."
kubectl delete ingress "${INGRESS_NAME}" -n "${NAMESPACE}"

# Remove hostname from WebSocket ingress if it exists
if kubectl get ingress "${WEBSOCKET_INGRESS_NAME}" -n "${NAMESPACE}" &>/dev/null; then
    echo "🔌 Removing hostname '${FULL_HOSTNAME}' from WebSocket ingress..."
    # Check if this hostname exists in the WebSocket ingress
    EXISTING_HOST=$(kubectl get ingress "${WEBSOCKET_INGRESS_NAME}" -n "${NAMESPACE}" -o jsonpath="{.spec.rules[?(@.host=='${FULL_HOSTNAME}')].host}" 2>/dev/null || echo "")
    if [ -n "$EXISTING_HOST" ]; then
        # Check if jq is available (required for JSON manipulation)
        if ! command -v jq &> /dev/null; then
            echo "   ⚠️  Warning: jq is not installed. Cannot automatically remove hostname from WebSocket ingress."
            echo "   💡 Please manually remove '${FULL_HOSTNAME}' from the WebSocket ingress rules and TLS hosts"
            echo "   💡 Or install jq: sudo apt-get install jq (or equivalent for your OS)"
        else
            # Get current ingress and remove the hostname
            CURRENT_INGRESS_JSON=$(kubectl get ingress "${WEBSOCKET_INGRESS_NAME}" -n "${NAMESPACE}" -o json)
            
            # Remove hostname from rules and TLS hosts
            UPDATED_INGRESS=$(echo "$CURRENT_INGRESS_JSON" | jq --arg hostname "$FULL_HOSTNAME" '
                # Remove hostname from rules
                .spec.rules = (.spec.rules | map(select(.host != $hostname))) |
                # Remove hostname from TLS hosts if TLS section exists
                if .spec.tls and (.spec.tls | length > 0) then
                    .spec.tls[0].hosts = (.spec.tls[0].hosts | map(select(. != $hostname)))
                else
                    .
                end
            ')
            
            # Apply the updated ingress
            echo "$UPDATED_INGRESS" | kubectl apply -f -
            echo "   ✅ Hostname '${FULL_HOSTNAME}' removed from WebSocket ingress"
        fi
    else
        echo "   ℹ️  Hostname '${FULL_HOSTNAME}' not found in WebSocket ingress (may have been already removed)"
    fi
else
    echo "   ℹ️  WebSocket ingress does not exist, skipping..."
fi

echo ""
echo "✅ Instance '${INSTANCE_NAME}' removed successfully!"
echo ""
echo "📋 What was removed:"
echo "  - Ingress rule: ${INGRESS_NAME}"
echo "  - WebSocket ingress hostname: ${FULL_HOSTNAME}"
echo ""
echo "💾 What was preserved (ALL DATA INTACT):"
echo "  - ✅ PostgreSQL schema: tenant_${INSTANCE_NAME} (and all its data)"
echo "  - ✅ Tenant attachments: /data/nfs-server/attachments/tenants/${INSTANCE_NAME}/"
echo "  - ✅ Tenant avatars: /data/nfs-server/avatars/tenants/${INSTANCE_NAME}/"
echo "  - ✅ Namespace: ${NAMESPACE} (shared by all tenants)"
echo "  - ✅ Deployment: easy-kanban (shared by all tenants)"
echo "  - ✅ PostgreSQL database: postgres (shared by all tenants)"
echo "  - ✅ Redis: redis (shared by all tenants)"
echo "  - ✅ NFS persistent volumes (shared by all tenants)"
echo ""
echo "ℹ️  Important: All tenant data remains intact and can be restored by redeploying."
echo ""
echo "🔧 To restore access to this instance (recreates ingress, data already exists):"
echo "  ./k8s/deploy-instance-pg.sh ${INSTANCE_NAME} <plan>"
echo ""
echo "🗑️  To completely destroy the instance AND delete all data, use:"
echo "  ./k8s/destroy-instance-pg.sh ${INSTANCE_NAME}"
