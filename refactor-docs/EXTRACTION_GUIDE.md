# SQLite Proxy Service - Extraction Guide

This guide explains how to extract and deploy the SQLite proxy service as a standalone application.

## Steps to Extract and Deploy

### 1. Create Standalone Service

The proxy service has been extracted to `/sqlite-proxy-service/` directory with:
- `index.js` - Main service code (extracted from `scripts/sqlite-proxy-service.js`)
- `package.json` - Minimal dependencies (only express and better-sqlite3)
- `Dockerfile` - Standalone Docker image
- `k8s/` - Kubernetes deployment files

### 2. Build Docker Image

```bash
cd sqlite-proxy-service

# Build image
docker build -t your-registry/sqlite-proxy:latest .

# Tag for your registry
docker tag sqlite-proxy:latest your-registry/sqlite-proxy:latest

# Push to registry
docker push your-registry/sqlite-proxy:latest
```

### 3. Update Kubernetes Deployment

Edit `sqlite-proxy-service/k8s/deployment.yaml`:
- Replace `your-registry/sqlite-proxy:latest` with your actual registry URL

### 4. Deploy to Kubernetes

```bash
# Deploy proxy service
kubectl apply -f sqlite-proxy-service/k8s/deployment.yaml
kubectl apply -f sqlite-proxy-service/k8s/service.yaml

# Verify deployment
kubectl get deployment sqlite-proxy -n easy-kanban
kubectl get service sqlite-proxy -n easy-kanban
```

### 5. Configure Easy Kanban to Use Proxy

Update Easy Kanban ConfigMap:

```bash
kubectl patch configmap easy-kanban-config -n easy-kanban \
  --type merge -p '{"data":{"SQLITE_PROXY_URL":"http://sqlite-proxy:3001"}}'
```

### 6. Restart Easy Kanban Pods

```bash
kubectl rollout restart deployment/easy-kanban -n easy-kanban
```

### 7. Verify Proxy is Working

```bash
# Check proxy logs
kubectl logs -n easy-kanban -l app=sqlite-proxy --tail=50

# Check proxy health
kubectl exec -n easy-kanban deployment/sqlite-proxy -- wget -qO- http://localhost:3001/health

# Check Easy Kanban is using proxy
kubectl logs -n easy-kanban -l app=easy-kanban | grep "Using SQLite proxy"
```

## Benefits of Standalone Service

1. **Smaller Image Size**: Only includes express and better-sqlite3 (~50MB vs ~500MB)
2. **Independent Scaling**: Can scale proxy separately from app
3. **Independent Updates**: Update proxy without rebuilding entire app
4. **Better Resource Management**: Lower memory footprint
5. **Clearer Separation**: Proxy is a separate service with its own lifecycle

## Image Size Comparison

- **Full Easy Kanban Image**: ~500MB (includes frontend, backend, all dependencies)
- **Standalone Proxy Image**: ~50MB (only proxy service + minimal dependencies)

## Migration Path

1. **Phase 1**: Deploy standalone proxy alongside existing setup
2. **Phase 2**: Update Easy Kanban to use standalone proxy
3. **Phase 3**: Remove proxy code from Easy Kanban image (optional cleanup)

## Rollback Plan

If issues occur, you can rollback by:
1. Removing `SQLITE_PROXY_URL` from ConfigMap
2. Restarting Easy Kanban pods (they'll use direct DB access)
3. The proxy service can remain running (it won't be used)

## Maintenance

### Update Proxy Service

```bash
# Build new image
cd sqlite-proxy-service
docker build -t your-registry/sqlite-proxy:v1.1.0 .

# Push
docker push your-registry/sqlite-proxy:v1.1.0

# Update deployment
kubectl set image deployment/sqlite-proxy sqlite-proxy=your-registry/sqlite-proxy:v1.1.0 -n easy-kanban
```

### Monitor Proxy

```bash
# Watch logs
kubectl logs -n easy-kanban -l app=sqlite-proxy -f

# Check resource usage
kubectl top pod -n easy-kanban -l app=sqlite-proxy

# Check connections
kubectl exec -n easy-kanban deployment/sqlite-proxy -- wget -qO- http://localhost:3001/health | jq
```

