# Destroy Instance Script Review

## Current Implementation

The `destroy-instance.sh` script deletes tenant data in two steps:

### Step 1: Delete Ingress Rule ✅
```bash
kubectl delete ingress "${INGRESS_NAME}" -n "${NAMESPACE}"
```
- **Works correctly**: Deletes Kubernetes ingress resource
- **No issues**: Standard Kubernetes operation

### Step 2: Delete Tenant Data Files ⚠️

**Current approach:**
```bash
sudo -n rm -rf "$DATA_DIR" || echo "    ⚠️  Failed to remove: $DATA_DIR"
sudo -n rm -rf "$ATTACHMENTS_DIR" || echo "    ⚠️  Failed to remove: $ATTACHMENTS_DIR"
sudo -n rm -rf "$AVATARS_DIR" || echo "    ⚠️  Failed to remove: $AVATARS_DIR"
```

**Paths being deleted:**
- `/data/nfs-server/data/tenants/${INSTANCE_NAME}`
- `/data/nfs-server/attachments/tenants/${INSTANCE_NAME}`
- `/data/nfs-server/avatars/tenants/${INSTANCE_NAME}`

## Architecture Context

### NFS Storage Structure

```
Host Node (k8s)
└── /data/nfs-server/                    (hostPath)
    ├── data/
    │   └── tenants/
    │       ├── app/
    │       │   └── kanban.db
    │       ├── fastest/
    │       │   └── kanban.db
    │       └── {tenant-id}/
    ├── attachments/
    │   └── tenants/
    │       └── {tenant-id}/
    └── avatars/
        └── tenants/
            └── {tenant-id}/

NFS Server Pod
└── /exports/                            (mounted from hostPath)
    ├── data/                            (exported as NFS)
    │   └── tenants/
    │       └── {tenant-id}/
    ├── attachments/                      (exported as NFS)
    │   └── tenants/
    │       └── {tenant-id}/
    └── avatars/                         (exported as NFS)
        └── tenants/
            └── {tenant-id}/

Easy Kanban Pods
└── /app/server/                         (mounted from NFS)
    ├── data/                            (maps to /exports/data)
    │   └── tenants/
    │       └── {tenant-id}/
    ├── attachments/                     (maps to /exports/attachments)
    │   └── tenants/
    │       └── {tenant-id}/
    └── avatars/                         (maps to /exports/avatars)
        └── tenants/
            └── {tenant-id}/
```

## Issues with Current Implementation

### Issue 1: Requires Passwordless Sudo ❌
- **Problem**: `sudo -n` requires passwordless sudo configuration
- **Impact**: Script fails if sudo requires password
- **Error**: `sudo: a password is required`

### Issue 2: Must Run on NFS Server Node ❌
- **Problem**: Script assumes it's running on the node where NFS server pod runs
- **Impact**: Won't work if run from:
  - Different node
  - Admin portal (different machine)
  - CI/CD pipeline
- **Error**: Directories not found (if on wrong node)

### Issue 3: No Verification ❌
- **Problem**: Uses `|| echo "⚠️ Failed"` which silently continues
- **Impact**: Script reports success even if deletion fails
- **Risk**: Data not actually deleted, but ingress is removed

### Issue 4: Race Condition ⚠️
- **Problem**: Files might be in use by running pods
- **Impact**: Deletion might fail or cause issues
- **Risk**: Database corruption if deleted while in use

## Better Approaches

### Option 1: Delete via NFS Server Pod ✅ (Recommended)

Delete files through the NFS server pod using `kubectl exec`:

```bash
# Get NFS server pod
NFS_POD=$(kubectl get pod -n easy-kanban -l app=nfs-server -o jsonpath='{.items[0].metadata.name}')

# Delete tenant directories via pod
kubectl exec -n easy-kanban "$NFS_POD" -- sh -c "
  rm -rf /exports/data/tenants/${INSTANCE_NAME} && \
  rm -rf /exports/attachments/tenants/${INSTANCE_NAME} && \
  rm -rf /exports/avatars/tenants/${INSTANCE_NAME}
"
```

**Advantages:**
- ✅ Works from anywhere (doesn't need to be on NFS node)
- ✅ No sudo required
- ✅ Works in Kubernetes context
- ✅ Can verify deletion

**Disadvantages:**
- ⚠️ Requires NFS server pod to be running
- ⚠️ Requires kubectl access

### Option 2: Delete via Easy Kanban Pod ✅

Delete files through an Easy Kanban pod that has the volumes mounted:

```bash
# Get an Easy Kanban pod
APP_POD=$(kubectl get pod -n easy-kanban -l app=easy-kanban -o jsonpath='{.items[0].metadata.name}')

# Delete tenant directories via pod
kubectl exec -n easy-kanban "$APP_POD" -- sh -c "
  rm -rf /app/server/data/tenants/${INSTANCE_NAME} && \
  rm -rf /app/server/attachments/tenants/${INSTANCE_NAME} && \
  rm -rf /app/server/avatars/tenants/${INSTANCE_NAME}
"
```

**Advantages:**
- ✅ Works from anywhere
- ✅ No sudo required
- ✅ Uses mounted volumes (same as app sees them)

**Disadvantages:**
- ⚠️ Requires Easy Kanban pod to be running
- ⚠️ Files might be in use (database open)

### Option 3: Use Kubernetes Job ✅ (Most Robust)

Create a Kubernetes Job to delete the files:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: delete-tenant-${INSTANCE_NAME}
  namespace: easy-kanban
spec:
  template:
    spec:
      containers:
      - name: cleanup
        image: busybox:latest
        command: ['sh', '-c']
        args:
        - |
          rm -rf /data/tenants/${INSTANCE_NAME} && \
          rm -rf /attachments/tenants/${INSTANCE_NAME} && \
          rm -rf /avatars/tenants/${INSTANCE_NAME}
        volumeMounts:
        - name: data
          mountPath: /data
        - name: attachments
          mountPath: /attachments
        - name: avatars
          mountPath: /avatars
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: easy-kanban-shared-pvc-data
      - name: attachments
        persistentVolumeClaim:
          claimName: easy-kanban-shared-pvc-attachments
      - name: avatars
        persistentVolumeClaim:
          claimName: easy-kanban-shared-pvc-avatars
      restartPolicy: Never
```

**Advantages:**
- ✅ Most robust (handles failures, retries)
- ✅ Can verify completion
- ✅ Works from anywhere
- ✅ No sudo required

**Disadvantages:**
- ⚠️ More complex (requires creating Job manifest)
- ⚠️ Need to clean up Job after completion

## Recommended Solution

**Use Option 1 (Delete via NFS Server Pod)** because:
1. ✅ Simple and straightforward
2. ✅ Works from anywhere with kubectl access
3. ✅ No sudo required
4. ✅ Direct access to source of truth (NFS server)

### Improved Script

```bash
# Step 2: Remove tenant data directories from NFS
echo "🗑️  Removing tenant data directories from NFS..."

# Get NFS server pod
NFS_POD=$(kubectl get pod -n "${NAMESPACE}" -l app=nfs-server -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

if [ -z "$NFS_POD" ]; then
    echo "   ⚠️  NFS server pod not found, trying direct host path deletion..."
    # Fallback to original method
    if [ -d "$DATA_DIR" ]; then
        sudo -n rm -rf "$DATA_DIR" || echo "    ⚠️  Failed to remove: $DATA_DIR"
    fi
    if [ -d "$ATTACHMENTS_DIR" ]; then
        sudo -n rm -rf "$ATTACHMENTS_DIR" || echo "    ⚠️  Failed to remove: $ATTACHMENTS_DIR"
    fi
    if [ -d "$AVATARS_DIR" ]; then
        sudo -n rm -rf "$AVATARS_DIR" || echo "    ⚠️  Failed to remove: $AVATARS_DIR"
    fi
else
    echo "   Using NFS server pod: $NFS_POD"
    
    # Delete via NFS server pod
    kubectl exec -n "${NAMESPACE}" "$NFS_POD" -- sh -c "
        if [ -d /exports/data/tenants/${INSTANCE_NAME} ]; then
            rm -rf /exports/data/tenants/${INSTANCE_NAME} && echo '  ✅ Deleted: /exports/data/tenants/${INSTANCE_NAME}'
        else
            echo '  ℹ️  Directory not found: /exports/data/tenants/${INSTANCE_NAME}'
        fi
    " || echo "    ⚠️  Failed to delete data directory"
    
    kubectl exec -n "${NAMESPACE}" "$NFS_POD" -- sh -c "
        if [ -d /exports/attachments/tenants/${INSTANCE_NAME} ]; then
            rm -rf /exports/attachments/tenants/${INSTANCE_NAME} && echo '  ✅ Deleted: /exports/attachments/tenants/${INSTANCE_NAME}'
        else
            echo '  ℹ️  Directory not found: /exports/attachments/tenants/${INSTANCE_NAME}'
        fi
    " || echo "    ⚠️  Failed to delete attachments directory"
    
    kubectl exec -n "${NAMESPACE}" "$NFS_POD" -- sh -c "
        if [ -d /exports/avatars/tenants/${INSTANCE_NAME} ]; then
            rm -rf /exports/avatars/tenants/${INSTANCE_NAME} && echo '  ✅ Deleted: /exports/avatars/tenants/${INSTANCE_NAME}'
        else
            echo '  ℹ️  Directory not found: /exports/avatars/tenants/${INSTANCE_NAME}'
        fi
    " || echo "    ⚠️  Failed to delete avatars directory"
fi
```

## Additional Considerations

### Database Connection Cleanup

Before deleting, consider:
1. **Close database connections**: The SQLite proxy might have open connections
2. **Wait for operations**: Ensure no active queries
3. **Backup option**: Offer backup before deletion

### Verification

Add verification after deletion:
```bash
# Verify deletion
kubectl exec -n "${NAMESPACE}" "$NFS_POD" -- sh -c "
    [ ! -d /exports/data/tenants/${INSTANCE_NAME} ] && \
    [ ! -d /exports/attachments/tenants/${INSTANCE_NAME} ] && \
    [ ! -d /exports/avatars/tenants/${INSTANCE_NAME} ] && \
    echo '✅ All tenant directories deleted successfully' || \
    echo '⚠️  Some directories still exist'
"
```

## Summary

**Current Issues:**
- ❌ Requires passwordless sudo
- ❌ Must run on NFS server node
- ❌ No proper error handling
- ❌ No verification

**Recommended Fix:**
- ✅ Use `kubectl exec` to delete via NFS server pod
- ✅ Works from anywhere with kubectl access
- ✅ No sudo required
- ✅ Add verification step
- ✅ Fallback to host path if NFS pod unavailable

