# Internal Registry Setup and Configuration

## Overview

The internal container registry is used to distribute Docker images across all Kubernetes nodes. This document describes the setup and configuration required.

## Registry Service

- **Service Name**: `internal-registry.kube-system.svc.cluster.local:5000`
- **ClusterIP**: `10.110.240.233:5000` (may vary - check with `kubectl get svc internal-registry -n kube-system`)
- **Namespace**: `kube-system`

## Deployment Image Reference

The deployment uses the **IP address** instead of the service name because:
- Containerd on host nodes cannot resolve Kubernetes DNS names
- The IP address is stable (ClusterIP) and works from both pods and host nodes

**Current image reference in deployment:**
```yaml
image: 10.110.240.233:5000/easy-kanban:latest
```

**Note**: The `app-deployment.yaml` file contains `IMAGE_NAME_PLACEHOLDER` which is replaced during deployment. The actual registry IP should be determined dynamically or hardcoded based on your setup.

## Containerd Configuration

Containerd on **all nodes** (k8s, k8s2, etc.) must be configured to:
1. Trust the registry (insecure registry)
2. Use both service name AND IP address (for flexibility)

### Automated Configuration

Run the configuration script:
```bash
./k8s/configure-containerd-registry.sh
```

This script:
- Detects the registry ClusterIP automatically
- Configures both service name and IP address
- Applies configuration to all nodes
- Restarts containerd on each node

### Manual Configuration

For each node, add to `/etc/containerd/config.toml`:

```toml
# Service name (for pods that can resolve DNS)
[plugins."io.containerd.grpc.v1.cri".registry.mirrors."internal-registry.kube-system.svc.cluster.local:5000"]
  endpoint = ["http://internal-registry.kube-system.svc.cluster.local:5000"]

[plugins."io.containerd.grpc.v1.cri".registry.configs."internal-registry.kube-system.svc.cluster.local:5000".tls]
  insecure_skip_verify = true

# IP address (for containerd on host nodes)
[plugins."io.containerd.grpc.v1.cri".registry.mirrors."10.110.240.233:5000"]
  endpoint = ["http://10.110.240.233:5000"]

[plugins."io.containerd.grpc.v1.cri".registry.configs."10.110.240.233:5000".tls]
  insecure_skip_verify = true
```

**Important**: Replace `10.110.240.233` with your actual registry ClusterIP.

After editing, restart containerd:
```bash
sudo systemctl restart containerd
```

## Why Both Service Name and IP?

- **Service Name**: Used by pods inside the cluster (can resolve Kubernetes DNS)
- **IP Address**: Used by containerd on host nodes (cannot resolve Kubernetes DNS)

Having both ensures:
- Pods can pull images using the service name
- Host nodes can pull images using the IP address
- Maximum compatibility across different scenarios

## Verification

### Check Registry Service
```bash
kubectl get svc internal-registry -n kube-system
```

### Check Registry Pod
```bash
kubectl get pods -n kube-system -l app=internal-registry
```

### Test Image Pull from Node
```bash
# On any node
sudo ctr -n k8s.io images pull 10.110.240.233:5000/easy-kanban:latest
```

### Test from Pod
```bash
kubectl run test --image=busybox --rm -it --restart=Never -- \
  wget -O- http://internal-registry.kube-system.svc.cluster.local:5000/v2/
```

## Troubleshooting

### Image Pull Fails with "http: server gave HTTP response to HTTPS client"
- **Cause**: Containerd is trying to use HTTPS instead of HTTP
- **Fix**: Ensure `insecure_skip_verify = true` is set in containerd config

### Image Pull Fails with "dial tcp: lookup internal-registry.kube-system.svc.cluster.local: no such host"
- **Cause**: Using service name from host node (cannot resolve Kubernetes DNS)
- **Fix**: Use IP address instead, or ensure both service name and IP are configured

### Pods on k8s2 Cannot Pull Images
- **Cause**: Containerd on k8s2 not configured for the registry
- **Fix**: Run `./k8s/configure-containerd-registry.sh` or manually configure k8s2

## Updating Deployment Image

When the registry IP changes (e.g., after registry recreation):

1. Get new IP:
   ```bash
   kubectl get svc internal-registry -n kube-system -o jsonpath='{.spec.clusterIP}'
   ```

2. Update deployment:
   ```bash
   kubectl set image deployment/easy-kanban \
     easy-kanban=NEW_IP:5000/easy-kanban:latest \
     -n easy-kanban
   ```

3. Update containerd config on all nodes (use the script or manual method above)

## Related Files

- `k8s/setup-registry.sh` - Creates the internal registry
- `k8s/configure-containerd-registry.sh` - Configures containerd on all nodes
- `k8s/build-and-push-to-registry.sh` - Builds and pushes images to registry
- `k8s/app-deployment.yaml` - Deployment manifest (uses `IMAGE_NAME_PLACEHOLDER`)

