#!/bin/bash

# Easy Kanban Multi-Tenant Instance Deployment Script
# This script wraps the main deploy.sh script and provides structured output

set -e

# Function to display usage
usage() {
    echo "Usage: $0 <instance_name> <instance_token> <plan>"
    echo ""
    echo "Parameters:"
    echo "  instance_name  - The instance hostname (e.g., my-instance-name)"
    echo "  instance_token - Token for admin portal database access"
    echo "  plan          - License plan: 'basic' or 'pro'"
    echo ""
    echo "Example:"
    echo "  $0 my-company kanban-token-12345 basic"
    echo "  $0 enterprise kanban-token-67890 pro"
    echo ""
    echo "This will deploy Easy Kanban accessible at: https://my-company.ezkan.cloud"
    echo ""
    echo "Output:"
    echo "  The script will output JSON with deployment details on success"
    exit 1
}

# Check parameters
if [ $# -ne 3 ]; then
    echo "❌ Error: Missing required parameters"
    usage
fi

INSTANCE_NAME="$1"
INSTANCE_TOKEN="$2"
PLAN="$3"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Run the main deployment script
echo "🚀 Starting deployment for instance: ${INSTANCE_NAME} (${PLAN} plan)"
echo ""

# Capture the output and extract the deployment result
DEPLOY_OUTPUT=$("${SCRIPT_DIR}/deploy.sh" "$INSTANCE_NAME" "$INSTANCE_TOKEN" "$PLAN" 2>&1)
DEPLOY_EXIT_CODE=$?

if [ $DEPLOY_EXIT_CODE -eq 0 ]; then
    # Extract the deployment result section
    DEPLOY_RESULT=$(echo "$DEPLOY_OUTPUT" | sed -n '/📤 DEPLOYMENT_RESULT:/,$p' | tail -n +2)
    
    # Parse the result into variables
    INSTANCE_NAME_RESULT=$(echo "$DEPLOY_RESULT" | grep "INSTANCE_NAME=" | cut -d'=' -f2)
    NAMESPACE_RESULT=$(echo "$DEPLOY_RESULT" | grep "NAMESPACE=" | cut -d'=' -f2)
    HOSTNAME_RESULT=$(echo "$DEPLOY_RESULT" | grep "HOSTNAME=" | cut -d'=' -f2)
    EXTERNAL_IP_RESULT=$(echo "$DEPLOY_RESULT" | grep "EXTERNAL_IP=" | cut -d'=' -f2)
    NODEPORT_RESULT=$(echo "$DEPLOY_RESULT" | grep "NODEPORT=" | cut -d'=' -f2)
    INSTANCE_TOKEN_RESULT=$(echo "$DEPLOY_RESULT" | grep "INSTANCE_TOKEN=" | cut -d'=' -f2)
    STORAGE_DATA_PATH=$(echo "$DEPLOY_RESULT" | grep "STORAGE_DATA_PATH=" | cut -d'=' -f2)
    STORAGE_ATTACHMENTS_PATH=$(echo "$DEPLOY_RESULT" | grep "STORAGE_ATTACHMENTS_PATH=" | cut -d'=' -f2)
    STORAGE_AVATARS_PATH=$(echo "$DEPLOY_RESULT" | grep "STORAGE_AVATARS_PATH=" | cut -d'=' -f2)
    
    # Output JSON result
    echo ""
    echo "✅ Deployment successful!"
    echo ""
    echo "📋 DEPLOYMENT SUMMARY:"
    cat << EOF
{
  "status": "success",
  "instance_name": "${INSTANCE_NAME_RESULT}",
  "namespace": "${NAMESPACE_RESULT}",
  "hostname": "${HOSTNAME_RESULT}",
  "external_ip": "${EXTERNAL_IP_RESULT}",
  "nodeport": "${NODEPORT_RESULT}",
  "instance_token": "${INSTANCE_TOKEN_RESULT}",
  "plan": "${PLAN}",
  "access_url": "https://${HOSTNAME_RESULT}",
  "storage_paths": {
    "database": "${STORAGE_DATA_PATH}",
    "attachments": "${STORAGE_ATTACHMENTS_PATH}",
    "avatars": "${STORAGE_AVATARS_PATH}"
  },
  "management_commands": {
    "view_logs": "kubectl logs -f deployment/easy-kanban -n ${NAMESPACE_RESULT}",
    "delete_instance": "kubectl delete namespace ${NAMESPACE_RESULT}",
    "scale_replicas": "kubectl scale deployment easy-kanban --replicas=1 -n ${NAMESPACE_RESULT}"
  }
}
EOF
else
    echo ""
    echo "❌ Deployment failed!"
    echo ""
    echo "Error output:"
    echo "$DEPLOY_OUTPUT"
    exit 1
fi
