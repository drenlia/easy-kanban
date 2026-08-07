#!/bin/bash

# Easy Kanban Multi-Tenant Instance Deployment Script
# This script wraps the main deploy.sh script and provides structured output

set -e

# Function to display usage
usage() {
    echo "Usage: $0 <instance_name> <plan>"
    echo ""
    echo "Parameters:"
    echo "  instance_name  - The instance hostname (e.g., my-instance-name)"
    echo "  plan          - License plan: 'basic' or 'pro'"
    echo ""
    echo "Example:"
    echo "  $0 my-company basic"
    echo "  $0 enterprise pro"
    echo ""
    echo "This will deploy Easy Kanban accessible at: https://my-company.ezkan.cloud"
    echo ""
    echo "Note: Instance token is automatically generated on first deployment"
    echo "      and preserved for all subsequent deployments."
    echo ""
    echo "Output:"
    echo "  The script will output JSON with deployment details on success"
    exit 1
}

# Check parameters
if [ $# -ne 2 ]; then
    echo "❌ Error: Missing required parameters"
    usage
fi

INSTANCE_NAME="$1"
PLAN="$2"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Run the main deployment script
echo "🚀 Starting deployment for instance: ${INSTANCE_NAME} (${PLAN} plan)"
echo ""

# Create a temporary file to capture output while streaming in real-time
TEMP_OUTPUT=$(mktemp)
trap "rm -f '$TEMP_OUTPUT'" EXIT

# Run deploy.sh, stream output to stdout AND capture to temp file
"${SCRIPT_DIR}/deploy.sh" "$INSTANCE_NAME" "$PLAN" 2>&1 | tee "$TEMP_OUTPUT"
DEPLOY_EXIT_CODE=${PIPESTATUS[0]}

# Read captured output for parsing
DEPLOY_OUTPUT=$(cat "$TEMP_OUTPUT")

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
    "remove_instance": "./k8s/remove-instance.sh ${INSTANCE_NAME_RESULT}",
    "scale_replicas": "kubectl scale deployment easy-kanban --replicas=3 -n ${NAMESPACE_RESULT}"
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
