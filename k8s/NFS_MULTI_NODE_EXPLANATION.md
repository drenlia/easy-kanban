# NFS Storage Across Multiple Kubernetes Nodes

## Overview

This document explains how NFS (Network File System) storage works in your Kubernetes cluster when pods are scheduled on different nodes (k8s and k8s2).

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                           │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Node: k8s (Control Plane)                                │ │
│  │  IP: 10.0.0.170                                           │ │
│  │  ┌────────────────────────────────────────────────────┐   │ │
│  │  │  NFS Server Pod                                     │   │ │
│  │  │  - Pod IP: 10.244.0.139                            │   │ │
│  │  │  - Service: nfs-server.easy-kanban.svc.cluster.local│   │ │
│  │  │  - ClusterIP: 10.99.114.55                          │   │ │
│  │  │  - Storage: /data/nfs-server (hostPath)             │   │ │
│  │  │  - Exports:                                         │   │ │
│  │  │    * /exports/data                                   │   │ │
│  │  │    * /exports/attachments                           │   │ │
│  │  │    * /exports/avatars                                │   │ │
│  │  └────────────────────────────────────────────────────┘   │ │
│  │                                                             │ │
│  │  ┌────────────────────────────────────────────────────┐   │ │
│  │  │  App Pod 1 (easy-kanban-xxx)                       │   │ │
│  │  │  - Mounts: NFS PVCs                                 │   │ │
│  │  │  - Data: /app/server/data (NFS)                    │   │ │
│  │  └────────────────────────────────────────────────────┘   │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Node: k8s2 (Worker Node)                                 │ │
│  │  ┌────────────────────────────────────────────────────┐   │ │
│  │  │  App Pod 2 (easy-kanban-yyy)                       │   │ │
│  │  │  - Mounts: NFS PVCs                                 │   │ │
│  │  │  - Data: /app/server/data (NFS)                    │   │ │
│  │  │  - Network: Connects to NFS server via ClusterIP    │   │ │
│  │  └────────────────────────────────────────────────────┘   │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## How NFS Works Across Nodes

### 1. NFS Server Location

The NFS server runs as a **pod** in your cluster:
- **Current Location**: Node `k8s` (control plane)
- **Pod Name**: `nfs-server-7767d77bcb-zdxj8`
- **Namespace**: `easy-kanban`
- **Storage Backend**: Host path at `/data/nfs-server` on node `k8s`

### 2. NFS Service (ClusterIP)

The NFS server is exposed via a Kubernetes Service:
- **Service Name**: `nfs-server.easy-kanban.svc.cluster.local`
- **ClusterIP**: `10.99.114.55` (internal cluster IP)
- **Ports**: 
  - 2049 (NFS)
  - 32767 (mountd)
  - 32765 (statd)
  - 111 (rpcbind)

**Key Point**: The ClusterIP service is accessible from **any pod in the cluster**, regardless of which node the pod runs on.

### 3. PersistentVolumes Reference NFS Server

Your PersistentVolumes are configured to use the NFS server:

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: easy-kanban-shared-storage-data
spec:
  capacity:
    storage: 500Gi
  accessModes:
    - ReadWriteMany  # ← Key: Multiple pods can mount simultaneously
  nfs:
    server: 10.99.114.55  # ← NFS service ClusterIP
    path: /exports/data
```

**Important**: The `server` field uses the **ClusterIP** (`10.99.114.55`), not the pod IP. This means:
- ✅ Works from any node in the cluster
- ✅ Survives pod restarts (service IP doesn't change)
- ✅ Load-balanced if NFS server has multiple replicas

### 4. How Pods on Different Nodes Access NFS

When a pod on **k8s2** mounts an NFS volume:

1. **Kubernetes mounts the volume** using the NFS client built into the node's kernel
2. **Node k8s2** connects to the NFS server at `10.99.114.55:2049`
3. **Kubernetes networking** routes the connection to the NFS server pod on node `k8s`
4. **NFS protocol** handles the file system operations
5. **All pods** (on any node) see the same files

### 5. Network Path

```
Pod on k8s2
    ↓
Node k8s2 (NFS client)
    ↓
Kubernetes CNI (network plugin)
    ↓
ClusterIP Service (10.99.114.55)
    ↓
NFS Server Pod on k8s
    ↓
Host Path (/data/nfs-server on k8s)
```

## ReadWriteMany (RWX) Access Mode

Your NFS volumes use `ReadWriteMany` access mode, which means:

- ✅ **Multiple pods can mount the same volume simultaneously**
- ✅ **Pods can be on different nodes** (k8s and k8s2)
- ✅ **All pods see the same data** in real-time
- ✅ **Perfect for shared storage** (databases, attachments, avatars)

This is different from `ReadWriteOnce` (RWO) which only allows one pod to mount at a time.

## What Happens When You Add k8s2

### Before Adding k8s2

```
k8s (Control Plane)
├── NFS Server Pod
└── App Pods (all on k8s)
    └── Mount NFS via localhost/ClusterIP
```

### After Adding k8s2

```
k8s (Control Plane)
├── NFS Server Pod
└── App Pods (some on k8s)
    └── Mount NFS via ClusterIP

k8s2 (Worker Node)
└── App Pods (some on k8s2)
    └── Mount NFS via ClusterIP (network route to k8s)
```

**Key Points**:
1. NFS server stays on k8s (or wherever it's scheduled)
2. Pods on k8s2 connect to NFS server via ClusterIP
3. Network traffic flows: k8s2 → ClusterIP → NFS pod on k8s
4. All pods see the same shared storage

## Network Requirements

For NFS to work across nodes, ensure:

1. **Cluster Networking**: Kubernetes CNI (Container Network Interface) must allow pod-to-pod communication across nodes
   - Your cluster uses a CNI plugin (likely Flannel, Calico, or similar)
   - This is typically configured during cluster setup

2. **NFS Ports**: The following ports must be accessible:
   - **2049** (NFS)
   - **32767** (mountd)
   - **32765** (statd)
   - **111** (rpcbind)

3. **Firewall**: If you have firewall rules, ensure these ports are open between nodes

## Performance Considerations

### Network Latency

- **Local mounts** (pod on k8s): Very low latency (same node)
- **Remote mounts** (pod on k8s2): Slightly higher latency (network hop)
- **Impact**: Usually negligible for most applications, but consider for high I/O workloads

### Bandwidth

- All NFS traffic goes through the cluster network
- If you have many pods on k8s2 accessing NFS, ensure sufficient network bandwidth
- Consider the network link speed between k8s and k8s2

### NFS Server Location

Currently, the NFS server pod can be scheduled on any node. To optimize:

**Option 1: Keep NFS server on control plane (current)**
- Pros: Simple, predictable location
- Cons: Control plane node handles both control and storage traffic

**Option 2: Schedule NFS server on k8s2**
- Pros: Distributes load
- Cons: Requires node affinity configuration

**Option 3: Dedicated storage node**
- Pros: Isolated storage traffic
- Cons: Requires additional node

## Troubleshooting Cross-Node NFS

### Test NFS Connectivity from k8s2

After adding k8s2, test NFS connectivity:

```bash
# On k8s2, create a test pod
kubectl run nfs-test --rm -i --tty --image=busybox --restart=Never -n easy-kanban -- sh

# Inside the pod, test NFS mount
mount -t nfs 10.99.114.55:/exports/data /mnt
ls -la /mnt
```

### Check Network Connectivity

```bash
# From a pod on k8s2, test connectivity to NFS service
kubectl run net-test --rm -i --tty --image=busybox --restart=Never -n easy-kanban -- sh
# Inside pod:
telnet 10.99.114.55 2049
```

### Verify NFS Mounts

```bash
# Check which pods are using NFS volumes
kubectl get pods -n easy-kanban -o wide

# Check volume mounts
kubectl describe pod <pod-name> -n easy-kanban | grep -A 10 "Mounts:"
```

### Common Issues

1. **NFS mount fails on k8s2**
   - Check: Cluster networking (CNI) is working
   - Check: NFS service is accessible from k8s2
   - Check: Firewall rules allow NFS ports

2. **Slow performance**
   - Check: Network bandwidth between nodes
   - Check: NFS server pod resources (CPU/memory)
   - Consider: Moving NFS server closer to workload

3. **Permission issues**
   - NFS exports use `no_root_squash`, so root in pods maps to root on NFS
   - Ensure directory permissions are correct on NFS server

## Best Practices

1. **Monitor NFS Server**: Keep an eye on NFS server pod health and resources
2. **Backup Strategy**: Since all data is in one place, ensure regular backups
3. **Network Monitoring**: Monitor network traffic between nodes for NFS
4. **Resource Limits**: Set appropriate resource limits on NFS server pod
5. **High Availability**: Consider NFS server redundancy if critical

## Summary

✅ **NFS works seamlessly across nodes** - Pods on k8s2 can access NFS storage just like pods on k8s

✅ **No additional configuration needed** - The ClusterIP service makes NFS accessible cluster-wide

✅ **Network is the key** - As long as cluster networking works, NFS works

✅ **ReadWriteMany enables sharing** - Multiple pods on different nodes can mount the same volume

The main requirement is that **k8s2 can reach the NFS service ClusterIP** (`10.99.114.55`), which should work automatically through Kubernetes networking.

