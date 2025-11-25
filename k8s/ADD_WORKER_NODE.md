# Adding k8s2 as a Worker Node to Kubernetes Cluster

## Overview

This guide explains how to add the new VM (k8s2) as a worker node to your existing Kubernetes cluster. This will allow Kubernetes to schedule pods on k8s2, extending your cluster's capacity.

## Current Cluster Status

- **Control Plane Node**: k8s (10.0.0.170)
- **Kubernetes Version**: v1.32.3
- **Container Runtime**: containerd
- **New Worker Node**: k8s2

## Prerequisites

1. **Network Connectivity**: k8s2 must be able to reach the control plane at `10.0.0.170:6443`
2. **SSH Access**: You must be able to SSH into k8s2 with sudo privileges
3. **System Requirements**:
   - Ubuntu 22.04 (recommended, or compatible Linux distribution)
   - At least 2 CPU cores
   - At least 2GB RAM
   - Swap disabled (required for Kubernetes)

## Method 1: Automated Script (Recommended)

### Step 1: Copy the script to k8s2

From your local machine or control plane:

```bash
# Option A: If you have SSH access from current machine
scp k8s/add-worker-node.sh user@k8s2:/tmp/

# Option B: Copy manually or use your preferred method
```

### Step 2: Get the join command from control plane

On the **control plane node (k8s)**:

```bash
kubeadm token create --print-join-command
```

This will output something like:
```
kubeadm join 10.0.0.170:6443 --token vf7u3n.t4aco2catnad7pc2 --discovery-token-ca-cert-hash sha256:90b8a1e6c74952af9ab82884f3883044a5bfb96d5dab1aeb47e6ce413c39b934
```

**Note**: Tokens expire after 24 hours. If you need a new token, run the command above again.

### Step 3: Run the setup script on k8s2

SSH into k8s2 and run:

```bash
sudo bash /tmp/add-worker-node.sh
```

When prompted, paste the join command from Step 2.

## Method 2: Manual Setup

### Step 1: Install prerequisites on k8s2

SSH into k8s2 and run:

```bash
# Update system
sudo apt-get update
sudo apt-get install -y apt-transport-https ca-certificates curl gpg

# Add Kubernetes repository
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.32/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.32/deb/ /' | sudo tee /etc/apt/sources.list.d/kubernetes.list
sudo apt-get update

# Install kubelet, kubeadm, kubectl
sudo apt-get install -y kubelet=1.32.3-1.1 kubeadm=1.32.3-1.1 kubectl=1.32.3-1.1
sudo apt-mark hold kubelet kubeadm kubectl

# Install NFS client utilities (required for NFS volume mounts)
sudo apt-get install -y nfs-common

# Configure containerd
sudo mkdir -p /etc/containerd
containerd config default | sudo tee /etc/containerd/config.toml
sudo sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml
sudo systemctl restart containerd
sudo systemctl enable containerd

# Load kernel modules
sudo modprobe overlay
sudo modprobe br_netfilter

# Configure sysctl
cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
sudo sysctl --system

# Disable swap
sudo swapoff -a
sudo sed -i '/ swap / s/^\(.*\)$/#\1/g' /etc/fstab
```

### Step 2: Get join command from control plane

On the **control plane node (k8s)**:

```bash
kubeadm token create --print-join-command
```

### Step 3: Join the cluster

On **k8s2**, run the join command from Step 2:

```bash
sudo kubeadm join 10.0.0.170:6443 --token <TOKEN> --discovery-token-ca-cert-hash sha256:<HASH>
```

## Verification

After joining, verify on the **control plane node**:

```bash
# Check nodes
kubectl get nodes

# Check node details
kubectl describe node k8s2

# Check if node is ready
kubectl get nodes -o wide
```

You should see k8s2 listed with status `Ready`.

## Post-Join Configuration (Optional)

### Label the node

```bash
kubectl label node k8s2 node-role.kubernetes.io/worker=worker
```

### Add taints/tolerations (if needed)

If you want to prevent certain pods from scheduling on k8s2, you can add taints:

```bash
kubectl taint node k8s2 key=value:NoSchedule
```

### Verify pod scheduling

Test that pods can be scheduled on k8s2:

```bash
kubectl run test-pod --image=nginx --overrides='{"spec": {"nodeSelector": {"kubernetes.io/hostname": "k8s2"}}}'
kubectl get pod test-pod -o wide
```

## Troubleshooting

### Node not showing as Ready

1. Check kubelet status on k8s2:
   ```bash
   sudo systemctl status kubelet
   sudo journalctl -u kubelet -f
   ```

2. Check network connectivity:
   ```bash
   # On k8s2
   telnet 10.0.0.170 6443
   ```

3. Check firewall rules (ports 10250, 6443 should be open)

### Token expired

If the join token expired, generate a new one on the control plane:
```bash
kubeadm token create --print-join-command
```

### Node stuck in NotReady

1. Check if swap is disabled:
   ```bash
   free -h
   swapon --show
   ```

2. Check containerd status:
   ```bash
   sudo systemctl status containerd
   ```

3. Check kubelet logs:
   ```bash
   sudo journalctl -u kubelet --no-pager | tail -50
   ```

## Important Notes

1. **NFS Storage**: If you're using NFS (as configured in your setup), ensure k8s2 can access the NFS server. The NFS server pod runs on the control plane, so network connectivity is required.

2. **Image Pulling**: Worker nodes need to pull container images. Ensure:
   - Network access to container registries
   - Or pre-load images on k8s2 if using local images

3. **Storage**: If using local storage (local-path-provisioner), you may need to set up storage paths on k8s2 as well, or use NFS for shared storage.

4. **Resource Limits**: Consider setting resource requests/limits in your deployments to ensure proper scheduling across nodes.

## Next Steps

After k8s2 is successfully added:

1. **Monitor resource usage**: `kubectl top nodes`
2. **Schedule pods**: Pods will automatically be scheduled on k8s2 when resources are available
3. **Add more nodes**: Repeat this process for additional worker nodes

## Current Join Command

**⚠️ Note**: Tokens expire after 24 hours. Generate a new one if needed.

To get the current join command, run on the control plane:
```bash
kubeadm token create --print-join-command
```

