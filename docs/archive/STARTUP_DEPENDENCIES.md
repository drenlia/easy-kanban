# Startup Dependencies and Order

This document explains the startup dependency chain for Easy Kanban to ensure proper initialization after system restarts.

## Startup Order

### 0. Kubernetes Core Services (Automatic)
- **System pods**: kube-system namespace pods (DNS, etc.)
- **Status**: Automatically started by Kubernetes
- **Dependency**: None

### 1. Cluster Nodes
- **k8s** (control-plane): Must be Ready
- **k8s2** (worker): Must be Ready
- **Dependency**: None (hardware/OS level)
- **Note**: NFS server requires k8s2 to be ready (data is on k8s2 host)

### 2. NFS Server
- **Deployment**: `nfs-server` in `easy-kanban` namespace
- **Node**: Pinned to `k8s2` (nodeSelector)
- **Dependencies**: 
  - k8s2 node must be Ready
  - NFS kernel modules loaded on k8s2
- **Init Containers**: None (first service to start)
- **Startup Time**: ~10-30 seconds
- **Health Check**: NFS port 2049 accessible

### 3. Image Registry
- **Deployment**: `internal-registry` in `kube-system` namespace
- **Dependencies**:
  - NFS server ready (for registry storage volume)
- **Init Containers**: None (waits for NFS via volume mount)
- **Startup Time**: ~10-20 seconds
- **Health Check**: Registry API on port 5000

### 4. SQLite Proxy
- **Deployment**: `sqlite-proxy` in `easy-kanban` namespace
- **Dependencies**:
  - ✅ NFS server ready (init container waits)
  - ✅ Registry ready (init container waits)
- **Init Containers**:
  1. `wait-for-nfs`: Waits for NFS server on port 2049
  2. `wait-for-registry`: Waits for registry on port 5000
- **Startup Time**: ~20-40 seconds (after dependencies)
- **Health Check**: HTTP `/health` on port 3001
- **Startup Probe**: Allows up to 150s for initialization

### 5. Easy Kanban Application
- **Deployment**: `easy-kanban` in `easy-kanban` namespace
- **Dependencies**:
  - ✅ SQLite proxy ready (init container waits)
  - ✅ NFS server ready (init container waits)
  - ✅ Registry ready (init container waits)
- **Init Containers**:
  1. `wait-for-sqlite-proxy`: Waits for SQLite proxy on port 3001
  2. `wait-for-nfs`: Waits for NFS server on port 2049
  3. `wait-for-registry`: Waits for registry on port 5000
- **Startup Time**: ~30-60 seconds (after dependencies)
- **Health Check**: HTTP `/ready` on port 3222
- **Startup Probe**: Allows up to 300s for initialization

## Implementation Details

### Init Containers

All init containers use `busybox:latest` image and check service availability using `nc` (netcat):

```yaml
initContainers:
- name: wait-for-service
  image: busybox:latest
  command: ['sh', '-c']
  args:
  - |
    until nc -z service.namespace.svc.cluster.local PORT; do
      sleep 5
    done
```

### Startup Probes

Startup probes give services extra time to initialize before liveness/readiness probes start:

- **SQLite Proxy**: 30 attempts × 5s = 150s max startup time
- **Easy Kanban**: 30 attempts × 10s = 300s max startup time

This prevents premature restarts during initialization.

### Health Checks

- **Liveness Probe**: Kills container if unhealthy (prevents zombie processes)
- **Readiness Probe**: Removes from service endpoints if not ready (prevents traffic to unhealthy pods)
- **Startup Probe**: Gives grace period before liveness/readiness start

## Recovery After Power Outage

### Automatic Recovery Steps

1. **Kubernetes starts** → Core services (DNS, etc.) come online
2. **Nodes become Ready** → k8s and k8s2 join cluster
3. **NFS Server starts** → Pod scheduled on k8s2, exports available
4. **Registry starts** → Mounts NFS volume, serves images
5. **SQLite Proxy starts** → Waits for NFS + Registry, then starts
6. **Easy Kanban starts** → Waits for Proxy + NFS + Registry, then starts

### Manual Recovery (if needed)

If automatic recovery fails, check in order:

```bash
# 1. Check nodes
kubectl get nodes

# 2. Check NFS server
kubectl get pods -n easy-kanban -l app=nfs-server
kubectl logs -n easy-kanban -l app=nfs-server

# 3. Check registry
kubectl get pods -n kube-system -l app=internal-registry
kubectl logs -n kube-system -l app=internal-registry

# 4. Check SQLite proxy
kubectl get pods -n easy-kanban -l app=sqlite-proxy
kubectl logs -n easy-kanban -l app=sqlite-proxy

# 5. Check application
kubectl get pods -n easy-kanban -l app=easy-kanban
kubectl logs -n easy-kanban -l app=easy-kanban
```

### Common Issues After Restart

1. **Swap enabled on k8s2**
   - Fix: `ssh k8s2 "sudo swapoff -a && sudo sed -i '/ swap / s/^/#/' /etc/fstab"`

2. **Flannel not working on k8s2**
   - Fix: `ssh k8s2 "sudo modprobe br_netfilter"`

3. **NFS modules not loaded on k8s2**
   - Fix: `ssh k8s2 "sudo modprobe nfs nfsd"`

4. **NFS server on wrong node**
   - Fix: Ensure `nodeSelector: kubernetes.io/hostname: k8s2` in deployment

5. **Registry can't mount NFS**
   - Fix: Restart registry pod after NFS is ready

## Testing Startup Order

To test the startup dependencies:

```bash
# Delete all pods to simulate restart
kubectl delete pods -n easy-kanban --all
kubectl delete pods -n kube-system -l app=internal-registry

# Watch startup order
watch -n 2 'kubectl get pods -n easy-kanban -o wide && echo "---" && kubectl get pods -n kube-system -l app=internal-registry'
```

Expected order:
1. NFS server starts first
2. Registry starts (after NFS)
3. SQLite proxy starts (after NFS + Registry)
4. Easy Kanban starts (after Proxy + NFS + Registry)

## Configuration Files

- **NFS Server**: `k8s/nfs-server-deployment.yaml`
- **SQLite Proxy**: `k8s/sqlite-proxy-deployment.yaml`
- **Easy Kanban**: `k8s/app-deployment.yaml`
- **Wait Scripts**: `k8s/scripts/wait-for-*.sh`

## Notes

- Init containers run **sequentially** (not in parallel)
- If any init container fails, the pod is not started
- Init containers are lightweight (busybox, ~1MB)
- Startup probes prevent premature restarts during initialization
- All dependencies are checked via network connectivity (nc/netcat)

