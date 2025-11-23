#!/bin/bash

# Automated script to set up k8s2 as a worker node
# This script runs on the control plane and sets up k8s2 remotely

set -e

JOIN_COMMAND="$1"

if [ -z "$JOIN_COMMAND" ]; then
    echo "❌ Usage: $0 '<join-command>'"
    echo ""
    echo "Example:"
    echo "  $0 'kubeadm join 10.0.0.170:6443 --token xxxx --discovery-token-ca-cert-hash sha256:xxxx'"
    exit 1
fi

echo "🚀 Setting up k8s2 as a worker node..."
echo ""

# Configuration
KUBERNETES_VERSION="1.32.3"
K8S2_HOST="k8s2"

echo "📋 Step 1: Installing prerequisites on ${K8S2_HOST}..."
ssh ${K8S2_HOST} "sudo bash -c '
    # Update system
    apt-get update
    apt-get install -y apt-transport-https ca-certificates curl gpg
    
    # Add Kubernetes repository
    if [ ! -f /etc/apt/keyrings/kubernetes-apt-keyring.gpg ]; then
        mkdir -p /etc/apt/keyrings
        curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.32/deb/Release.key | gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
        echo \"deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.32/deb/ /\" | tee /etc/apt/sources.list.d/kubernetes.list
        apt-get update
    fi
    
    # Install kubelet, kubeadm, kubectl
    apt-get install -y kubelet=${KUBERNETES_VERSION}-1.1 kubeadm=${KUBERNETES_VERSION}-1.1 kubectl=${KUBERNETES_VERSION}-1.1
    apt-mark hold kubelet kubeadm kubectl
    
    # Install NFS client utilities (required for NFS volume mounts)
    apt-get install -y nfs-common
'"

echo "✅ Prerequisites installed"
echo ""

echo "📋 Step 2: Configuring containerd..."
ssh ${K8S2_HOST} "sudo bash -c '
    # Install containerd if not present
    if ! command -v containerd &> /dev/null; then
        apt-get install -y containerd
    fi
    
    # Configure containerd
    if [ ! -f /etc/containerd/config.toml.bak ]; then
        mkdir -p /etc/containerd
        containerd config default | tee /etc/containerd/config.toml
        sed -i \"s/SystemdCgroup = false/SystemdCgroup = true/\" /etc/containerd/config.toml
        systemctl restart containerd
        systemctl enable containerd
    fi
'"

echo "✅ Containerd configured"
echo ""

echo "📋 Step 3: Configuring kernel modules and sysctl..."
ssh ${K8S2_HOST} "sudo bash -c '
    # Load kernel modules
    modprobe overlay
    modprobe br_netfilter
    
    # Configure sysctl
    cat <<EOF | tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
    sysctl --system
'"

echo "✅ Kernel configuration complete"
echo ""

echo "📋 Step 4: Disabling swap..."
ssh ${K8S2_HOST} "sudo bash -c '
    swapoff -a
    sed -i \"/ swap / s/^\\(.*\\)\$/\\#\\1/g\" /etc/fstab
'"

echo "✅ Swap disabled"
echo ""

echo "📋 Step 5: Joining cluster..."
ssh ${K8S2_HOST} "sudo ${JOIN_COMMAND}"

echo ""
echo "✅ Join command executed!"
echo ""

echo "⏳ Waiting for node to register..."
sleep 15

echo ""
echo "📋 Verifying node status..."
kubectl get nodes

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📋 Next steps:"
echo "  1. Verify node: kubectl get nodes -o wide"
echo "  2. Check node details: kubectl describe node ${K8S2_HOST}"
echo "  3. Test NFS connectivity: ./k8s/test-nfs-connectivity.sh"
echo ""

