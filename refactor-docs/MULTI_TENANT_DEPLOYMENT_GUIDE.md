# Multi-Tenant Deployment Guide for Admin Portal

## Overview

Easy Kanban now supports **multi-tenancy** where a single shared application pod serves all tenants. Each tenant has:
- **Shared**: Application pod, Redis, ConfigMap, Services, NFS storage
- **Unique**: Database, Ingress rule, License settings, Storage paths

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Kubernetes Namespace: easy-kanban (shared)            │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │  Shared Application Pod (easy-kanban)          │  │
│  │  - Serves ALL tenants                          │  │
│  │  - Routes requests based on hostname           │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │  Shared Redis (redis)                            │  │
│  │  - Tenant-isolated channels                     │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │  Shared NFS Storage (easy-kanban-shared-pvc)   │  │
│  │  - Tenant data: /app/server/data/tenants/{id}/  │  │
│  │  - Attachments: /app/server/attachments/...     │  │
│  │  - Avatars: /app/server/avatars/...             │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │  Tenant-Specific Ingress Rules                 │  │
│  │  - easy-kanban-ingress-{tenant-id}             │  │
│  │  - Points to shared service                    │  │
│  └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Initial Setup (One-Time)

### First Deployment

The first deployment sets up the **shared infrastructure** that all tenants will use:

```bash
./k8s/deploy-instance.sh app my-token basic
```

**What this creates:**
- ✅ Shared namespace: `easy-kanban`
- ✅ Shared Redis deployment
- ✅ Shared application pod: `easy-kanban`
- ✅ Shared services: `easy-kanban-service`, `easy-kanban-nodeport`
- ✅ Shared ConfigMap: `easy-kanban-config`
- ✅ Ingress rule for `app.ezkan.cloud`

**What this does NOT create:**
- ❌ Tenant database (created on first request)
- ❌ License settings (set via admin portal)

**Note:** The `plan` parameter is informational only. Actual license limits are set per-tenant via the admin portal API.

## Tenant Deployment Process

### Step 1: Create Ingress Rule

Each tenant needs an ingress rule pointing to their hostname. You can do this in two ways:

#### Option A: Use Kubernetes API (Recommended)

```javascript
// Example: Create ingress for tenant "customer1"
const ingressManifest = {
  apiVersion: 'networking.k8s.io/v1',
  kind: 'Ingress',
  metadata: {
    name: `easy-kanban-ingress-${tenantId}`,
    namespace: 'easy-kanban',
    labels: {
      app: 'easy-kanban'
    },
    annotations: {
      'nginx.ingress.kubernetes.io/rewrite-target': '/',
      'nginx.ingress.kubernetes.io/ssl-redirect': 'false',
      'nginx.ingress.kubernetes.io/proxy-body-size': '50m',
      'nginx.ingress.kubernetes.io/proxy-read-timeout': '300',
      'nginx.ingress.kubernetes.io/proxy-send-timeout': '300'
    }
  },
  spec: {
    ingressClassName: 'nginx',
    rules: [{
      host: `${tenantId}.ezkan.cloud`,
      http: {
        paths: [{
          path: '/',
          pathType: 'Prefix',
          backend: {
            service: {
              name: 'easy-kanban-service',
              port: { number: 80 }
            }
          }
        }]
      }
    }]
  }
};

// Apply via Kubernetes API
await kubernetesApi.createNamespacedIngress('easy-kanban', ingressManifest);
```

#### Option B: Call Deployment Script

```bash
# This will create the ingress rule (and skip shared resources if they exist)
./k8s/deploy-instance.sh {tenantId} {instanceToken} {plan}
```

**Note:** The deployment script will:
- ✅ Create ingress rule for the tenant
- ⚠️ Skip shared resources if they already exist
- ❌ Does NOT set license limits (must be done via API)

### Step 2: Wait for Database Initialization

When a user first accesses `https://{tenantId}.ezkan.cloud`, the application will:
1. Extract tenant ID from hostname (`{tenantId}`)
2. Create tenant database at: `/app/server/data/tenants/{tenantId}/kanban.db`
3. Initialize tables, run migrations, create default data
4. Database is now ready for use

**Important:** The database is created **lazily** on first request. You don't need to pre-create it.

### Step 3: Set License Limits

After the tenant database is initialized, set license limits via the admin portal API:

```javascript
// Set license limits for a tenant
const tenantId = 'customer1';
const plan = 'pro'; // or 'basic'

// License limits based on plan
const limits = plan === 'basic' ? {
  USER_LIMIT: '5',
  TASK_LIMIT: '100',
  BOARD_LIMIT: '10',
  STORAGE_LIMIT: '1073741824', // 1GB in bytes
  SUPPORT_TYPE: 'basic'
} : {
  USER_LIMIT: '50',
  TASK_LIMIT: '-1', // unlimited
  BOARD_LIMIT: '-1', // unlimited
  STORAGE_LIMIT: '10737418240', // 10GB in bytes
  SUPPORT_TYPE: 'pro'
};

// Set each limit via API
for (const [key, value] of Object.entries(limits)) {
  await fetch(`https://${tenantId}.ezkan.cloud/api/admin-portal/plan/${key}?tenantId=${tenantId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${instanceToken}`,
      'Content-Type': 'application/json',
      'X-Tenant-ID': tenantId // Required for admin portal to access tenant database
    },
    body: JSON.stringify({ value })
  });
}
```

**API Endpoint:** `PUT /api/admin-portal/plan/:key`

**Parameters:**
- `tenantId` (query param or `X-Tenant-ID` header): Tenant identifier
- `key`: One of: `USER_LIMIT`, `TASK_LIMIT`, `BOARD_LIMIT`, `STORAGE_LIMIT`, `SUPPORT_TYPE`
- `value`: The limit value (number as string, or `-1` for unlimited)

**Authentication:** Requires `INSTANCE_TOKEN` in `Authorization: Bearer {token}` header

## Admin Portal API Endpoints

### Accessing Tenant Data

The admin portal can access any tenant's database by specifying the tenant ID:

**Method 1: Query Parameter**
```
GET /api/admin-portal/users?tenantId=customer1
```

**Method 2: Header**
```
GET /api/admin-portal/users
Headers:
  X-Tenant-ID: customer1
```

### License Management

#### Get License Information
```
GET /api/admin-portal/plan?tenantId={tenantId}
Authorization: Bearer {instanceToken}
X-Tenant-ID: {tenantId}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "plan": "pro",
    "usage": {
      "users": 12,
      "boards": 5,
      "totalTasks": 234,
      "storage": 536870912
    },
    "limitsReached": {
      "users": false,
      "boards": false,
      "storage": false
    },
    "features": [
      {
        "key": "USER_LIMIT",
        "inMemory": 50,
        "database": "50",
        "currentUsage": 12,
        "limitReached": false
      },
      // ... other limits
    ]
  }
}
```

#### Set License Limit
```
PUT /api/admin-portal/plan/{key}?tenantId={tenantId}
Authorization: Bearer {instanceToken}
X-Tenant-ID: {tenantId}
Content-Type: application/json

{
  "value": "50"
}
```

**Allowed keys:**
- `USER_LIMIT`: Maximum number of active users
- `TASK_LIMIT`: Maximum tasks per board (-1 for unlimited)
- `BOARD_LIMIT`: Maximum number of boards (-1 for unlimited)
- `STORAGE_LIMIT`: Maximum storage in bytes
- `SUPPORT_TYPE`: `"basic"` or `"pro"`

#### Delete License Limit Override
```
DELETE /api/admin-portal/plan/{key}?tenantId={tenantId}
Authorization: Bearer {instanceToken}
X-Tenant-ID: {tenantId}
```

This removes the database override and falls back to environment variable defaults.

## Storage Paths

All tenants share the same NFS volume, but data is isolated by tenant ID:

### Database
```
/app/server/data/tenants/{tenantId}/kanban.db
```

### Attachments
```
/app/server/attachments/tenants/{tenantId}/{filename}
```

### Avatars
```
/app/server/avatars/tenants/{tenantId}/{filename}
```

## Access URLs

### Primary Access
```
https://{tenantId}.ezkan.cloud
```

### Direct NodePort Access (for testing)
```
http://{nodeIp}:{nodePort}
```

**Get NodePort:**
```bash
kubectl get service easy-kanban-nodeport -n easy-kanban \
  -o jsonpath='{.spec.ports[?(@.name=="frontend")].nodePort}'
```

## Tenant ID Extraction

The application extracts the tenant ID from the hostname:

**Pattern:** `{tenantId}.ezkan.cloud`

**Examples:**
- `app.ezkan.cloud` → tenant ID: `app`
- `customer1.ezkan.cloud` → tenant ID: `customer1`
- `my-company.ezkan.cloud` → tenant ID: `my-company`

**Validation:**
- Must be lowercase alphanumeric with hyphens
- Must start and end with alphanumeric characters
- Regex: `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`

## Complete Tenant Creation Workflow

### 1. Create Tenant Record (Admin Portal Database)
```javascript
// Store tenant information in your admin portal database
const tenant = {
  id: 'customer1',
  name: 'Customer One',
  plan: 'pro',
  instanceToken: 'generated-token-here',
  createdAt: new Date(),
  status: 'active'
};
```

### 2. Create Ingress Rule
```javascript
// Create Kubernetes ingress for tenant
await createTenantIngress(tenant.id);
```

### 3. Trigger Database Initialization (Optional)
```javascript
// Make a request to trigger database creation
// This is optional - database will be created on first user access
await fetch(`https://${tenant.id}.ezkan.cloud/health`, {
  headers: {
    'Host': `${tenant.id}.ezkan.cloud`
  }
});
```

### 4. Set License Limits
```javascript
// Set license limits based on plan
await setTenantLicenseLimits(tenant.id, tenant.plan, tenant.instanceToken);
```

### 5. Verify Deployment
```javascript
// Check if tenant is accessible
const response = await fetch(`https://${tenant.id}.ezkan.cloud/health`);
if (response.ok) {
  console.log(`✅ Tenant ${tenant.id} is ready!`);
}
```

## Tenant Management

### List All Tenants
```bash
# List all ingress rules (each represents a tenant)
kubectl get ingress -n easy-kanban -l app=easy-kanban

# Extract tenant IDs from ingress names
kubectl get ingress -n easy-kanban -l app=easy-kanban \
  -o jsonpath='{.items[*].metadata.name}' | \
  sed 's/easy-kanban-ingress-//g'
```

### Delete Tenant
```bash
# Delete ingress rule (removes access)
kubectl delete ingress easy-kanban-ingress-{tenantId} -n easy-kanban

# Optionally delete tenant database and storage
# (Database: /app/server/data/tenants/{tenantId}/)
# (Attachments: /app/server/attachments/tenants/{tenantId}/)
# (Avatars: /app/server/avatars/tenants/{tenantId}/)
```

### Update Tenant License
```javascript
// Upgrade/downgrade tenant plan
await updateTenantPlan(tenantId, newPlan, instanceToken);
```

## Important Notes

### Shared Resources
- **DO NOT** delete shared resources (app pod, Redis, services, ConfigMap)
- These are used by ALL tenants
- Only delete tenant-specific ingress rules

### Database Initialization
- Databases are created **lazily** on first request
- No need to pre-create tenant databases
- Each tenant gets their own SQLite database file

### License Limits
- Stored in each tenant's database (`license_settings` table)
- Can be updated at any time via admin portal API
- Falls back to environment variables if not set in database

### Storage
- All tenants share the same NFS volume
- Data is isolated by tenant ID in directory structure
- Storage limits are enforced per-tenant based on `STORAGE_LIMIT` setting

### DNS Configuration
- Ensure DNS is configured for `*.ezkan.cloud` to point to your Kubernetes ingress controller
- Wildcard DNS: `*.ezkan.cloud` → Ingress Controller IP

## Troubleshooting

### Tenant Not Accessible
1. Check ingress exists: `kubectl get ingress easy-kanban-ingress-{tenantId} -n easy-kanban`
2. Check DNS resolution: `nslookup {tenantId}.ezkan.cloud`
3. Check ingress controller logs
4. Verify shared app pod is running: `kubectl get pods -n easy-kanban -l app=easy-kanban`

### License Limits Not Working
1. Verify database exists: Check `/app/server/data/tenants/{tenantId}/kanban.db`
2. Check license settings: Query `license_settings` table in tenant database
3. Verify `LICENSE_ENABLED=true` in ConfigMap
4. Check admin portal API calls are using correct `tenantId`

### Database Not Created
- Database is created on first request to the tenant URL
- Make a request to `https://{tenantId}.ezkan.cloud/health` to trigger creation
- Check application logs for database initialization errors

## Example: Complete Tenant Creation Function

```javascript
async function createTenant(tenantId, plan, instanceToken) {
  // 1. Create ingress rule
  await createTenantIngress(tenantId);
  
  // 2. Wait for ingress to be ready
  await waitForIngress(tenantId);
  
  // 3. Trigger database initialization
  await fetch(`https://${tenantId}.ezkan.cloud/health`);
  
  // 4. Set license limits
  const limits = getPlanLimits(plan);
  for (const [key, value] of Object.entries(limits)) {
    await fetch(`https://${tenantId}.ezkan.cloud/api/admin-portal/plan/${key}?tenantId=${tenantId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${instanceToken}`,
        'X-Tenant-ID': tenantId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value: value.toString() })
    });
  }
  
  // 5. Verify tenant is ready
  const healthCheck = await fetch(`https://${tenantId}.ezkan.cloud/health`);
  if (healthCheck.ok) {
    return {
      success: true,
      tenantId,
      url: `https://${tenantId}.ezkan.cloud`
    };
  }
  
  throw new Error('Tenant creation failed');
}

function getPlanLimits(plan) {
  return plan === 'basic' ? {
    USER_LIMIT: 5,
    TASK_LIMIT: 100,
    BOARD_LIMIT: 10,
    STORAGE_LIMIT: 1073741824, // 1GB
    SUPPORT_TYPE: 'basic'
  } : {
    USER_LIMIT: 50,
    TASK_LIMIT: -1, // unlimited
    BOARD_LIMIT: -1, // unlimited
    STORAGE_LIMIT: 10737418240, // 10GB
    SUPPORT_TYPE: 'pro'
  };
}
```

## Summary

- **First deployment**: Sets up shared infrastructure (one-time)
- **Tenant creation**: Create ingress rule + set license limits via API
- **Database**: Created automatically on first request
- **Storage**: Shared NFS volume with tenant-isolated paths
- **License limits**: Stored per-tenant in database, managed via admin portal API


