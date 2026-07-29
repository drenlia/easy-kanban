#!/bin/bash

# Build and Push kanban-runner image to Internal Registry
# Shared agent runner for easy-kanban-pg (all tenants).

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

REGISTRY_HOST="internal-registry.kube-system.svc.cluster.local:5000"
IMAGE_NAME="easy-kanban-runner"
IMAGE_TAG="latest"
FULL_IMAGE="${REGISTRY_HOST}/${IMAGE_NAME}:${IMAGE_TAG}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🐳 Build and Push kanban-runner to Internal Registry${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${YELLOW}🔍 Checking registry...${NC}"
if ! kubectl get svc internal-registry -n kube-system >/dev/null 2>&1; then
    echo -e "${RED}❌ Internal registry not found. Run ./k8s/setup-registry.sh first${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Registry is running${NC}"
echo ""

cd "$PROJECT_ROOT"
echo -e "${CYAN}📁 Working directory: ${PROJECT_ROOT}${NC}"
echo ""

echo -e "${YELLOW}🔍 Checking Docker...${NC}"
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker and try again.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker is running${NC}"
echo ""

if [ ! -f "runner/Dockerfile" ]; then
    echo -e "${RED}❌ runner/Dockerfile not found in ${PROJECT_ROOT}${NC}"
    exit 1
fi

GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo -e "${CYAN}   Git Commit: ${GIT_COMMIT}${NC}"
echo -e "${CYAN}   Git Branch: ${GIT_BRANCH}${NC}"
echo -e "${CYAN}   Build Time: ${BUILD_TIME}${NC}"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🔨 Building Docker image (runner/)...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

docker build -f runner/Dockerfile -t "${IMAGE_NAME}:${IMAGE_TAG}" ./runner

echo ""
echo -e "${GREEN}✅ Docker image built successfully!${NC}"
echo ""
docker images "${IMAGE_NAME}:${IMAGE_TAG}" --format "Image: {{.Repository}}:{{.Tag}}\nImage ID: {{.ID}}\nCreated: {{.CreatedSince}}\nSize: {{.Size}}"
echo ""

REGISTRY_IP=$(kubectl get svc internal-registry -n kube-system -o jsonpath='{.spec.clusterIP}')
REGISTRY_PORT=$(kubectl get svc internal-registry -n kube-system -o jsonpath='{.spec.ports[0].port}')

echo -e "${YELLOW}🔗 Setting up port-forward to registry...${NC}"
echo -e "${CYAN}   Forwarding localhost:5000 to ${REGISTRY_IP}:${REGISTRY_PORT}${NC}"

EXISTING_PF=$(lsof -ti :5000 2>/dev/null || true)
if [ -n "$EXISTING_PF" ]; then
    echo -e "${YELLOW}   Killing existing port-forward (PID: ${EXISTING_PF})...${NC}"
    kill $EXISTING_PF 2>/dev/null || true
    sleep 1
fi

kubectl port-forward -n kube-system svc/internal-registry 5000:${REGISTRY_PORT} > /tmp/registry-port-forward-runner.log 2>&1 &
PF_PID=$!
sleep 3
if ! kill -0 $PF_PID 2>/dev/null; then
    echo -e "${RED}❌ Port-forward failed${NC}"
    cat /tmp/registry-port-forward-runner.log 2>/dev/null || true
    exit 1
fi
echo -e "${GREEN}✓ Port-forward active (PID: ${PF_PID})${NC}"
echo ""

LOCAL_REGISTRY="localhost:5000"
LOCAL_FULL_IMAGE="${LOCAL_REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"

echo -e "${YELLOW}📦 Tagging image for registry...${NC}"
docker tag "${IMAGE_NAME}:${IMAGE_TAG}" "${LOCAL_FULL_IMAGE}"
# Also tag with the NodePort/registry IP used by Deployments
docker tag "${IMAGE_NAME}:${IMAGE_TAG}" "10.110.240.233:5000/${IMAGE_NAME}:${IMAGE_TAG}"
echo -e "${GREEN}✓ Tagged as ${LOCAL_FULL_IMAGE}${NC}"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📤 Pushing image to registry...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

docker push "${LOCAL_FULL_IMAGE}"

kill $PF_PID 2>/dev/null || true
echo -e "${GREEN}✓ Port-forward stopped${NC}"
echo ""

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Runner Build and Push Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${CYAN}📋 Image Information:${NC}"
echo -e "   Cluster pull: 10.110.240.233:5000/${IMAGE_NAME}:${IMAGE_TAG}"
echo -e "   Service DNS:  ${FULL_IMAGE}"
echo -e "   Git Commit: ${GIT_COMMIT}"
echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo -e "   kubectl apply -f k8s/runner-secret-pg.yaml   # after replacing RUNNER_TOKEN_PLACEHOLDER"
echo -e "   kubectl apply -f k8s/runner-deployment-pg.yaml"
echo -e "   kubectl rollout restart deployment/kanban-runner -n easy-kanban-pg"
echo -e "   kubectl rollout restart deployment/easy-kanban -n easy-kanban-pg"
echo ""
