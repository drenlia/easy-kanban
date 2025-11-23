#!/bin/bash

# Script to add a new worker node (k8s2) to the Kubernetes cluster
# This script should be run on the NEW worker node (k8s2) with sudo privileges

set -e

echo "🚀 Adding k8s2 as a worker node to Kubernetes cluster..."
echo ""

# Configuration
CONTROL_PLANE_IP="10.0.0.170"
CONTROL_PLANE_PORT="6443"
KUBERNETES_VERSION="1.32.3"

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    echo "❌ This script must be run with sudo"
    exit 1
fi

echo "📋 Prerequisites check..."
echo ""

# 1. Update system packages
echo "📦 Updating system packages..."
apt-get update
apt-get install -y apt-transport-https ca-certificates curl gpg

# 2. Add Kubernetes repository
echo "🔧 Adding Kubernetes repository..."
if [ ! -f /etc/apt/keyrings/kubernetes-apt-keyring.gpg ]; then
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.32/deb/Release.key | gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
    echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.32/deb/ /' | tee /etc/apt/sources.list.d/kubernetes.list
    apt-get update
fi

# 3. Install kubelet, kubeadm, kubectl
echo "📥 Installing kubelet, kubeadm, kubectl..."
apt-get install -y kubelet=${KUBERNETES_VERSION}-1.1 kubeadm=${KUBERNETES_VERSION}-1.1 kubectl=${KUBERNETES_VERSION}-1.1
apt-mark hold kubelet kubeadm kubectl

# 3a. Install NFS client utilities (required for NFS volume mounts)
echo "📥 Installing NFS client utilities..."
apt-get install -y nfs-common

# 4. Configure containerd (if not already configured)
echo "🐳 Configuring containerd..."
if [ ! -f /etc/containerd/config.toml.bak ]; then
    mkdir -p /etc/containerd
    containerd config default | tee /etc/containerd/config.toml
    sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml
    systemctl restart containerd
    systemctl enable containerd
fi

# 5. Load required kernel modules
echo "🔧 Loading kernel modules..."
modprobe overlay
modprobe br_netfilter

# 6. Configure sysctl
echo "⚙️  Configuring sysctl..."
cat <<EOF | tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
sysctl --system

# 7. Disable swap (required for Kubernetes)
echo "🔄 Disabling swap..."
swapoff -a
sed -i '/ swap / s/^\(.*\)$/#\1/g' /etc/fstab

# 8. Get join command from control plane
echo "🔑 Obtaining join token from control plane..."
echo ""
echo "⚠️  You need to run the following command on the CONTROL PLANE node (k8s):"
echo ""
echo "   kubeadm token create --print-join-command"
echo ""
echo "Then run the output command here on k8s2, OR:"
echo ""
read -p "Enter the join command (or press Enter to skip and join manually later): " JOIN_COMMAND

if [ -n "$JOIN_COMMAND" ]; then
    echo ""
    echo "🔗 Joining cluster..."
    eval "$JOIN_COMMAND"
    
    echo ""
    echo "✅ Node join initiated!"
    echo ""
    echo "⏳ Waiting for node to be ready..."
    sleep 10
    
    # Note: kubectl might not be configured on this node yet
    echo ""
    echo "📋 To verify the node was added, run on the control plane:"
    echo "   kubectl get nodes"
    echo ""
else
    echo ""
    echo "📝 To join manually, run the join command from the control plane:"
    echo "   kubeadm join ${CONTROL_PLANE_IP}:${CONTROL_PLANE_PORT} --token <TOKEN> --discovery-token-ca-cert-hash sha256:<HASH>"
    echo ""
fi

echo "🎉 Worker node setup complete!"
echo ""
echo "📋 Next steps:"
echo "  1. Verify node is added: kubectl get nodes (on control plane)"
echo "  2. Label the node (optional): kubectl label node k8s2 node-role.kubernetes.io/worker=worker"
echo "  3. Check node status: kubectl describe node k8s2"
echo ""

