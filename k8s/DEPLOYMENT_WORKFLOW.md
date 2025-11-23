# Deployment Workflow with Internal Registry

## Overview

Now that the internal registry is set up, here's your new deployment workflow.

## Current Configuration

✅ **Deployment is configured to use registry:**
- Image: `internal-registry.kube-system.svc.cluster.local:5000/easy-kanban:latest`
- ImagePullPolicy: `IfNotPresent` (will pull if not cached)

## New Image Deployment Workflow

### Step 1: Build and Push to Registry

```bash
./k8s/push-to-registry.sh
```

This script:
- ✅ Builds the Docker image (`Dockerfile.prod`)
- ✅ Tags it for the internal registry
- ✅ Sets up port-forward to registry
- ✅ Pushes the image to the registry
- ✅ Cleans up port-forward

### Step 2: Restart Deployment (if needed)

If you want to force pods to pull the new image:

```bash
# Option 1: Rolling restart (recommended)
kubectl rollout restart deployment/easy-kanban -n easy-kanban

# Option 2: Scale down and up
kubectl scale deployment easy-kanban -n easy-kanban --replicas=0
kubectl scale deployment easy-kanban -n easy-kanban --replicas=1
```

**Note:** With `ImagePullPolicy: IfNotPresent`, Kubernetes will:
- Use cached image if available
- Pull new image if the tag changed or image not cached

### Step 3: Verify Deployment

```bash
# Check pod status
kubectl get pods -n easy-kanban -o wide

# Check which image is running
kubectl get pods -n easy-kanban -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[0].image}{"\n"}{end}'

# Watch rollout
kubectl rollout status deployment/easy-kanban -n easy-kanban
```

## Complete Workflow Example

```bash
# 1. Make your code changes
git add .
git commit -m "New feature"

# 2. Build and push new image
./k8s/push-to-registry.sh

# 3. Restart deployment to use new image
kubectl rollout restart deployment/easy-kanban -n easy-kanban

# 4. Monitor rollout
kubectl rollout status deployment/easy-kanban -n easy-kanban

# 5. Verify pods are running new image
kubectl get pods -n easy-kanban -o wide
```

## Image Versioning (Optional)

For better version control, you can tag images with versions:

```bash
# Build with version tag
docker build -f Dockerfile.prod -t easy-kanban:v1.2.3 .
docker tag easy-kanban:v1.2.3 internal-registry.kube-system.svc.cluster.local:5000/easy-kanban:v1.2.3

# Push versioned image
kubectl port-forward -n kube-system svc/internal-registry 5000:5000 &
docker push localhost:5000/easy-kanban:v1.2.3

# Update deployment to use version
kubectl set image deployment/easy-kanban \
  easy-kanban=internal-registry.kube-system.svc.cluster.local:5000/easy-kanban:v1.2.3 \
  -n easy-kanban
```

## What Changed from Before?

### Old Workflow (Local Images)
```bash
# Build
docker build -f Dockerfile.prod -t easy-kanban:latest .

# Import to k8s node
docker save easy-kanban:latest | sudo ctr -n k8s.io images import -

# Sync to k8s2 (manual)
scp image.tar k8s2:/tmp/
ssh k8s2 "sudo ctr -n k8s.io images import /tmp/image.tar"

# Restart deployment
kubectl rollout restart deployment/easy-kanban -n easy-kanban
```

### New Workflow (Registry)
```bash
# Build and push (one command!)
./k8s/push-to-registry.sh

# Restart deployment
kubectl rollout restart deployment/easy-kanban -n easy-kanban
```

## Benefits

✅ **Simpler**: One script instead of multiple steps  
✅ **Automatic**: All nodes pull from registry automatically  
✅ **Scalable**: Works with any number of nodes  
✅ **Standard**: Uses Kubernetes best practices  
✅ **No manual copying**: No need to sync images to each node  

## Troubleshooting

### Image Not Pulling

```bash
# Check registry is running
kubectl get pods -n kube-system | grep registry

# Check image exists in registry
kubectl port-forward -n kube-system svc/internal-registry 5000:5000 &
curl http://localhost:5000/v2/easy-kanban/tags/list

# Check pod events
kubectl describe pod <pod-name> -n easy-kanban | grep Events -A 10
```

### Force Image Pull

If you need to force pull (even if cached):

```bash
# Change ImagePullPolicy to Always temporarily
kubectl patch deployment easy-kanban -n easy-kanban -p \
  '{"spec":{"template":{"spec":{"containers":[{"name":"easy-kanban","imagePullPolicy":"Always"}]}}}}'

# Restart
kubectl rollout restart deployment/easy-kanban -n easy-kanban

# Change back to IfNotPresent
kubectl patch deployment easy-kanban -n easy-kanban -p \
  '{"spec":{"template":{"spec":{"containers":[{"name":"easy-kanban","imagePullPolicy":"IfNotPresent"}]}}}}'
```

## Summary

**Yes, use `push-to-registry.sh` for new deployments!**

The workflow is now:
1. `./k8s/push-to-registry.sh` - Build and push
2. `kubectl rollout restart` - Deploy new image

That's it! Much simpler than before. 🎉

