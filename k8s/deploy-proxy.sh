#!/bin/bash

# SQLite Proxy Deployment Script
# 
# Deploys only the SQLite proxy service to an existing Easy-Kanban Kubernetes cluster.
# This is useful when you already have the app running and just need to add the proxy.
#
# Usage: ./k8s/deploy-proxy.sh
#
# The script will:
# - Use the same image as your Easy-Kanban app (easy-kanban:latest)
# - Deploy to the easy-kanban namespace
# - Create the proxy deployment and service
# - Wait for the proxy to be ready

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAMESPACE="easy-kanban"
IMAGE_NAME="easy-kanban:latest"

# Create temp directory for generated manifests
TEMP_DIR=$(mktemp -d)
trap "rm -rf ${TEMP_DIR}" EXIT

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🔗 SQLite Proxy Deployment${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if namespace exists
echo -e "${CYAN}📦 Step 1/4: Checking namespace...${NC}"
if ! kubectl get namespace "${NAMESPACE}" &>/dev/null; then
    echo -e "${RED}❌ Namespace '${NAMESPACE}' does not exist${NC}"
    echo -e "${YELLOW}   Please deploy the main application first or create the namespace${NC}"
    exit 1
fi
echo -e "${GREEN}   ✅ Namespace '${NAMESPACE}' exists${NC}"
echo ""

# Check if Easy-Kanban app is deployed (to verify we're in the right cluster)
echo -e "${CYAN}📦 Step 2/4: Verifying Easy-Kanban deployment...${NC}"
if ! kubectl get deployment easy-kanban -n "${NAMESPACE}" &>/dev/null; then
    echo -e "${YELLOW}⚠️  Warning: Easy-Kanban deployment not found in namespace '${NAMESPACE}'${NC}"
    echo -e "${YELLOW}   Continuing anyway, but make sure you're deploying to the correct namespace${NC}"
else
    # Get the image from the existing Easy-Kanban deployment to match it
    EXISTING_IMAGE=$(kubectl get deployment easy-kanban -n "${NAMESPACE}" -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || echo "")
    if [ -n "$EXISTING_IMAGE" ] && [ "$EXISTING_IMAGE" != "" ]; then
        echo -e "${GREEN}   ✅ Found Easy-Kanban deployment${NC}"
        echo -e "${CYAN}   📷 Using same image as Easy-Kanban app: ${EXISTING_IMAGE}${NC}"
        IMAGE_NAME="$EXISTING_IMAGE"
    else
        echo -e "${GREEN}   ✅ Found Easy-Kanban deployment${NC}"
        echo -e "${YELLOW}   ⚠️  Could not determine image, using default: ${IMAGE_NAME}${NC}"
    fi
fi
echo ""

# Generate proxy manifests
echo -e "${CYAN}📦 Step 3/4: Generating proxy manifests...${NC}"
sed -e "s/easy-kanban/${NAMESPACE}/g" \
    -e "s|IMAGE_NAME_PLACEHOLDER|${IMAGE_NAME}|g" \
    ${SCRIPT_DIR}/sqlite-proxy-deployment.yaml > "${TEMP_DIR}/sqlite-proxy-deployment.yaml"

sed -e "s/easy-kanban/${NAMESPACE}/g" \
    ${SCRIPT_DIR}/sqlite-proxy-service.yaml > "${TEMP_DIR}/sqlite-proxy-service.yaml"

echo -e "${GREEN}   ✅ Manifests generated${NC}"
echo ""

# Deploy SQLite Proxy Service
echo -e "${CYAN}📦 Step 4/4: Deploying SQLite Proxy Service...${NC}"
if kubectl get deployment sqlite-proxy -n "${NAMESPACE}" &>/dev/null; then
    echo -e "${YELLOW}   🔗 SQLite Proxy already exists, checking if update needed...${NC}"
    
    # Check current image
    CURRENT_IMAGE=$(kubectl get deployment sqlite-proxy -n "${NAMESPACE}" -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || echo "")
    
    if [ "${CURRENT_IMAGE}" != "${IMAGE_NAME}" ]; then
        echo -e "${CYAN}   🔄 Updating SQLite Proxy deployment (image: ${CURRENT_IMAGE} → ${IMAGE_NAME})...${NC}"
        kubectl apply -f "${TEMP_DIR}/sqlite-proxy-deployment.yaml"
        kubectl apply -f "${TEMP_DIR}/sqlite-proxy-service.yaml"
        
        echo -e "${CYAN}   ⏳ Waiting for SQLite Proxy to be ready (timeout: 60s)...${NC}"
        if kubectl wait --for=condition=available --timeout=60s deployment/sqlite-proxy -n "${NAMESPACE}" 2>&1; then
            echo -e "${GREEN}   ✅ SQLite Proxy updated and ready${NC}"
        else
            echo -e "${YELLOW}   ⚠️  SQLite Proxy update may still be in progress${NC}"
        fi
    else
        echo -e "${GREEN}   ✅ SQLite Proxy is already up to date (image: ${IMAGE_NAME})${NC}"
    fi
else
    echo -e "${CYAN}   🔗 Deploying SQLite Proxy Service (image: ${IMAGE_NAME})...${NC}"
    kubectl apply -f "${TEMP_DIR}/sqlite-proxy-deployment.yaml"
    kubectl apply -f "${TEMP_DIR}/sqlite-proxy-service.yaml"
    
    # Wait for proxy to be ready
    echo -e "${CYAN}   ⏳ Waiting for SQLite Proxy to be ready (timeout: 60s)...${NC}"
    if kubectl wait --for=condition=available --timeout=60s deployment/sqlite-proxy -n "${NAMESPACE}" 2>&1; then
        echo -e "${GREEN}   ✅ SQLite Proxy is ready${NC}"
    else
        echo -e "${YELLOW}   ⚠️  SQLite Proxy may still be starting (this is OK, it will be ready soon)${NC}"
    fi
fi
echo ""

# Verify deployment
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ SQLite Proxy Deployment Complete${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${CYAN}📊 Deployment Status:${NC}"
kubectl get deployment sqlite-proxy -n "${NAMESPACE}"
echo ""
kubectl get service sqlite-proxy -n "${NAMESPACE}"
echo ""
echo -e "${CYAN}📋 Next Steps:${NC}"
echo -e "   1. Enable proxy in ConfigMap:"
echo -e "      ${YELLOW}kubectl patch configmap easy-kanban-config -n ${NAMESPACE} --type merge -p '{\"data\":{\"SQLITE_PROXY_URL\":\"http://sqlite-proxy:3001\"}}'${NC}"
echo ""
echo -e "   2. Restart app pods to use proxy:"
echo -e "      ${YELLOW}kubectl rollout restart deployment/easy-kanban -n ${NAMESPACE}${NC}"
echo ""
echo -e "   3. Verify proxy is working:"
echo -e "      ${YELLOW}kubectl logs -n ${NAMESPACE} -l app=sqlite-proxy --tail=50${NC}"
echo ""

