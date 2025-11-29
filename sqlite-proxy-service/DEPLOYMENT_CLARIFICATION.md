# Deployment Clarification

## You Don't Need Both!

Both deployment files are **identical** and point to the same image. You only need to use **one** set:

### Option 1: Use Existing Files (Recommended)
```bash
# These are the files you're already using
kubectl apply -f k8s/sqlite-proxy-deployment.yaml
kubectl apply -f k8s/sqlite-proxy-service.yaml
```

### Option 2: Use Standalone Files
```bash
# These are identical copies in the standalone service directory
kubectl apply -f sqlite-proxy-service/k8s/deployment.yaml
kubectl apply -f sqlite-proxy-service/k8s/service.yaml
```

## Why Two Sets of Files?

- **`k8s/sqlite-proxy-*.yaml`**: Main deployment files (what you're currently using)
- **`sqlite-proxy-service/k8s/*.yaml`**: Standalone copies (for reference/portability)

Both are **identical** and point to:
```yaml
image: internal-registry.kube-system.svc.cluster.local:5000/sqlite-proxy:latest
```

## Recommended Workflow

1. **Build and push** the new image:
   ```bash
   ./scripts/build-and-push-to-registry-proxy.sh
   ```

2. **Apply the existing deployment** (which I already updated):
   ```bash
   kubectl apply -f k8s/sqlite-proxy-deployment.yaml
   kubectl apply -f k8s/sqlite-proxy-service.yaml
   ```

That's it! Kubernetes will automatically replace the old pods with new ones using the new image.

## What Changed?

The **only** change in `k8s/sqlite-proxy-deployment.yaml` was:
- **Old**: `image: IMAGE_NAME_PLACEHOLDER` (or easy-kanban image)
- **New**: `image: internal-registry.kube-system.svc.cluster.local:5000/sqlite-proxy:latest`

Everything else (pod name, service name, labels, etc.) stays the same, so there's no disruption.

