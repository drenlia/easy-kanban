#!/bin/bash

# Sync Docker Image to Worker Node
# Alternative approach: Copy image directly to node's containerd

set -e

NODE_NAME="${1:-k8s2}"
IMAGE_NAME="${2:-easy-kanban:latest}"

if [ -z "$1" ]; then
    echo "Usage: $0 <node-name> [image-name]"
    echo "Example: $0 k8s2 easy-kanban:latest"
    exit 1
fi

echo "🚀 Syncing image ${IMAGE_NAME} to node ${NODE_NAME}..."
echo ""

# Check if image exists locally
if ! docker images | grep -q "${IMAGE_NAME%:*}"; then
    echo "❌ Image ${IMAGE_NAME} not found locally"
    echo "   Build it first: docker build -f Dockerfile.prod -t ${IMAGE_NAME} ."
    exit 1
fi

echo "📦 Saving image to tar..."
docker save ${IMAGE_NAME} > /tmp/image-${IMAGE_NAME//\//-}.tar

echo "📤 Copying to ${NODE_NAME}..."
scp /tmp/image-${IMAGE_NAME//\//-}.tar ${NODE_NAME}:/tmp/

echo "📥 Importing on ${NODE_NAME}..."
ssh ${NODE_NAME} "sudo ctr -n k8s.io images import /tmp/image-${IMAGE_NAME//\//-}.tar && rm /tmp/image-${IMAGE_NAME//\//-}.tar"

# Cleanup local tar
rm /tmp/image-${IMAGE_NAME//\//-}.tar

echo ""
echo "✅ Image synced successfully!"
echo ""
echo "📋 Verify on ${NODE_NAME}:"
echo "   ssh ${NODE_NAME} 'sudo crictl images | grep ${IMAGE_NAME%:*}'"
echo ""

