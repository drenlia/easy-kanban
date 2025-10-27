# Image Import for Kubernetes

## Correct Import Process

When building and importing Docker images for Kubernetes deployment:

1. **Build the image with version tracking:**
   ```bash
   docker build -f Dockerfile.prod -t easy-kanban:latest \
     --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) \
     --build-arg GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD) \
     --build-arg BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
     .
   ```
   
   **Note:** The build args capture git commit, branch, and build time for version tracking.
   These are embedded in `server/version.json` during the build.

2. **Import to Kubernetes namespace:**
   ```bash
   docker save easy-kanban:latest | sudo ctr -n k8s.io images import -
   ```

## Important Notes

- **Always use `-n k8s.io`** when importing images for Kubernetes
- **Use `ImagePullPolicy: IfNotPresent`** in deployment templates
- **Never use `ImagePullPolicy: Always`** with local images
- **The `:latest` tag works fine** with `IfNotPresent` policy

## Verification

Check if image is available to Kubernetes:
```bash
sudo ctr -n k8s.io images list | grep easy-kanban
```

Check what Kubernetes can see:
```bash
sudo crictl images | grep easy-kanban
```
