# Deployment Flow Clarification

## What Actually Happens When You Run `deploy-instance.sh`

### Your Understanding (Partially Correct)

You asked:
> "when I run deploy-instance from the admin, that will call deploy-instance.sh, the (new) sqlite-proxy would be deployed as a new pod and listen on port 3001, a new easy-kanban (pod x configured replicas) would be deployed if it wasn't already there and start running and listening on port 3010, with backend on 3222 but when already deployed (proxy+pod), the new tenant ingress rule gets configured tenant database becomes available and ready to be accessed by the admin portal to configure new owner's email, perform configurations of settings?"

### Actual Flow (Corrected)

#### First Tenant Deployment (e.g., `app`)

1. **SQLite Proxy** ✅
   - **Deploys**: Yes, if it doesn't exist
   - **Pod Name**: `sqlite-proxy-xxx` (single pod, shared for ALL tenants)
   - **Port**: 3001
   - **Status**: Shared service - only ONE proxy pod for all tenants

2. **Easy Kanban Pods** ✅
   - **Deploys**: Yes, if deployment doesn't exist
   - **Pod Names**: `easy-kanban-xxx` (multiple pods based on replicas, shared for ALL tenants)
   - **Ports**: 3010 (frontend), 3222 (backend)
   - **Status**: Shared deployment - same pods serve ALL tenants

3. **Ingress Rule** ✅
   - **Creates**: `easy-kanban-ingress-{tenant-id}` (tenant-specific)
   - **Points to**: Shared `easy-kanban-service` (not tenant-specific pods)
   - **Hostname**: `{tenant-id}.ezkan.cloud`

4. **Tenant Database** ⚠️
   - **Created**: NO, not during deployment
   - **Created when**: On first HTTP request to `{tenant-id}.ezkan.cloud`
   - **Location**: `/app/server/data/tenants/{tenant-id}/kanban.db`
   - **Initialization**: Tables, migrations, default data created automatically

#### Subsequent Tenant Deployments (e.g., `fastest`, `amanda`)

1. **SQLite Proxy** ❌
   - **Deploys**: NO (already exists)
   - **Status**: Reuses existing shared proxy pod
   - **Action**: Script checks if exists, skips if already deployed

2. **Easy Kanban Pods** ❌
   - **Deploys**: NO (already exists)
   - **Status**: Reuses existing shared pods
   - **Action**: Script checks if deployment exists, skips if already deployed
   - **Note**: Pods may restart if ConfigMap changes (only for first tenant)

3. **Ingress Rule** ✅
   - **Creates**: NEW `easy-kanban-ingress-{new-tenant-id}`
   - **Points to**: Same shared `easy-kanban-service`
   - **Hostname**: `{new-tenant-id}.ezkan.cloud`

4. **Tenant Database** ⚠️
   - **Created**: NO, not during deployment
   - **Created when**: On first HTTP request to `{new-tenant-id}.ezkan.cloud`
   - **Location**: `/app/server/data/tenants/{new-tenant-id}/kanban.db`

## Key Points

### Shared Infrastructure (One-Time Setup)
- ✅ **SQLite Proxy**: Single pod, shared by all tenants
- ✅ **Easy Kanban Pods**: Single deployment, shared by all tenants
- ✅ **Redis**: Single deployment, shared by all tenants
- ✅ **Services**: Single service, shared by all tenants
- ✅ **Storage**: Shared NFS PVCs, tenant-isolated paths

### Tenant-Specific (Per Tenant)
- ✅ **Ingress Rule**: One per tenant (`easy-kanban-ingress-{tenant-id}`)
- ✅ **Database**: One per tenant (created on first request)
- ✅ **Storage Paths**: Tenant-isolated directories on shared NFS

## Complete Flow Example

### Deploy First Tenant: `app`

```bash
./k8s/deploy-instance.sh app basic
```

**What Happens:**
1. ✅ Creates namespace `easy-kanban` (if not exists)
2. ✅ Deploys Redis (if not exists)
3. ✅ Deploys SQLite Proxy (if not exists) - **NEW POD**
4. ✅ Deploys Easy Kanban (if not exists) - **NEW PODS** (e.g., 3 replicas)
5. ✅ Creates ConfigMap with `INSTANCE_TOKEN`
6. ✅ Creates ingress `easy-kanban-ingress-app`
7. ⏳ Database NOT created yet

**Result:**
- Proxy pod: `sqlite-proxy-xxx` (listening on 3001)
- App pods: `easy-kanban-xxx` (3 pods, listening on 3010/3222)
- Ingress: `app.ezkan.cloud` → shared service
- Database: Will be created on first request

### Deploy Second Tenant: `fastest`

```bash
./k8s/deploy-instance.sh fastest pro
```

**What Happens:**
1. ✅ Namespace exists → skip
2. ✅ Redis exists → skip
3. ✅ SQLite Proxy exists → **REUSE EXISTING POD** (no new pod)
4. ✅ Easy Kanban exists → **REUSE EXISTING PODS** (no new pods)
5. ✅ ConfigMap exists → update (preserve token)
6. ✅ Creates ingress `easy-kanban-ingress-fastest` - **NEW INGRESS**
7. ⏳ Database NOT created yet

**Result:**
- Proxy pod: Same `sqlite-proxy-xxx` (shared)
- App pods: Same `easy-kanban-xxx` (shared)
- Ingress: `fastest.ezkan.cloud` → same shared service
- Database: Will be created on first request

## When Database is Created

The tenant database is **NOT** created during `deploy-instance.sh`. It's created **lazily** when:

1. First HTTP request arrives at `{tenant-id}.ezkan.cloud`
2. Easy Kanban pod extracts tenant ID from hostname
3. Pod checks if database exists at `/app/server/data/tenants/{tenant-id}/kanban.db`
4. If not exists, creates database and initializes:
   - Creates tables (from `CREATE_TABLES_SQL`)
   - Runs migrations
   - Creates default priorities
   - Creates default data

## Admin Portal Configuration

After `deploy-instance.sh` completes:

1. ✅ Ingress rule is ready → tenant URL accessible
2. ⏳ Database not created yet → first request triggers creation
3. ✅ Admin portal can configure:
   - Owner email (via API)
   - License settings (via API)
   - Other settings (via API)

**Best Practice**: Admin portal should make a health check request to trigger database creation:
```javascript
// Trigger database creation
await fetch(`https://${tenantId}.ezkan.cloud/health`);

// Then configure tenant
await configureTenant(tenantId, ownerEmail, plan);
```

## Summary

| Component | First Tenant | Subsequent Tenants |
|-----------|-------------|-------------------|
| **SQLite Proxy** | ✅ Deploys new pod | ❌ Reuses existing pod |
| **Easy Kanban** | ✅ Deploys new pods | ❌ Reuses existing pods |
| **Ingress** | ✅ Creates new rule | ✅ Creates new rule |
| **Database** | ⏳ Created on first request | ⏳ Created on first request |

**Key Insight**: The infrastructure is **shared**, but each tenant gets their own **ingress rule** and **database** (created lazily).

