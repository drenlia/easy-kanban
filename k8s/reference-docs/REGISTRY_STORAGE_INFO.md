# Registry Storage Information

## Current Storage Configuration

### Storage Type: `emptyDir`

The registry is currently using **`emptyDir`** storage, which means:

- 📍 **Location**: `/var/lib/registry` inside the registry pod
- ⚠️ **Temporary**: Data is stored in the pod's filesystem
- ❌ **Not Persistent**: If the pod restarts or is deleted, **all images are lost**
- 💾 **Node Location**: Currently on `k8s2` node
- 📦 **Storage**: Uses node's local disk space

### Current Status

```
Registry Pod: internal-registry-cdd4c5f57-54fr9
Node: k8s2
Storage: emptyDir (temporary)
Path: /var/lib/registry (inside pod)
```

## Important Considerations

### ⚠️ Data Loss Risk

**If the registry pod restarts or is deleted:**
- All pushed images will be **lost**
- You'll need to rebuild and push all images again
- This is **not suitable for production**

### 💡 Recommendations

For production use, you should use **persistent storage**:

1. **PersistentVolume (PV)** - Recommended
   - Uses NFS (already set up)
   - Survives pod restarts
   - Can be backed up
   - Shared across nodes

2. **HostPath** - Simple but less ideal
   - Stores on node's filesystem
   - Lost if node is replaced
   - Not shared across nodes

## Current Storage Location Details

### Inside the Pod
```
/var/lib/registry/
├── docker/
│   └── registry/
│       └── v2/
│           ├── blobs/          # Image layers
│           └── repositories/   # Image metadata
```

### On the Node (k8s2)
The `emptyDir` is stored in:
```
/var/lib/kubelet/pods/<pod-id>/volumes/kubernetes.io~empty-dir/registry-storage/
```

**Note**: This path is temporary and will be deleted when the pod is removed.

## Storage Size

Current registry size can be checked with:
```bash
kubectl exec -n kube-system <registry-pod> -- du -sh /var/lib/registry
```

## Migration to Persistent Storage

To make the registry persistent, you can:

1. **Use NFS** (recommended, since you already have NFS set up)
2. **Use a PersistentVolumeClaim** with your existing storage class
3. **Update the registry deployment** to use the PVC

Would you like me to update the registry to use persistent NFS storage?

## Quick Commands

```bash
# Check registry storage location
kubectl exec -n kube-system <registry-pod> -- ls -lah /var/lib/registry

# Check storage size
kubectl exec -n kube-system <registry-pod> -- du -sh /var/lib/registry

# Check which node registry is on
kubectl get pod -n kube-system -l app=internal-registry -o wide

# List images in registry
kubectl port-forward -n kube-system svc/internal-registry 5000:5000 &
curl http://localhost:5000/v2/_catalog
```

