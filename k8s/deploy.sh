#!/bin/bash

# Easy Kanban Multi-Tenant Kubernetes Deployment Script

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
    exit 1
}

# Check parameters
if [ $# -ne 3 ]; then
    echo "❌ Error: Missing required parameters"
    usage
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTANCE_NAME="$1"
INSTANCE_TOKEN="$2"
PLAN="$3"
NAMESPACE="easy-kanban-${INSTANCE_NAME}"
DOMAIN="ezkan.cloud"
FULL_HOSTNAME="${INSTANCE_NAME}.${DOMAIN}"

# Validate instance name (alphanumeric and hyphens only)
if [[ ! "$INSTANCE_NAME" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]]; then
    echo "❌ Error: Instance name must contain only lowercase letters, numbers, and hyphens"
    echo "   Must start and end with alphanumeric characters"
    exit 1
fi

# Validate plan
if [[ "$PLAN" != "basic" && "$PLAN" != "pro" ]]; then
    echo "❌ Error: Plan must be 'basic' or 'pro'"
    exit 1
fi

# Set license configuration based on plan
if [[ "$PLAN" == "basic" ]]; then
    USER_LIMIT="5"
    TASK_LIMIT="100"
    BOARD_LIMIT="10"
    STORAGE_LIMIT="1Gi"  # 1GB
    SUPPORT_TYPE="basic"
else
    USER_LIMIT="50"
    TASK_LIMIT="-1"  # unlimited
    BOARD_LIMIT="-1" # unlimited
    STORAGE_LIMIT="10Gi" # 10GB
    SUPPORT_TYPE="pro"
fi

# Generate random JWT secret
JWT_SECRET=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)

echo "🚀 Deploying Easy Kanban instance: ${INSTANCE_NAME}"
echo "📍 Namespace: ${NAMESPACE}"
echo "🌐 Hostname: ${FULL_HOSTNAME}"
echo "🔑 Instance Token: ${INSTANCE_TOKEN}"
echo "📋 Plan: ${PLAN} (${SUPPORT_TYPE})"
echo "👥 User Limit: ${USER_LIMIT}"
echo "📝 Task Limit: ${TASK_LIMIT}"
echo "📊 Board Limit: ${BOARD_LIMIT}"
echo "💾 Storage Limit: ${STORAGE_LIMIT} bytes"

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed or not in PATH"
    exit 1
fi

# Check if cluster is accessible
if ! kubectl cluster-info &> /dev/null; then
    echo "❌ Cannot connect to Kubernetes cluster"
    exit 1
fi

echo "✅ Kubernetes cluster is accessible"

# Create temporary directory for generated manifests
TEMP_DIR=$(mktemp -d)
echo "📁 Using temporary directory: ${TEMP_DIR}"

# Function to generate manifests with instance-specific values
generate_manifests() {
    echo "🔧 Generating instance-specific manifests..."
    
    # Generate namespace
    sed "s/easy-kanban/${NAMESPACE}/g" ${SCRIPT_DIR}/namespace.yaml > "${TEMP_DIR}/namespace.yaml"
    
    # Generate Redis deployment
    sed "s/easy-kanban/${NAMESPACE}/g" ${SCRIPT_DIR}/redis-deployment.yaml > "${TEMP_DIR}/redis-deployment.yaml"
    
    # Generate ConfigMap with instance token and plan-specific values
    sed -e "s/easy-kanban/${NAMESPACE}/g" \
        -e "s/INSTANCE_NAME_PLACEHOLDER/${INSTANCE_NAME}/g" \
        -e "s/INSTANCE_TOKEN_PLACEHOLDER/${INSTANCE_TOKEN}/g" \
        -e "s/JWT_SECRET_PLACEHOLDER/${JWT_SECRET}/g" \
        -e "s/USER_LIMIT_PLACEHOLDER/${USER_LIMIT}/g" \
        -e "s/TASK_LIMIT_PLACEHOLDER/${TASK_LIMIT}/g" \
        -e "s/BOARD_LIMIT_PLACEHOLDER/${BOARD_LIMIT}/g" \
        -e "s/STORAGE_LIMIT_PLACEHOLDER/${STORAGE_LIMIT}/g" \
        -e "s/SUPPORT_TYPE_PLACEHOLDER/${SUPPORT_TYPE}/g" \
        ${SCRIPT_DIR}/configmap.yaml > "${TEMP_DIR}/configmap.yaml"
    
    # Generate app deployment
    sed -e "s/easy-kanban/${NAMESPACE}/g" \
        -e "s/DEPLOYMENT_NAME_PLACEHOLDER/easy-kanban-${INSTANCE_NAME}/g" \
        -e "s/IMAGE_NAME_PLACEHOLDER/easy-kanban:latest/g" \
        ${SCRIPT_DIR}/app-deployment.yaml > "${TEMP_DIR}/app-deployment.yaml"
    
    # Generate services
    sed "s/easy-kanban/${NAMESPACE}/g" ${SCRIPT_DIR}/service.yaml > "${TEMP_DIR}/service.yaml"
    
    # Generate ingress with dynamic hostname
    sed -e "s/easy-kanban/${NAMESPACE}/g" \
        -e "s/easy-kanban.local/${FULL_HOSTNAME}/g" \
        ${SCRIPT_DIR}/ingress.yaml > "${TEMP_DIR}/ingress.yaml"
    
    # Create storage directories
    echo "📁 Creating storage directories for ${INSTANCE_NAME}..."
    sudo mkdir -p "/data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-data"
    sudo mkdir -p "/data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-attachments"
    sudo mkdir -p "/data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-avatars"
    sudo chmod 755 "/data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-data"
    sudo chmod 755 "/data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-attachments"
    sudo chmod 755 "/data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-avatars"
    
    # Generate persistent volumes
    sed -e "s/INSTANCE_NAME_PLACEHOLDER/${INSTANCE_NAME}/g" \
        ${SCRIPT_DIR}/persistent-volume-template.yaml > "${TEMP_DIR}/persistent-volume.yaml"
    
    sed -e "s/INSTANCE_NAME_PLACEHOLDER/${INSTANCE_NAME}/g" \
        -e "s/STORAGE_LIMIT_PLACEHOLDER/${STORAGE_LIMIT}/g" \
        ${SCRIPT_DIR}/persistent-volume-attachments-template.yaml > "${TEMP_DIR}/persistent-volume-attachments.yaml"
    
    sed -e "s/INSTANCE_NAME_PLACEHOLDER/${INSTANCE_NAME}/g" \
        ${SCRIPT_DIR}/persistent-volume-avatars-template.yaml > "${TEMP_DIR}/persistent-volume-avatars.yaml"
    
    # Generate persistent volume claims
    sed -e "s/easy-kanban/${NAMESPACE}/g" \
        ${SCRIPT_DIR}/persistent-volume-claim.yaml > "${TEMP_DIR}/persistent-volume-claim.yaml"
    
    sed -e "s/easy-kanban/${NAMESPACE}/g" \
        -e "s/STORAGE_LIMIT_PLACEHOLDER/${STORAGE_LIMIT}/g" \
        ${SCRIPT_DIR}/persistent-volume-claim-attachments.yaml > "${TEMP_DIR}/persistent-volume-claim-attachments.yaml"
    
    sed -e "s/easy-kanban/${NAMESPACE}/g" \
        ${SCRIPT_DIR}/persistent-volume-claim-avatars.yaml > "${TEMP_DIR}/persistent-volume-claim-avatars.yaml"
}

# Generate manifests
generate_manifests

# Apply the namespace first
echo "📦 Creating namespace..."
kubectl apply -f "${TEMP_DIR}/namespace.yaml"

# Apply Redis deployment
echo "🗄️  Deploying Redis..."
kubectl apply -f "${TEMP_DIR}/redis-deployment.yaml"

# Wait for Redis to be ready
echo "⏳ Waiting for Redis to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/redis -n "${NAMESPACE}"

# Apply ConfigMap
echo "⚙️  Creating ConfigMap..."
kubectl apply -f "${TEMP_DIR}/configmap.yaml"

# Create storage class
echo "📁 Creating storage class..."
kubectl apply -f "${SCRIPT_DIR}/storage-class.yaml"

# Create persistent volumes
echo "💾 Creating persistent volumes..."
kubectl apply -f "${TEMP_DIR}/persistent-volume.yaml"
kubectl apply -f "${TEMP_DIR}/persistent-volume-attachments.yaml"
kubectl apply -f "${TEMP_DIR}/persistent-volume-avatars.yaml"

# Create persistent volume claims
echo "🔗 Creating persistent volume claims..."
kubectl apply -f "${TEMP_DIR}/persistent-volume-claim.yaml"
kubectl apply -f "${TEMP_DIR}/persistent-volume-claim-attachments.yaml"
kubectl apply -f "${TEMP_DIR}/persistent-volume-claim-avatars.yaml"

# Apply the main application
echo "🎯 Deploying Easy Kanban application..."
kubectl apply -f "${TEMP_DIR}/app-deployment.yaml"

# Wait for the app to be ready
echo "⏳ Waiting for Easy Kanban to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/easy-kanban-${INSTANCE_NAME} -n "${NAMESPACE}"

# Apply services
echo "🌐 Creating services..."
kubectl apply -f "${TEMP_DIR}/service.yaml"

# Apply ingress
echo "🔗 Creating ingress..."
kubectl apply -f "${TEMP_DIR}/ingress.yaml"

echo "✅ Deployment completed successfully!"

# Extract IP and port information
echo ""
echo "🔍 Extracting deployment information..."

# Get the external IP from the ingress
EXTERNAL_IP=""
INGRESS_IP=$(kubectl get ingress easy-kanban-ingress -n "${NAMESPACE}" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
if [ -n "$INGRESS_IP" ]; then
    EXTERNAL_IP="$INGRESS_IP"
else
    # Fallback to NodePort service
    NODEPORT=$(kubectl get service easy-kanban-nodeport -n "${NAMESPACE}" -o jsonpath='{.spec.ports[?(@.name=="backend")].nodePort}' 2>/dev/null || echo "")
    if [ -n "$NODEPORT" ]; then
        # Get node IP
        NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="ExternalIP")].address}' 2>/dev/null || kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null || echo "localhost")
        EXTERNAL_IP="$NODE_IP:$NODEPORT"
    fi
fi

# Show status
echo ""
echo "📊 Deployment Status:"
kubectl get pods -n "${NAMESPACE}"
echo ""
echo "🌐 Services:"
kubectl get services -n "${NAMESPACE}"
echo ""
echo "🔗 Ingress:"
kubectl get ingress -n "${NAMESPACE}"

echo ""
echo "🎉 Easy Kanban instance '${INSTANCE_NAME}' is now running!"
echo ""
echo "📍 Instance Details:"
echo "   Instance Name: ${INSTANCE_NAME}"
echo "   Namespace: ${NAMESPACE}"
echo "   Hostname: ${FULL_HOSTNAME}"
echo "   External Access: ${EXTERNAL_IP}"
echo "   Instance Token: ${INSTANCE_TOKEN}"
echo ""
echo "💾 Storage Paths:"
echo "   Database: /data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-data"
echo "   Attachments: /data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-attachments"
echo "   Avatars: /data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-avatars"
echo ""
echo "🌐 Access URLs:"
echo "   - Primary: https://${FULL_HOSTNAME}"
if [ -n "$NODEPORT" ]; then
    echo "   - Direct: http://${EXTERNAL_IP}"
fi
echo ""
echo "🔧 Management Commands:"
echo "   View logs: kubectl logs -f deployment/easy-kanban -n ${NAMESPACE}"
echo "   Delete instance: kubectl delete namespace ${NAMESPACE}"
echo "   Scale replicas: kubectl scale deployment easy-kanban --replicas=1 -n ${NAMESPACE}"

# Clean up temporary files
echo ""
echo "🧹 Cleaning up temporary files..."
rm -rf "${TEMP_DIR}"

# Return the IP and port information for programmatic use
echo ""
echo "📤 DEPLOYMENT_RESULT:"
echo "INSTANCE_NAME=${INSTANCE_NAME}"
echo "NAMESPACE=${NAMESPACE}"
echo "HOSTNAME=${FULL_HOSTNAME}"
echo "EXTERNAL_IP=${EXTERNAL_IP}"
echo "INSTANCE_TOKEN=${INSTANCE_TOKEN}"
echo "STORAGE_DATA_PATH=/data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-data"
echo "STORAGE_ATTACHMENTS_PATH=/data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-attachments"
echo "STORAGE_AVATARS_PATH=/data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-avatars"
