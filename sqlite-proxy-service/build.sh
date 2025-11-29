#!/bin/bash

# Build script for SQLite Proxy Service
# Builds and optionally pushes the Docker image

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Default values
REGISTRY="${REGISTRY:-your-registry}"
IMAGE_NAME="${IMAGE_NAME:-sqlite-proxy}"
VERSION="${VERSION:-latest}"
PUSH="${PUSH:-false}"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🔨 Building SQLite Proxy Service${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

FULL_IMAGE_NAME="${REGISTRY}/${IMAGE_NAME}:${VERSION}"

echo -e "${BLUE}📦 Image: ${FULL_IMAGE_NAME}${NC}"
echo ""

# Build image
echo -e "${GREEN}Step 1/2: Building Docker image...${NC}"
docker build -t "${FULL_IMAGE_NAME}" .

if [ "$PUSH" = "true" ]; then
    echo ""
    echo -e "${GREEN}Step 2/2: Pushing to registry...${NC}"
    docker push "${FULL_IMAGE_NAME}"
    echo ""
    echo -e "${GREEN}✅ Image pushed: ${FULL_IMAGE_NAME}${NC}"
else
    echo ""
    echo -e "${YELLOW}ℹ️  Image built: ${FULL_IMAGE_NAME}${NC}"
    echo -e "${YELLOW}   To push: docker push ${FULL_IMAGE_NAME}${NC}"
    echo -e "${YELLOW}   Or set PUSH=true: PUSH=true ./build.sh${NC}"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Build Complete${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

