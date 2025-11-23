#!/bin/bash

# Build and Push Image to Internal Registry
# This script builds the image and pushes it to the internal registry

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
IMAGE_NAME="easy-kanban"
IMAGE_TAG="latest"
FULL_IMAGE="${REGISTRY_HOST}/${IMAGE_NAME}:${IMAGE_TAG}"

# Get the project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🐳 Build and Push to Internal Registry${NC}"
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

# Change to project root
cd "$PROJECT_ROOT"
echo -e "${CYAN}📁 Working directory: ${PROJECT_ROOT}${NC}"
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
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo -e "${CYAN}   Git Commit: ${GIT_COMMIT}${NC}"
echo -e "${CYAN}   Git Branch: ${GIT_BRANCH}${NC}"
echo -e "${CYAN}   Build Time: ${BUILD_TIME}${NC}"
echo ""

# Build the image
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🔨 Building Docker image...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

docker build -f Dockerfile.prod -t ${IMAGE_NAME}:${IMAGE_TAG} \
  --build-arg GIT_COMMIT="${GIT_COMMIT}" \
  --build-arg GIT_BRANCH="${GIT_BRANCH}" \
  --build-arg BUILD_TIME="${BUILD_TIME}" \
  .

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Docker image built successfully!${NC}"
else
    echo ""
    echo -e "${RED}❌ Docker build failed!${NC}"
    exit 1
fi

# Get registry service IP for port-forward
REGISTRY_IP=$(kubectl get svc internal-registry -n kube-system -o jsonpath='{.spec.clusterIP}')
REGISTRY_PORT=$(kubectl get svc internal-registry -n kube-system -o jsonpath='{.spec.ports[0].port}')

echo -e "${YELLOW}🔗 Setting up port-forward to registry...${NC}"
echo -e "${CYAN}   Forwarding localhost:5000 to ${REGISTRY_IP}:${REGISTRY_PORT}${NC}"

# Start port-forward in background
kubectl port-forward -n kube-system svc/internal-registry 5000:${REGISTRY_PORT} > /tmp/registry-port-forward.log 2>&1 &
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
echo -e "   1. Update deployment to use: ${FULL_IMAGE}"
echo -e "   2. Set ImagePullPolicy: Always (or IfNotPresent)"
echo -e "   3. Restart deployment: kubectl rollout restart deployment/<name> -n <namespace>"
echo ""

