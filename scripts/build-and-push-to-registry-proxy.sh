#!/bin/bash

# Build and Push SQLite Proxy Image to Internal Registry
# This script builds the standalone proxy service and pushes it to the internal registry

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
REGISTRY_HOST="internal-registry.kube-system.svc.cluster.local:5000"
IMAGE_NAME="sqlite-proxy"
IMAGE_TAG="latest"
FULL_IMAGE="${REGISTRY_HOST}/${IMAGE_NAME}:${IMAGE_TAG}"

# Get the project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROXY_DIR="${PROJECT_ROOT}/sqlite-proxy-service"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🐳 Build and Push SQLite Proxy to Internal Registry${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if registry is running
echo -e "${YELLOW}🔍 Checking registry...${NC}"
if ! kubectl get svc internal-registry -n kube-system >/dev/null 2>&1; then
    echo -e "${RED}❌ Internal registry not found. Run ./k8s/setup-registry.sh first${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Registry is running${NC}"
echo ""

# Check if proxy directory exists
if [ ! -d "$PROXY_DIR" ]; then
    echo -e "${RED}❌ Proxy service directory not found: ${PROXY_DIR}${NC}"
    exit 1
fi

# Check if Dockerfile exists
if [ ! -f "${PROXY_DIR}/Dockerfile" ]; then
    echo -e "${RED}❌ Dockerfile not found in ${PROXY_DIR}${NC}"
    exit 1
fi

# Change to proxy directory
cd "$PROXY_DIR"
echo -e "${CYAN}📁 Working directory: ${PROXY_DIR}${NC}"
echo ""

# Check if Docker is running
echo -e "${YELLOW}🔍 Checking Docker...${NC}"
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker and try again.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker is running${NC}"
echo ""

# Get git information
echo -e "${YELLOW}📋 Gathering version information...${NC}"
cd "$PROJECT_ROOT"  # Get git info from project root
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
cd "$PROXY_DIR"  # Back to proxy directory

echo -e "${CYAN}   Git Commit: ${GIT_COMMIT}${NC}"
echo -e "${CYAN}   Git Branch: ${GIT_BRANCH}${NC}"
echo -e "${CYAN}   Build Time: ${BUILD_TIME}${NC}"
echo ""

# Build the image
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🔨 Building Docker image...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

docker build -f Dockerfile -t ${IMAGE_NAME}:${IMAGE_TAG} .

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Docker image built successfully!${NC}"
else
    echo ""
    echo -e "${RED}❌ Docker build failed!${NC}"
    exit 1
fi

# Get image information
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📦 Image Information${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
docker images ${IMAGE_NAME}:${IMAGE_TAG} --format "Image: {{.Repository}}:{{.Tag}}\nImage ID: {{.ID}}\nCreated: {{.CreatedSince}}\nSize: {{.Size}}"
echo ""

# Get registry service IP for port-forward
REGISTRY_IP=$(kubectl get svc internal-registry -n kube-system -o jsonpath='{.spec.clusterIP}')
REGISTRY_PORT=$(kubectl get svc internal-registry -n kube-system -o jsonpath='{.spec.ports[0].port}')

echo -e "${YELLOW}🔗 Setting up port-forward to registry...${NC}"
echo -e "${CYAN}   Forwarding localhost:5000 to ${REGISTRY_IP}:${REGISTRY_PORT}${NC}"

# Start port-forward in background
kubectl port-forward -n kube-system svc/internal-registry 5000:${REGISTRY_PORT} > /tmp/registry-port-forward-proxy.log 2>&1 &
PF_PID=$!

# Wait for port-forward to be ready
sleep 3
if ! kill -0 $PF_PID 2>/dev/null; then
    echo -e "${RED}❌ Port-forward failed${NC}"
    exit 1
fi

# Test port-forward
if ! curl -s http://localhost:5000/v2/ > /dev/null 2>&1; then
    echo -e "${RED}❌ Cannot connect to registry via port-forward${NC}"
    kill $PF_PID 2>/dev/null || true
    exit 1
fi

echo -e "${GREEN}✓ Port-forward active (PID: ${PF_PID})${NC}"
echo ""

# Tag for registry (use localhost for push, but tag with service name for k8s)
LOCAL_REGISTRY="localhost:5000"
LOCAL_FULL_IMAGE="${LOCAL_REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"

echo -e "${YELLOW}📦 Tagging image for registry...${NC}"
docker tag ${IMAGE_NAME}:${IMAGE_TAG} ${LOCAL_FULL_IMAGE}
echo -e "${GREEN}✓ Tagged as ${LOCAL_FULL_IMAGE} (for push)${NC}"
echo -e "${CYAN}   Will be available as ${FULL_IMAGE} in cluster${NC}"
echo ""

# Push to registry
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📤 Pushing image to registry...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

docker push ${LOCAL_FULL_IMAGE}

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Image pushed successfully!${NC}"
else
    echo ""
    echo -e "${RED}❌ Image push failed!${NC}"
    kill $PF_PID 2>/dev/null || true
    exit 1
fi

# Stop port-forward
kill $PF_PID 2>/dev/null || true
echo -e "${GREEN}✓ Port-forward stopped${NC}"
echo ""

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Build and Push Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${CYAN}📋 Image Information:${NC}"
echo -e "   Registry: ${REGISTRY_HOST}"
echo -e "   Image: ${FULL_IMAGE}"
echo -e "   Git Commit: ${GIT_COMMIT}"
echo -e "   Git Branch: ${GIT_BRANCH}"
echo -e "   Build Time: ${BUILD_TIME}"
echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo -e "   1. Deploy/update proxy deployment (use existing files in k8s/):"
echo -e "      ${CYAN}kubectl apply -f k8s/sqlite-proxy-deployment.yaml${NC}"
echo -e "      ${CYAN}kubectl apply -f k8s/sqlite-proxy-service.yaml${NC}"
echo ""
echo -e "   2. Verify deployment:"
echo -e "      ${CYAN}kubectl get deployment sqlite-proxy -n easy-kanban${NC}"
echo -e "      ${CYAN}kubectl get pods -n easy-kanban -l app=sqlite-proxy${NC}"
echo ""
echo -e "   3. Check proxy health:"
echo -e "      ${CYAN}kubectl exec -n easy-kanban deployment/sqlite-proxy -- wget -qO- http://localhost:3001/health${NC}"
echo ""

