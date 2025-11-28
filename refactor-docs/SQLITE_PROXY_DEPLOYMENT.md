# SQLite Proxy Deployment Guide

## Overview

This guide walks through deploying the SQLite proxy service and enabling it in your Easy-Kanban multi-tenant Kubernetes deployment.

## Prerequisites

- ✅ Code is "proxy-aware" (all async/await implemented)
- ✅ Kubernetes cluster with NFS storage configured
- ✅ Easy-Kanban application image built and available
- ✅ Multi-tenant mode enabled (`MULTI_TENANT=true`)

## Deployment Steps

### Step 1: Choose Image Strategy

You have two options for the proxy service image:

#### Option A: Reuse Easy-Kanban Image (Simplest)
The Easy-Kanban image already contains all dependencies (`express`, `better-sqlite3`), so you can reuse it:

```bash
# In sqlite-proxy-deployment.yaml, use the same image as your Easy-Kanban app
# Example: image: your-registry/easy-kanban:latest
```

**Pros**: No additional build needed, simpler deployment  
**Cons**: Larger image size (~200MB+ with all app dependencies)

#### Option B: Build Separate Minimal Proxy Image (More Efficient)
Create a smaller image with only proxy dependencies:

```bash
# Build minimal proxy image
docker build -f Dockerfile.proxy -t your-registry/easy-kanban-proxy:latest .

# Push to registry
docker push your-registry/easy-kanban-proxy:latest

# Update sqlite-proxy-deployment.yaml to use this image
```

**Pros**: Smaller image (~50MB), faster startup  
**Cons**: Requires separate build process

### Step 2: Deploy SQLite Proxy Service

The proxy service must be deployed **before** enabling it in the app pods.

```bash
# 1. Update the image name in sqlite-proxy-deployment.yaml
# Replace IMAGE_NAME_PLACEHOLDER with your chosen image

# 2. Deploy the proxy service
kubectl apply -f k8s/sqlite-proxy-deployment.yaml
kubectl apply -f k8s/sqlite-proxy-service.yaml

# 3. Verify deployment
kubectl get pods -n easy-kanban -l app=sqlite-proxy
kubectl get svc -n easy-kanban sqlite-proxy

# 4. Check logs
kubectl logs -n easy-kanban -l app=sqlite-proxy --tail=50
```

Expected output:
```
🚀 SQLite Proxy Service listening on port 3001
```

### Step 3: Update ConfigMap

Enable the proxy in your ConfigMap:

```bash
# Edit configmap.yaml or apply directly
kubectl patch configmap easy-kanban-config -n easy-kanban --type merge -p '
{
  "data": {
    "MULTI_TENANT": "true",
    "SQLITE_PROXY_URL": "http://sqlite-proxy:3001"
  }
}'
```

Or update `k8s/configmap.yaml` and reapply:
```yaml
MULTI_TENANT: "true"
SQLITE_PROXY_URL: "http://sqlite-proxy:3001"
```

### Step 4: Restart Application Pods

After updating the ConfigMap, restart the app pods to pick up the new environment variable:

```bash
# Option 1: Rolling restart
kubectl rollout restart deployment/DEPLOYMENT_NAME -n easy-kanban

# Option 2: Delete pods (they will be recreated)
kubectl delete pods -n easy-kanban -l app=easy-kanban,component=frontend

# Verify pods are using proxy
kubectl logs -n easy-kanban -l app=easy-kanban,component=frontend | grep "Using SQLite proxy"
```

Expected log output:
```
🔗 Using SQLite proxy for tenant: drenlia
```

### Step 5: Verify Proxy is Working

Test that queries are going through the proxy:

```bash
# Check proxy logs for incoming queries
kubectl logs -n easy-kanban -l app=sqlite-proxy --tail=100 -f

# In another terminal, make a request to your app
# You should see query logs in the proxy pod
```

### Step 6: Monitor Health

Check both services are healthy:

```bash
# Proxy health
kubectl exec -n easy-kanban -l app=sqlite-proxy -- curl http://localhost:3001/health

# App health (should still work)
kubectl exec -n easy-kanban -l app=easy-kanban,component=frontend -- curl http://localhost:3222/health
```

## Rollback Procedure

If you need to disable the proxy and revert to direct connections:

```bash
# 1. Remove SQLITE_PROXY_URL from ConfigMap
kubectl patch configmap easy-kanban-config -n easy-kanban --type merge -p '
{
  "data": {
    "SQLITE_PROXY_URL": ""
  }
}'

# 2. Restart app pods
kubectl rollout restart deployment/DEPLOYMENT_NAME -n easy-kanban

# 3. (Optional) Delete proxy service if not needed
kubectl delete -f k8s/sqlite-proxy-deployment.yaml
kubectl delete -f k8s/sqlite-proxy-service.yaml
```

## Troubleshooting

### Proxy Not Receiving Requests

1. **Check service exists:**
   ```bash
   kubectl get svc sqlite-proxy -n easy-kanban
   ```

2. **Check DNS resolution:**
   ```bash
   kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup sqlite-proxy.easy-kanban.svc.cluster.local
   ```

3. **Check environment variable:**
   ```bash
   kubectl exec -n easy-kanban -l app=easy-kanban,component=frontend -- env | grep SQLITE_PROXY_URL
   ```

### Proxy Connection Errors

1. **Check proxy is running:**
   ```bash
   kubectl get pods -n easy-kanban -l app=sqlite-proxy
   kubectl logs -n easy-kanban -l app=sqlite-proxy
   ```

2. **Check network connectivity:**
   ```bash
   kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- curl http://sqlite-proxy:3001/health
   ```

### Database Lock Errors

If you still see database locking errors:

1. **Verify proxy is being used:**
   - Check app logs for "Using SQLite proxy"
   - Check proxy logs for incoming queries

2. **Check query queue:**
   - Proxy should serialize queries per tenant
   - If you see concurrent queries in proxy logs, there may be an issue

3. **Verify WAL mode:**
   ```bash
   kubectl exec -n easy-kanban -l app=sqlite-proxy -- curl http://localhost:3001/info/drenlia
   ```
   Should show `journalMode: "wal"`

## Performance Considerations

### Proxy Overhead

- **HTTP overhead**: ~1-2ms per query (local network)
- **Serialization**: Queries for same tenant are serialized (prevents locking)
- **Connection pooling**: Proxy reuses connections (minimal overhead)

### Optimization Tips

1. **Batch operations**: Use transactions when possible
2. **Read queries**: Can be parallelized (WAL mode allows concurrent reads)
3. **Write queries**: Automatically serialized per tenant (by design)

## Production Checklist

- [ ] Proxy service deployed and healthy
- [ ] ConfigMap updated with `SQLITE_PROXY_URL`
- [ ] App pods restarted and using proxy
- [ ] Health checks passing
- [ ] No database locking errors in logs
- [ ] Proxy logs show incoming queries
- [ ] WAL mode enabled (check `/info/:tenantId` endpoint)
- [ ] Monitoring/alerting configured (optional)

## Next Steps

After successful deployment:

1. **Monitor**: Watch proxy and app logs for any issues
2. **Scale**: App pods can scale horizontally (proxy handles load)
3. **Backup**: Ensure backup scripts work with proxy (they should)
4. **Maintenance**: Proxy can be restarted independently of app pods

