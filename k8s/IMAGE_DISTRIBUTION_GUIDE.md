# Image Distribution Guide for Multi-Node Kubernetes

## Problem

When you have multiple nodes (k8s and k8s2), images built on one node are not automatically available on other nodes. Kubernetes needs the image to be available on the node where the pod is scheduled.

## Solutions

### Option 1: Internal Container Registry (Recommended) ⭐

**Best for**: Production, multiple nodes, frequent updates

#### Advantages
- ✅ Centralized image storage
- ✅ Works with any number of nodes
- ✅ Standard Kubernetes approach
- ✅ Easy to update images
- ✅ Can use image pull policies
- ✅ No manual copying needed

#### Disadvantages
- ⚠️ Requires registry setup
- ⚠️ Needs containerd configuration on each node
- ⚠️ Uses cluster resources

#### Setup Steps

1. **Deploy internal registry:**
   ```bash
   ./k8s/setup-registry.sh
   ```

2. **Configure containerd on each node:**
   ```bash
   # On k8s (control plane)
   sudo bash /tmp/configure-registry.sh
   
   # On k8s2 (worker)
   ssh k8s2 "sudo bash -c 'cat >> /etc/containerd/config.toml <<EOF
   [plugins.\"io.containerd.grpc.v1.cri\".registry.mirrors.\"internal-registry.kube-system.svc.cluster.local:5000\"]
     endpoint = [\"http://internal-registry.kube-system.svc.cluster.local:5000\"]
   
   [plugins.\"io.containerd.grpc.v1.cri\".registry.configs.\"internal-registry.kube-system.svc.cluster.local:5000\".tls]
     insecure_skip_verify = true
   EOF
   sudo systemctl restart containerd'"
   ```

3. **Build and push image:**
   ```bash
   ./k8s/push-to-registry.sh
   ```

4. **Update deployment to use registry:**
   ```yaml
   spec:
     containers:
     - name: easy-kanban
       image: internal-registry.kube-system.svc.cluster.local:5000/easy-kanban:latest
       imagePullPolicy: Always  # or IfNotPresent
   ```

#### How It Works

```
Build Machine (k8s)
    ↓
docker build → docker tag → docker push
    ↓
Internal Registry (ClusterIP Service)
    ↓
All Nodes Pull from Registry
    ↓
k8s ←→ Registry ←→ k8s2
```

### Option 2: Sync Images to Each Node (Simple)

**Best for**: Small clusters, infrequent updates, air-gapped environments

#### Advantages
- ✅ Simple, no registry needed
- ✅ Works offline
- ✅ Direct control
- ✅ No network overhead

#### Disadvantages
- ⚠️ Manual process for each node
- ⚠️ Doesn't scale well
- ⚠️ Easy to forget a node
- ⚠️ No versioning

#### Setup Steps

1. **Build image on control plane:**
   ```bash
   docker build -f Dockerfile.prod -t easy-kanban:latest .
   ```

2. **Import to control plane:**
   ```bash
   docker save easy-kanban:latest | sudo ctr -n k8s.io images import -
   ```

3. **Sync to worker nodes:**
   ```bash
   ./k8s/sync-image-to-node.sh k8s2 easy-kanban:latest
   ```

   Or manually:
   ```bash
   # Save image
   docker save easy-kanban:latest > /tmp/easy-kanban.tar
   
   # Copy to k8s2
   scp /tmp/easy-kanban.tar k8s2:/tmp/
   
   # Import on k8s2
   ssh k8s2 "sudo ctr -n k8s.io images import /tmp/easy-kanban.tar"
   ```

#### How It Works

```
Build on k8s
    ↓
Import to k8s (ctr -n k8s.io images import)
    ↓
Save to tar (docker save)
    ↓
Copy to k8s2 (scp)
    ↓
Import on k8s2 (ctr -n k8s.io images import)
```

## Comparison

| Feature | Internal Registry | Sync to Nodes |
|---------|------------------|---------------|
| Setup Complexity | Medium | Low |
| Maintenance | Low | High (manual) |
| Scalability | Excellent | Poor |
| Update Process | Push once | Copy to each node |
| Network Usage | Pull on demand | One-time copy |
| Offline Support | No | Yes |
| Versioning | Yes | Manual |
| Best For | Production | Development |

## Recommendation

**Use Internal Registry** for:
- Multi-node clusters
- Production environments
- Frequent image updates
- Standard Kubernetes practices

**Use Sync to Nodes** for:
- Small clusters (2-3 nodes)
- Development/testing
- Air-gapped environments
- Infrequent updates

## Current Setup

Your current setup uses **Option 2** (sync to nodes):
- Images are built on k8s
- Imported with `ctr -n k8s.io images import`
- Only available on the node where imported

## Migration to Internal Registry

If you want to switch to internal registry:

1. **Setup registry:**
   ```bash
   ./k8s/setup-registry.sh
   ```

2. **Configure all nodes** (see setup-registry.sh output)

3. **Push existing image:**
   ```bash
   ./k8s/push-to-registry.sh
   ```

4. **Update deployments:**
   ```bash
   # Update image in deployment
   kubectl set image deployment/easy-kanban \
     easy-kanban=internal-registry.kube-system.svc.cluster.local:5000/easy-kanban:latest \
     -n easy-kanban
   ```

5. **Set ImagePullPolicy:**
   ```bash
   kubectl patch deployment easy-kanban -n easy-kanban -p '{"spec":{"template":{"spec":{"containers":[{"name":"easy-kanban","imagePullPolicy":"Always"}]}}}}'
   ```

## Troubleshooting

### Registry Not Accessible

```bash
# Check registry pod
kubectl get pods -n kube-system | grep registry

# Check registry service
kubectl get svc -n kube-system internal-registry

# Test from a pod
kubectl run test --image=busybox --rm -it --restart=Never -- \
  wget -O- http://internal-registry.kube-system.svc.cluster.local:5000/v2/
```

### Image Pull Fails

```bash
# Check containerd config
sudo cat /etc/containerd/config.toml | grep -A 5 registry

# Check image in registry
kubectl port-forward -n kube-system svc/internal-registry 5000:5000
curl http://localhost:5000/v2/_catalog
```

### Sync Script Fails

```bash
# Check SSH access
ssh k8s2 "echo 'Connected'"

# Check containerd on target node
ssh k8s2 "sudo ctr -n k8s.io images list"
```

## Quick Reference

### Internal Registry

```bash
# Setup
./k8s/setup-registry.sh

# Build and push
./k8s/push-to-registry.sh

# Use in deployment
image: internal-registry.kube-system.svc.cluster.local:5000/easy-kanban:latest
```

### Sync to Nodes

```bash
# Build
docker build -f Dockerfile.prod -t easy-kanban:latest .

# Import on k8s
docker save easy-kanban:latest | sudo ctr -n k8s.io images import -

# Sync to k8s2
./k8s/sync-image-to-node.sh k8s2 easy-kanban:latest
```

