# NFS Setup for Multi-Tenant Kubernetes Deployment

## Overview

This guide explains how to set up NFS (Network File System) storage for Easy Kanban's multi-tenant Kubernetes deployment. NFS enables multiple pods to share the same storage, allowing multiple customers to run on shared infrastructure.

## Why NFS?

- **ReadWriteMany**: Multiple pods can mount the same volume simultaneously
- **Cross-node access**: Pods on different nodes can access the same storage
- **Shared storage**: All tenant databases stored in one location
- **Cost efficient**: Better resource utilization

## Architecture

```
┌─────────────────────────────────────────┐
│      NFS Server Pod                     │
│      (nfs-server)                       │
│      /exports/easy-kanban/              │
│        ├── tenants/                     │
│        │   ├── customer1/               │
│        │   ├── customer2/               │
│        │   └── customer3/               │
│        └── ...                          │
└─────────────────────────────────────────┘
           ▲              ▲              ▲
           │              │              │
    ┌──────┴───┐    ┌─────┴────┐   ┌────┴────┐
    │  Pod 1   │    │  Pod 2   │   │  Pod 3  │
    │ (Node A) │    │ (Node B) │   │ (Node C)│
    └──────────┘    └──────────┘   └─────────┘
```

## Setup Steps

### 1. Deploy NFS Server

```bash
cd k8s
./setup-nfs.sh
```

This script will:
- Create NFS server deployment
- Create NFS service
- Create storage class
- Create persistent volume
- Create persistent volume claim
- Set up directory structure

### 2. Verify NFS Setup

```bash
# Check NFS server pod
kubectl get pods -n easy-kanban -l app=nfs-server

# Check NFS service
kubectl get svc -n easy-kanban nfs-server

# Check persistent volume
kubectl get pv easy-kanban-shared-storage

# Check persistent volume claim
kubectl get pvc -n easy-kanban easy-kanban-shared-pvc
```

### 3. Update Deployment

Update your deployment to use the shared PVC:

```yaml
volumes:
  - name: shared-storage
    persistentVolumeClaim:
      claimName: easy-kanban-shared-pvc
```

### 4. Configure Environment Variables

Update your ConfigMap to enable multi-tenant mode:

```yaml
MULTI_TENANT: "true"
TENANT_DOMAIN: "ezkan.cloud"
```

## TENANT_DOMAIN Explained

### What is TENANT_DOMAIN?

`TENANT_DOMAIN` is used to extract the tenant ID from the hostname in multi-tenant mode.

### How it works:

1. **Hostname Pattern**: `{tenantId}.{TENANT_DOMAIN}`
2. **Example**: If `TENANT_DOMAIN=ezkan.cloud`
   - `customer1.ezkan.cloud` → tenant ID: `customer1`
   - `customer2.ezkan.cloud` → tenant ID: `customer2`
   - `localhost` → no tenant ID (single-tenant mode)

### Where is it used?

- **Tenant Routing Middleware**: Extracts tenant ID from hostname
- **Database Path**: Determines which tenant's database to load
- **Storage Paths**: Determines tenant-specific attachment/avatar paths

### Does it need to be set in the database?

**No, it does NOT need to be set per-tenant in the database.**

- `TENANT_DOMAIN` is a **global configuration** (same for all tenants)
- It's set via **environment variable** (ConfigMap in Kubernetes)
- It's used by the **application** to route requests to the correct tenant
- Each tenant's database is **independent** and doesn't store this value

### Configuration Options:

1. **Kubernetes (ConfigMap)**: Set once for all pods
   ```yaml
   TENANT_DOMAIN: "ezkan.cloud"
   ```

2. **Docker Compose**: Set in environment section
   ```yaml
   - TENANT_DOMAIN=ezkan.cloud
   ```

3. **Default**: If not set, defaults to `ezkan.cloud` in code

### Admin Portal Considerations:

The admin portal should:
- **NOT** set `TENANT_DOMAIN` per-tenant (it's global)
- **DO** ensure the domain matches your ingress configuration
- **DO** use the same domain when creating tenant subdomains

## Alternative: External NFS Server

If you have an external NFS server, update `nfs-persistent-volume.yaml`:

```yaml
spec:
  nfs:
    server: your-nfs-server.example.com  # External NFS server
    path: /exports/easy-kanban
```

## Troubleshooting

### NFS Server Not Starting

```bash
# Check pod logs
kubectl logs -n easy-kanban -l app=nfs-server

# Check pod status
kubectl describe pod -n easy-kanban -l app=nfs-server
```

### PVC Not Binding

```bash
# Check PVC status
kubectl describe pvc easy-kanban-shared-pvc -n easy-kanban

# Check PV status
kubectl describe pv easy-kanban-shared-storage
```

### Permission Issues

```bash
# Fix permissions on NFS export
NFS_POD=$(kubectl get pod -n easy-kanban -l app=nfs-server -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n easy-kanban "$NFS_POD" -- chmod -R 777 /exports/easy-kanban
```

### Testing NFS Mount

```bash
# Create a test pod to verify NFS mount
kubectl run nfs-test --rm -i --tty --image=busybox --restart=Never -n easy-kanban -- sh

# Inside the pod:
mount -t nfs nfs-server.easy-kanban.svc.cluster.local:/exports/easy-kanban /mnt
ls -la /mnt
```

## Storage Capacity

Default storage is set to **500Gi**. To change:

1. Update `nfs-persistent-volume.yaml`:
   ```yaml
   capacity:
     storage: 1000Gi  # Your desired size
   ```

2. Update `nfs-persistent-volume-claim.yaml`:
   ```yaml
   resources:
     requests:
       storage: 1000Gi  # Must match PV
   ```

3. Reapply:
   ```bash
   kubectl apply -f k8s/nfs-persistent-volume.yaml
   kubectl apply -f k8s/nfs-persistent-volume-claim.yaml
   ```

## Backup Considerations

Since all tenant data is in one location (`/exports/easy-kanban/tenants/`), backups are simplified:

```bash
# Backup all tenants
kubectl exec -n easy-kanban <nfs-pod> -- tar czf /tmp/backup.tar.gz /exports/easy-kanban/tenants/

# Restore
kubectl exec -n easy-kanban <nfs-pod> -- tar xzf /tmp/backup.tar.gz -C /
```

## Security Notes

- NFS server runs with `privileged: true` (required for NFS)
- Consider using network policies to restrict NFS access
- Ensure NFS traffic is encrypted if using external NFS server
- Regular backups are essential (single point of failure)

