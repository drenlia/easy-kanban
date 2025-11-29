# SQLite Proxy Service - Quick Start Guide

## Quick Deployment Steps

### 1. Build the Image

```bash
cd sqlite-proxy-service

# Build locally
docker build -t sqlite-proxy:latest .

# Or use the build script
./build.sh
```

### 2. Push to Your Registry

```bash
# Tag for your registry
docker tag sqlite-proxy:latest your-registry/sqlite-proxy:latest

# Push
docker push your-registry/sqlite-proxy:latest

# Or use build script with push
REGISTRY=your-registry PUSH=true ./build.sh
```

### 3. Update Kubernetes Deployment

Edit `k8s/deployment.yaml` and replace:
```yaml
image: your-registry/sqlite-proxy:latest
```

With your actual registry URL.

### 4. Deploy to Kubernetes

```bash
# Deploy proxy service
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

# Wait for deployment
kubectl wait --for=condition=available --timeout=60s deployment/sqlite-proxy -n easy-kanban
```

### 5. Configure Easy Kanban

```bash
# Set proxy URL in ConfigMap
kubectl patch configmap easy-kanban-config -n easy-kanban \
  --type merge -p '{"data":{"SQLITE_PROXY_URL":"http://sqlite-proxy:3001"}}'

# Restart Easy Kanban pods
kubectl rollout restart deployment/easy-kanban -n easy-kanban
```

### 6. Verify

```bash
# Check proxy is running
kubectl get pods -n easy-kanban -l app=sqlite-proxy

# Check proxy health
kubectl exec -n easy-kanban deployment/sqlite-proxy -- wget -qO- http://localhost:3001/health

# Check Easy Kanban is using proxy
kubectl logs -n easy-kanban -l app=easy-kanban | grep "Using SQLite proxy"
```

## What Changed?

### Before (Integrated)
- Proxy code in `scripts/sqlite-proxy-service.js`
- Runs from Easy Kanban image
- Image size: ~500MB
- Updates require rebuilding entire app

### After (Standalone)
- Proxy code in `sqlite-proxy-service/` directory
- Runs as separate service
- Image size: ~50MB (90% smaller!)
- Can update proxy independently

## Benefits

1. **Smaller Image**: 90% reduction in image size
2. **Independent Updates**: Update proxy without rebuilding app
3. **Better Resource Management**: Lower memory footprint
4. **Clearer Separation**: Proxy is a separate service
5. **Easier Scaling**: Can scale proxy separately if needed

## File Structure

```
sqlite-proxy-service/
├── index.js              # Main service code
├── package.json          # Dependencies (express, better-sqlite3)
├── Dockerfile            # Standalone Docker image
├── .dockerignore         # Files to exclude from build
├── .gitignore           # Git ignore rules
├── README.md            # Full documentation
├── EXTRACTION_GUIDE.md  # Detailed extraction guide
├── QUICK_START.md       # This file
├── build.sh             # Build script
└── k8s/
    ├── deployment.yaml  # Kubernetes deployment
    └── service.yaml     # Kubernetes service
```

## Testing Locally

```bash
# Install dependencies
npm install

# Run service
npm start

# Test health endpoint
curl http://localhost:3001/health

# Test query endpoint
curl -X POST http://localhost:3001/query \
  -H "Content-Type: application/json" \
  -d '{"tenantId":"test","query":"SELECT 1 as test","params":[]}'
```

## Troubleshooting

### Image Build Fails
- Ensure Node.js 22+ is available
- Check Docker has access to build tools (python3, make, g++)

### Deployment Fails
- Verify NFS volume is mounted
- Check PVC exists: `kubectl get pvc -n easy-kanban`
- Verify image is accessible: `kubectl describe pod -n easy-kanban -l app=sqlite-proxy`

### Proxy Not Responding
- Check logs: `kubectl logs -n easy-kanban -l app=sqlite-proxy`
- Verify service: `kubectl get svc sqlite-proxy -n easy-kanban`
- Test from pod: `kubectl exec -n easy-kanban deployment/easy-kanban -- wget -qO- http://sqlite-proxy:3001/health`

