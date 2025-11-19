# Multi-Tenant Implementation

## Overview

This implementation adds support for multi-tenant architecture while maintaining full backward compatibility with single-tenant (Docker) deployments.

## Architecture

### Single-Tenant Mode (Docker)
- **Environment**: `MULTI_TENANT=false` or unset
- **Database**: Single SQLite database at `/app/server/data/kanban.db`
- **Initialization**: Database initialized at startup
- **Use Case**: Self-hosted free version, development

### Multi-Tenant Mode (Kubernetes)
- **Environment**: `MULTI_TENANT=true`
- **Database**: Multiple SQLite databases, one per tenant
- **Path Pattern**: `/app/server/data/tenants/{tenantId}/kanban.db`
- **Initialization**: Database initialized per-request via middleware
- **Use Case**: SaaS hosted version with shared pods

## Key Components

### 1. Tenant Routing Middleware (`server/middleware/tenantRouting.js`)

**Purpose**: Extracts tenant ID from hostname and loads the appropriate database.

**Features**:
- Extracts tenant ID from hostname (e.g., `customer1.ezkan.cloud` → `customer1`)
- Caches database connections per tenant
- Provides tenant storage paths (attachments, avatars)
- Handles graceful shutdown of all tenant databases

**Hostname Pattern**:
- Multi-tenant: `{tenantId}.{domain}` (e.g., `customer1.ezkan.cloud`)
- Single-tenant: `localhost`, IP addresses, or any non-matching hostname

**Environment Variables**:
- `MULTI_TENANT`: `true` to enable multi-tenant mode
- `TENANT_DOMAIN`: Domain for tenant subdomains (default: `ezkan.cloud`)

### 2. Database Configuration (`server/config/database.js`)

**Changes**:
- `getDbPath(tenantId)`: Returns tenant-specific or default database path
- `initializeDatabase(tenantId)`: Supports optional tenant ID parameter
- `initializeDefaultData(db, tenantId)`: Supports tenant-specific initialization

**Path Logic**:
```javascript
// Multi-tenant mode with tenantId
/app/server/data/tenants/{tenantId}/kanban.db

// Single-tenant mode (backward compatible)
/app/server/data/kanban.db
```

### 3. Server Initialization (`server/index.js`)

**Changes**:
- Conditionally initializes database based on `MULTI_TENANT` mode
- Adds tenant routing middleware (only in multi-tenant mode)
- Updates middleware to use `req.app.locals.db` (set by tenant routing)
- Adds graceful shutdown for tenant databases

**Initialization Flow**:
1. Check `MULTI_TENANT` environment variable
2. If `false`: Initialize single database at startup
3. If `true`: Skip startup initialization, use tenant routing middleware
4. Middleware loads tenant database on first request

## Storage Paths

### Multi-Tenant Mode
```
/app/server/data/tenants/{tenantId}/kanban.db
/app/server/attachments/tenants/{tenantId}/
/app/server/avatars/tenants/{tenantId}/
```

### Single-Tenant Mode (Backward Compatible)
```
/app/server/data/kanban.db
/app/server/attachments/
/app/server/avatars/
```

## Licensing

**Fully Supported**: All licensing limits work correctly in multi-tenant mode:
- ✅ User limits: Per-tenant database
- ✅ Task limits: Per-tenant database
- ✅ Board limits: Per-tenant database
- ✅ Storage limits: Per-tenant database
- ✅ Plan enforcement: Per-tenant via `license_settings` table

Each tenant's database has its own `license_settings` table with plan-specific limits.

## Deployment Configuration

### Kubernetes (Multi-Tenant)

**Environment Variables**:
```yaml
env:
  - name: MULTI_TENANT
    value: "true"
  - name: TENANT_DOMAIN
    value: "ezkan.cloud"
  - name: DOCKER_ENV
    value: "true"
```

**Storage Requirements**:
- Shared PersistentVolume with `ReadWriteMany` access mode
- NFS, EFS, or other network storage
- All pods mount the same shared volume

### Docker Compose (Single-Tenant)

**Environment Variables**:
```yaml
env:
  - name: MULTI_TENANT
    value: "false"  # Or omit (defaults to false)
  - name: DOCKER_ENV
    value: "true"
```

**Storage**: Local Docker volumes (no changes needed)

## Admin Portal Changes

The admin portal will need to be updated to:
1. Create tenant databases instead of deploying pods
2. Initialize license settings in tenant databases
3. Register tenants in a tenant registry (ConfigMap or database)

## Migration Path

### Existing Single-Tenant Deployments
- **No changes required**: Backward compatible
- Continue using `MULTI_TENANT=false` or omit the variable

### New Multi-Tenant Deployment
1. Set up NFS/shared storage with `ReadWriteMany`
2. Deploy shared pod pool (3-5 replicas)
3. Set `MULTI_TENANT=true` in environment
4. Update admin portal to create tenant databases
5. Configure ingress for hostname-based routing

## Testing

### Single-Tenant Mode
```bash
# Docker Compose
docker compose up

# Should work exactly as before
# Database at: /app/server/data/kanban.db
```

### Multi-Tenant Mode
```bash
# Set environment variable
export MULTI_TENANT=true
export TENANT_DOMAIN=ezkan.cloud

# Start server
npm start

# Access via hostname
# customer1.ezkan.cloud -> /app/server/data/tenants/customer1/kanban.db
# customer2.ezkan.cloud -> /app/server/data/tenants/customer2/kanban.db
```

## Performance Considerations

### Database Connection Caching
- Tenant databases are cached in memory
- Connections are reused across requests
- Cache is cleared on graceful shutdown

### SQLite Concurrency
- SQLite handles concurrent reads well
- Writes are serialized per database file
- Different tenants can write in parallel (different files)
- Same tenant writes are serialized (acceptable for most workloads)

## Security

### Tenant Isolation
- Each tenant has a separate database file
- No cross-tenant data access possible
- Tenant ID validated from hostname
- Storage paths are tenant-specific

### Hostname Validation
- Tenant ID must match pattern: `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`
- Only valid subdomains are accepted
- Invalid hostnames fall back to single-tenant mode

## Future Enhancements

1. **Tenant Registry**: Centralized database/ConfigMap for tenant metadata
2. **Tenant Provisioning API**: Automated tenant creation
3. **Tenant Migration Tools**: Move tenants between storage backends
4. **PostgreSQL Support**: For higher concurrency requirements
5. **Tenant Analytics**: Per-tenant usage metrics

## Files Modified

- `server/middleware/tenantRouting.js` (new)
- `server/config/database.js` (updated)
- `server/index.js` (updated)

## Files Unchanged (Backward Compatible)

- All route handlers (use `req.app.locals.db`)
- All services (use database from request context)
- Docker Compose files (no changes needed)
- Frontend code (no changes needed)

