# SQLite Proxy Service

Standalone service for Easy Kanban multi-tenant deployments. Provides centralized SQLite database access to prevent NFS locking issues.

## Overview

This is a lightweight, standalone service that:
- Maintains one database connection per tenant
- Queues queries serially per tenant (prevents concurrent write conflicts)
- Provides HTTP API for database operations
- Supports batch transactions for performance optimization

## Architecture

```
Easy Kanban Pods → HTTP → SQLite Proxy Service → SQLite Databases (NFS)
```

## Dependencies

- **express**: ^5.1.0 (HTTP server)
- **better-sqlite3**: ^12.4.1 (SQLite driver)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP server port |
| `DB_BASE_PATH` | `/app/server/data` | Base path for tenant databases |
| `LOG_SLOW_QUERIES` | `true` | Enable slow query logging |
| `SLOW_QUERY_THRESHOLD_MS` | `100` | Only log queries slower than this (ms) |
| `LOG_ALL_QUERIES` | `false` | Log all queries (for debugging) |
| `NODE_ENV` | `development` | Node environment |

## API Endpoints

### `POST /query`
Execute a single SQL query.

**Request:**
```json
{
  "tenantId": "fastest",
  "query": "SELECT * FROM tasks WHERE id = ?",
  "params": ["task-123"]
}
```

**Response:**
```json
{
  "type": "all",
  "result": [...]
}
```

### `POST /transaction`
Execute multiple queries in a single transaction.

**Request:**
```json
{
  "tenantId": "fastest",
  "queries": [
    { "query": "UPDATE tasks SET position = ? WHERE id = ?", "params": [1, "task-1"] },
    { "query": "UPDATE tasks SET position = ? WHERE id = ?", "params": [2, "task-2"] }
  ]
}
```

**Response:**
```json
{
  "results": [result1, result2, ...]
}
```

### `GET /health`
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "connections": 5,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### `GET /info/:tenantId`
Get database information for a tenant.

**Response:**
```json
{
  "tenantId": "fastest",
  "journalMode": "wal",
  "synchronous": "normal",
  "integrity": "ok"
}
```

## Local Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Or run directly
node index.js
```

## Docker Build

```bash
# Build image
docker build -t sqlite-proxy:latest .

# Run container
docker run -p 3001:3001 \
  -v /path/to/data:/app/server/data \
  -e DB_BASE_PATH=/app/server/data \
  sqlite-proxy:latest
```

## Kubernetes Deployment

### 1. Build and Push Image

```bash
# Build
docker build -t your-registry/sqlite-proxy:latest .

# Push
docker push your-registry/sqlite-proxy:latest
```

### 2. Deploy to Kubernetes

```bash
# Update image in deployment.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

### 3. Configure Easy Kanban

Set the proxy URL in Easy Kanban ConfigMap:

```bash
kubectl patch configmap easy-kanban-config -n easy-kanban \
  --type merge -p '{"data":{"SQLITE_PROXY_URL":"http://sqlite-proxy:3001"}}'
```

## Performance

- **Query Timing**: Uses `process.hrtime.bigint()` for high-resolution timing (< 0.001ms overhead)
- **Logging**: Only logs slow queries by default (> 100ms) to minimize overhead
- **Connection Pooling**: Reuses connections per tenant
- **Serial Execution**: Prevents NFS locking issues

## Security

- Blocks dangerous SQL operations (DROP, VACUUM, ATTACH, etc.)
- Runs as non-root user in Docker
- Only accepts JSON requests
- Validates all input parameters

## Monitoring

Check logs for slow queries:
```bash
kubectl logs -n easy-kanban -l app=sqlite-proxy | grep "⏱️"
```

Check health:
```bash
kubectl exec -n easy-kanban deployment/sqlite-proxy -- wget -qO- http://localhost:3001/health
```

## Troubleshooting

### Connection Issues
- Verify NFS volume is mounted at `DB_BASE_PATH`
- Check file permissions on database files
- Ensure proxy service has access to `/app/server/data`

### Performance Issues
- Enable `LOG_ALL_QUERIES=true` to see all queries
- Check slow query logs
- Monitor connection pool size via `/health` endpoint

### Database Locking
- Ensure only one proxy instance per tenant (replicas: 1)
- Check for long-running transactions
- Verify WAL mode is enabled (check `/info/:tenantId`)

