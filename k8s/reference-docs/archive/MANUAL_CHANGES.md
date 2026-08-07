# Manual Changes Summary

This document lists all manual changes made that should be saved in configuration files or scripts.

## ✅ Already Saved in YAML Files

1. **Topology Spread Constraints** (`k8s/app-deployment.yaml`)
   - Added to distribute pods across nodes
   - `maxSkew: 1` ensures even distribution
   - Already in the YAML file ✓

2. **Removed Pod Affinity** (`k8s/app-deployment.yaml`)
   - Previously forced pods to same node
   - Removed to allow distribution
   - Already reflected in YAML ✓

3. **WebSocket Ingress** (`k8s/ingress-websocket.yaml`)
   - Separate ingress for `/socket.io/` paths
   - Cookie-based sticky sessions
   - Already saved ✓

4. **Dockerfile.prod Changes**
   - Added `MULTI_TENANT` build argument
   - Already saved ✓

5. **Build Script Changes** (`k8s/build-and-push-to-registry.sh`)
   - Passes `MULTI_TENANT` as build arg
   - Already saved ✓

## ⚠️ Manual Changes That Need Documentation/Scripts

### 1. Containerd Registry Configuration

**What was changed:**
- Configured containerd on both `k8s` and `k8s2` nodes to trust the internal registry
- Added configuration for both service name AND IP address

**Why:**
- Containerd on host nodes cannot resolve Kubernetes DNS names
- Need IP address for host-level image pulls
- Need service name for pod-level image pulls (flexibility)

**Solution:**
- ✅ Created `k8s/configure-containerd-registry.sh` script
- ✅ Documented in `k8s/REGISTRY_SETUP.md`

**To apply:**
```bash
./k8s/configure-containerd-registry.sh
```

### 2. Deployment Image Reference

**What was changed:**
- Deployment uses IP address: `10.110.240.233:5000/easy-kanban:latest`
- YAML file still has placeholder: `IMAGE_NAME_PLACEHOLDER`

**Why:**
- `deploy.sh` replaces placeholder with `easy-kanban:latest` (no registry)
- Manual patch was needed to use registry IP

**Current State:**
- Deployment: Uses `10.110.240.233:5000/easy-kanban:latest` (patched manually)
- YAML: Has `IMAGE_NAME_PLACEHOLDER` (for deployment scripts)

**Options:**
1. **Keep as-is**: Manual patching after deployment
2. **Update deploy.sh**: Auto-detect registry IP and use it
3. **Use service name**: Change to `internal-registry.kube-system.svc.cluster.local:5000/easy-kanban:latest` (but this won't work from host nodes)

**Recommendation:**
- Keep placeholder in YAML
- Document that manual patching is needed, OR
- Update `deploy.sh` to detect registry IP and use it

## 📝 Documentation Created

1. **`k8s/REGISTRY_SETUP.md`**
   - Complete guide for registry setup
   - Containerd configuration instructions
   - Troubleshooting guide

2. **`k8s/configure-containerd-registry.sh`**
   - Automated script to configure containerd on all nodes
   - Handles both service name and IP address
   - Works for local and remote nodes

## 🔄 To Apply These Changes on New Nodes

When adding a new node (e.g., k8s3):

1. **Configure containerd:**
   ```bash
   ./k8s/configure-containerd-registry.sh
   ```
   This will automatically detect and configure all nodes.

2. **Verify registry access:**
   ```bash
   # On the new node
   sudo ctr -n k8s.io images pull 10.110.240.233:5000/easy-kanban:latest
   ```

## 🎯 Summary

All critical changes are now:
- ✅ Documented
- ✅ Scripted (where applicable)
- ✅ Saved in appropriate files

The only remaining manual step is updating the deployment image reference if you use `deploy.sh`, but this can be automated by updating `deploy.sh` to detect the registry IP.

