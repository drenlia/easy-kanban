# Version Tracking in Kubernetes

## Overview

The Easy Kanban app now uses **build-time version generation** instead of runtime environment variables for version tracking. This ensures version changes are automatically detected in Kubernetes pod rollouts.

## How It Works

### 1. **Build Time** (During Docker Build)
```bash
# In Dockerfile.prod, during the build process:
RUN node scripts/generate-version.js
```

This generates `server/version.json` with:
- **Git commit hash** (unique per build)
- **Build timestamp**
- **Package version** from package.json
- **Git branch**
- **Build number** (from CI/CD)

Example:
```json
{
  "version": "0.9-beta-a1b2c3d",
  "packageVersion": "0.0.0",
  "gitCommit": "a1b2c3d",
  "gitBranch": "main",
  "buildTime": "2025-10-27T12:34:56.789Z",
  "buildNumber": "123",
  "environment": "production"
}
```

### 2. **Runtime** (When Pod Starts)
- Server reads `server/version.json` at startup
- Compares with database `settings.APP_VERSION`
- If different → updates database → broadcasts to all clients via WebSocket
- Users are notified to refresh their browsers

### 3. **K8s Rolling Update**
1. New image is built with new `version.json` (new git commit hash)
2. K8s creates new pods with the new image
3. New pods read the new `version.json` at startup
4. Version mismatch is detected → users are notified
5. Old pods are terminated

## Deployment Workflow

### CI/CD Pipeline (GitHub Actions, GitLab CI, etc.)

```yaml
# Example GitHub Actions workflow
name: Build and Deploy

on:
  push:
    branches: [main, staging, production]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0  # Important: fetch full git history for version generation
      
      - name: Build Docker Image
        run: |
          docker build -f Dockerfile.prod \
            --build-arg BUILD_NUMBER=${{ github.run_number }} \
            -t your-registry/easy-kanban:${{ github.sha }} \
            -t your-registry/easy-kanban:latest \
            .
      
      - name: Push to Registry
        run: |
          docker push your-registry/easy-kanban:${{ github.sha }}
          docker push your-registry/easy-kanban:latest
      
      - name: Deploy to K8s
        run: |
          kubectl set image deployment/easy-kanban \
            app=your-registry/easy-kanban:${{ github.sha }}
```

### Manual Deployment

```bash
# 1. Build the image (git commit hash is automatically included)
docker build -f Dockerfile.prod -t your-registry/easy-kanban:latest .

# 2. Push to your registry
docker push your-registry/easy-kanban:latest

# 3. Update K8s deployment
kubectl rollout restart deployment/easy-kanban
# OR
kubectl set image deployment/easy-kanban app=your-registry/easy-kanban:latest
```

## Kubernetes Deployment Configuration

### deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: easy-kanban
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
  selector:
    matchLabels:
      app: easy-kanban
  template:
    metadata:
      labels:
        app: easy-kanban
        # Optional: add version label for tracking
        version: "{{ .Values.image.tag }}"
    spec:
      containers:
      - name: app
        image: your-registry/easy-kanban:latest
        imagePullPolicy: Always  # Important for 'latest' tag
        ports:
        - containerPort: 3010
        - containerPort: 3222
        env:
        - name: NODE_ENV
          value: "production"
        - name: REDIS_URL
          value: "redis://redis-service:6379"
        # JWT_SECRET from secret
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: easy-kanban-secrets
              key: jwt-secret
        # License settings from configmap
        envFrom:
        - configMapRef:
            name: easy-kanban-config
        
        # Health checks
        livenessProbe:
          httpGet:
            path: /api/version  # Use version endpoint for health check
            port: 3222
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/version
            port: 3222
          initialDelaySeconds: 5
          periodSeconds: 5
        
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

## Version API Endpoint

A public `/api/version` endpoint is available for debugging and monitoring:

```bash
# Check current version
curl https://your-domain.com/api/version

# Response:
{
  "version": "0.9-beta-a1b2c3d",
  "packageVersion": "0.0.0",
  "gitCommit": "a1b2c3d",
  "gitBranch": "main",
  "buildTime": "2025-10-27T12:34:56.789Z",
  "buildNumber": "123",
  "environment": "production"
}
```

## Monitoring Version Changes

### Check Current Version
```bash
kubectl exec -it deployment/easy-kanban -- cat /app/server/version.json
```

### Check Version Across All Pods
```bash
kubectl get pods -l app=easy-kanban -o json | \
  jq -r '.items[] | .metadata.name + ": " + .status.containerStatuses[0].imageID'
```

### Watch Rollout Status
```bash
kubectl rollout status deployment/easy-kanban
```

## Troubleshooting

### Issue: Users not notified of version change

**Check:**
1. Redis is running and accessible
2. WebSocket connections are working
3. Database was updated with new version

```bash
# Check Redis
kubectl logs deployment/easy-kanban | grep -i redis

# Check version broadcast
kubectl logs deployment/easy-kanban | grep -i "Broadcasting app version"

# Check database
kubectl exec -it deployment/easy-kanban -- sqlite3 /app/server/data/kanban.db \
  "SELECT key, value FROM settings WHERE key = 'APP_VERSION';"
```

### Issue: Version shows as "0" or "unknown"

**Cause:** Git was not available during Docker build

**Solution:** Ensure Dockerfile.prod includes git:
```dockerfile
RUN apk add --no-cache git && \
    node scripts/generate-version.js && \
    apk del git
```

### Issue: Version doesn't change after deployment

**Check:**
1. Image was actually rebuilt (not using cached layer)
2. Pod picked up the new image (not using old cached image)

```bash
# Force rebuild without cache
docker build --no-cache -f Dockerfile.prod -t your-registry/easy-kanban:latest .

# Force image pull in K8s
kubectl delete pod -l app=easy-kanban
```

## Best Practices

### 1. Use Image Tags (Not 'latest')
```yaml
image: your-registry/easy-kanban:v1.2.3-a1b2c3d
imagePullPolicy: IfNotPresent
```

### 2. Add Version Labels
```yaml
metadata:
  labels:
    version: "v1.2.3"
    git-commit: "a1b2c3d"
```

### 3. Enable Rollback
```bash
# Rollback to previous version
kubectl rollout undo deployment/easy-kanban

# Rollback to specific revision
kubectl rollout undo deployment/easy-kanban --to-revision=2
```

### 4. Monitor Rollouts
```bash
# Watch rollout status
kubectl rollout status deployment/easy-kanban --watch

# Check rollout history
kubectl rollout history deployment/easy-kanban
```

## Migration from ENV Variables

If you're currently using `APP_VERSION` environment variable:

1. ✅ **No changes needed** - the system supports both methods
2. ✅ **Fallback is automatic** - if version.json doesn't exist, ENV is used
3. ✅ **Gradual migration** - you can switch at your own pace

The priority is:
1. `server/version.json` (build-time, recommended for K8s)
2. `process.env.APP_VERSION` (runtime, works for Docker Compose)
3. Database `settings.APP_VERSION` (fallback)

## Summary

✅ **Works in Docker Compose** (reads version.json or ENV)  
✅ **Works in Kubernetes** (version.json is baked into image)  
✅ **Automatic detection** (no manual ENV updates needed)  
✅ **User notifications** (real-time via WebSocket)  
✅ **Git traceability** (includes commit hash)  
✅ **CI/CD friendly** (no configuration needed)

Version changes are now **automatic and reliable** across all deployment methods! 🎉

