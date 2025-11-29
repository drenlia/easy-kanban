# SQLite Proxy Deployment Notes

## Image Name vs Pod Name

✅ **Yes, it's possible!** You can use a different image name (`sqlite-proxy`) while keeping the same pod name (`sqlite-proxy`). Kubernetes will replace the existing deployment when you apply the new configuration.

## Deployment Strategy

### Current Setup
- **Pod Name**: `sqlite-proxy` (stays the same)
- **Image Name**: `internal-registry.kube-system.svc.cluster.local:5000/sqlite-proxy:latest` (new standalone image)

### What Happens When You Deploy

1. **Build and Push** the new standalone image:
   ```bash
   ./scripts/build-and-push-to-registry-proxy.sh
   ```

2. **Apply the new deployment**:
   ```bash
   kubectl apply -f sqlite-proxy-service/k8s/deployment.yaml
   kubectl apply -f sqlite-proxy-service/k8s/service.yaml
   ```

3. **Kubernetes will**:
   - Detect the image change in the deployment
   - Create a new ReplicaSet with the new image
   - Gradually terminate old pods and start new ones (rolling update)
   - The service name `sqlite-proxy` remains the same, so Easy Kanban continues to connect to `http://sqlite-proxy:3001`

### Key Points

- ✅ **Same pod name** (`sqlite-proxy`) = no service disruption
- ✅ **New image** (`sqlite-proxy:latest`) = smaller, standalone service
- ✅ **Rolling update** = zero downtime deployment
- ✅ **Service unchanged** = Easy Kanban doesn't need reconfiguration

## Migration Steps

1. **Build the new image**:
   ```bash
   cd sqlite-proxy-service
   ./scripts/build-and-push-to-registry-proxy.sh
   ```

2. **Deploy the new proxy** (replaces old one):
   ```bash
   kubectl apply -f sqlite-proxy-service/k8s/deployment.yaml
   kubectl apply -f sqlite-proxy-service/k8s/service.yaml
   ```

3. **Verify deployment**:
   ```bash
   kubectl get deployment sqlite-proxy -n easy-kanban
   kubectl get pods -n easy-kanban -l app=sqlite-proxy
   kubectl logs -n easy-kanban -l app=sqlite-proxy --tail=50
   ```

4. **Check proxy health**:
   ```bash
   kubectl exec -n easy-kanban deployment/sqlite-proxy -- wget -qO- http://localhost:3001/health
   ```

## Rollback (if needed)

If you need to rollback to the old proxy:

```bash
# Apply the old deployment
kubectl apply -f k8s/sqlite-proxy-deployment.yaml
kubectl apply -f k8s/sqlite-proxy-service.yaml
```

## Differences

| Aspect | Old Proxy | New Proxy |
|--------|-----------|-----------|
| **Image** | `easy-kanban:latest` (full app) | `sqlite-proxy:latest` (standalone) |
| **Size** | ~500MB | ~50MB |
| **Command** | `node scripts/sqlite-proxy-service.js` | `node index.js` (default CMD) |
| **Dependencies** | All Easy Kanban deps | Only express + better-sqlite3 |
| **Mount Path** | `/data` (old) → `/app/server/data` (updated) | `/app/server/data` |

## Benefits

1. **90% smaller image** (50MB vs 500MB)
2. **Faster deployments** (less to pull)
3. **Independent updates** (update proxy without rebuilding app)
4. **Lower resource usage** (smaller memory footprint)
5. **Clearer separation** (proxy is a separate service)

