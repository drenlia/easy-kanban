# Multi-Tenant Implementation

## Overview

Easy Kanban supports multi-tenant (Kubernetes SaaS) and single-tenant (Docker) deployments. Both use **PostgreSQL** via `PostgresDatabase` / sqlManager. SQLite is not supported.

## Architecture

### Single-tenant mode (Docker)

- **Environment**: `MULTI_TENANT=false` (or unset)
- **Database**: One Postgres database; app uses the **`public`** schema
- **Initialization**: DB connection and migrations at startup
- **Use case**: Self-hosted free / example / dev compose

### Multi-tenant mode (Kubernetes)

- **Environment**: `MULTI_TENANT=true`
- **Database**: One shared Postgres database (`easykanban`); **one schema per tenant**: `tenant_{tenantId}`
- **Routing**: Hostname `{tenantId}.{TENANT_DOMAIN}` → `search_path` / schema for that tenant
- **Initialization**: Schema created/migrated when the tenant is first opened (or via deploy scripts)
- **Use case**: Shared app pods serving many hosts (namespace `easy-kanban-pg`)

Storage (files) remains per-tenant under NFS-style paths, e.g.:

```
/app/server/attachments/tenants/{tenantId}/
/app/server/avatars/tenants/{tenantId}/
```

There is **no** `kanban.db` file per tenant.

## Key components

### 1. Tenant routing (`server/middleware/tenantRouting.js`)

- Extracts tenant id from hostname using `TENANT_DOMAIN`
- Opens / caches a `PostgresDatabase` handle for that tenant schema
- Exposes `getRequestDatabase(req)` for routes
- On multi-tenant pods, Redis Socket.IO adapter is required for cross-pod rooms

### 2. Database (`server/config/database.js`, `postgresDatabase.js`)

- Requires Postgres (`POSTGRES_HOST`, etc.)
- Multi-tenant: schema name `tenant_${tenantId}` (identifiers with hyphens are quoted)
- Single-tenant: `public` schema

### 3. Realtime

- App events: `notificationService.publish()` → **PostgreSQL `NOTIFY`**
- Browsers: Socket.IO rooms `tenant-{id}`
- Redis: **adapter only** (not the notification bus)

See [`docs/REALTIME_UPDATE_FLOW-MULTI-TENANCY.md`](../docs/REALTIME_UPDATE_FLOW-MULTI-TENANCY.md).

## Ops scripts

| Action | Script |
|--------|--------|
| Deploy tenant | `./k8s/deploy-instance-pg.sh <name> <basic\|pro>` |
| Destroy tenant | `./k8s/destroy-instance-pg.sh <name>` |

Legacy `deploy-instance.sh` / `deploy.sh` / SQLite destroy paths are retired. Full ops notes: [`MULTI_TENANT_DEPLOYMENT_GUIDE.md`](./MULTI_TENANT_DEPLOYMENT_GUIDE.md).

## Environment variables

| Variable | Purpose |
|----------|---------|
| `MULTI_TENANT` | `true` for hostname-based tenants |
| `TENANT_DOMAIN` | Domain suffix (default `ezkan.cloud`) |
| `POSTGRES_*` / `DB_TYPE` | Postgres connection |
| `REDIS_URL` | Socket.IO adapter (required when multi-tenant / multi-pod) |

## Backward compatibility

Docker single-tenant remains the default for compose templates. Multi-tenant is additive via env + K8s PG manifests (`*-pg.yaml`, `deploy-pg.sh`).
