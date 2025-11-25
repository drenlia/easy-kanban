#!/bin/bash

# Configure containerd on all nodes to access the internal registry
# This script configures both the service name and IP address for the registry
# because containerd on host nodes cannot resolve Kubernetes DNS names

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🔧 Configure containerd for Internal Registry${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Get registry service IP
REGISTRY_IP=$(kubectl get svc internal-registry -n kube-system -o jsonpath='{.spec.clusterIP}' 2>/dev/null || echo "")
if [ -z "$REGISTRY_IP" ]; then
    echo -e "${RED}❌ Internal registry service not found. Run ./k8s/setup-registry.sh first${NC}"
    exit 1
fi

REGISTRY_SERVICE_NAME="internal-registry.kube-system.svc.cluster.local:5000"
REGISTRY_IP_ADDRESS="${REGISTRY_IP}:5000"

echo -e "${CYAN}📋 Registry Configuration:${NC}"
echo -e "${CYAN}   Service Name: ${REGISTRY_SERVICE_NAME}${NC}"
echo -e "${CYAN}   IP Address: ${REGISTRY_IP_ADDRESS}${NC}"
echo ""

# Function to configure containerd on a node
configure_node() {
    local NODE_NAME=$1
    local CONFIG_FILE="/etc/containerd/config.toml"
    
    echo -e "${YELLOW}🔧 Configuring ${NODE_NAME}...${NC}"
    
    if [ "$NODE_NAME" = "localhost" ] || [ "$NODE_NAME" = "$(hostname)" ]; then
        # Local node
        NODE_CMD="sudo"
        NODE_PREFIX=""
    else
        # Remote node via SSH
        NODE_CMD="ssh ${NODE_NAME} sudo"
        NODE_PREFIX="ssh ${NODE_NAME}"
    fi
    
    # Check if containerd config exists
    if ! ${NODE_PREFIX} test -f "${CONFIG_FILE}"; then
        echo -e "${RED}❌ containerd config not found at ${CONFIG_FILE} on ${NODE_NAME}${NC}"
        return 1
    fi
    
    # Backup config
    ${NODE_CMD} cp "${CONFIG_FILE}" "${CONFIG_FILE}.bak.$(date +%s)"
    
    # Check if registry config already exists
    if ${NODE_PREFIX} grep -q "registry.kube-system.svc.cluster.local\|10.110.240.233:5000" "${CONFIG_FILE}"; then
        echo -e "${YELLOW}⚠️  Registry configuration already exists on ${NODE_NAME}, updating...${NC}"
        # Remove existing registry config
        ${NODE_CMD} sed -i '/\[plugins\."io\.containerd\.grpc\.v1\.cri"\.registry\.mirrors\."internal-registry\.kube-system\.svc\.cluster\.local:5000"\]/,/^$/d' "${CONFIG_FILE}"
        ${NODE_CMD} sed -i '/\[plugins\."io\.containerd\.grpc\.v1\.cri"\.registry\.configs\."internal-registry\.kube-system\.svc\.cluster\.local:5000"\]/,/^$/d' "${CONFIG_FILE}"
        ${NODE_CMD} sed -i '/\[plugins\."io\.containerd\.grpc\.v1\.cri"\.registry\.mirrors\."10\.110\.240\.233:5000"\]/,/^$/d' "${CONFIG_FILE}"
        ${NODE_CMD} sed -i '/\[plugins\."io\.containerd\.grpc\.v1\.cri"\.registry\.configs\."10\.110\.240\.233:5000"\]/,/^$/d' "${CONFIG_FILE}"
    fi
    
    # Add registry configuration for both service name and IP address
    ${NODE_CMD} bash -c "cat >> ${CONFIG_FILE} <<EOF

# Internal registry configuration (service name - for pods that can resolve DNS)
[plugins.\"io.containerd.grpc.v1.cri\".registry.mirrors.\"${REGISTRY_SERVICE_NAME}\"]
  endpoint = [\"http://${REGISTRY_SERVICE_NAME}\"]

[plugins.\"io.containerd.grpc.v1.cri\".registry.configs.\"${REGISTRY_SERVICE_NAME}\".tls]
  insecure_skip_verify = true

# Internal registry configuration (IP address - for containerd on host nodes)
[plugins.\"io.containerd.grpc.v1.cri\".registry.mirrors.\"${REGISTRY_IP_ADDRESS}\"]
  endpoint = [\"http://${REGISTRY_IP_ADDRESS}\"]

[plugins.\"io.containerd.grpc.v1.cri\".registry.configs.\"${REGISTRY_IP_ADDRESS}\".tls]
  insecure_skip_verify = true
EOF"
    
    # Restart containerd
    echo -e "${YELLOW}   Restarting containerd...${NC}"
    ${NODE_CMD} systemctl restart containerd
    
    # Wait for containerd to be ready
    sleep 2
    
    echo -e "${GREEN}✅ ${NODE_NAME} configured successfully${NC}"
    echo ""
}

# Get list of nodes
NODES=$(kubectl get nodes -o jsonpath='{.items[*].metadata.name}')

if [ -z "$NODES" ]; then
    echo -e "${RED}❌ No nodes found${NC}"
    exit 1
fi

# Configure each node
for NODE in $NODES; do
    configure_node "$NODE"
done

echo -e "${GREEN}✅ All nodes configured!${NC}"
echo ""
echo -e "${CYAN}📝 Note:${NC}"
echo -e "${CYAN}   - Service name (${REGISTRY_SERVICE_NAME}) is used by pods inside the cluster${NC}"
echo -e "${CYAN}   - IP address (${REGISTRY_IP_ADDRESS}) is used by containerd on host nodes${NC}"
echo -e "${CYAN}   - Both are configured to allow flexibility${NC}"
echo ""

