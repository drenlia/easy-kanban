# TENANT_DOMAIN Configuration

## What is TENANT_DOMAIN?

`TENANT_DOMAIN` is an environment variable used to extract the tenant ID from the hostname in multi-tenant mode.

## How It Works

### Hostname Pattern Matching

The tenant routing middleware uses `TENANT_DOMAIN` to identify which tenant a request belongs to:

```
Hostname: {tenantId}.{TENANT_DOMAIN}
Example:  customer1.ezkan.cloud
          └─ tenantId: customer1
          └─ TENANT_DOMAIN: ezkan.cloud
```

### Code Logic

```javascript
// server/middleware/tenantRouting.js
const extractTenantId = (hostname) => {
  const domain = process.env.TENANT_DOMAIN || 'ezkan.cloud';
  
  if (hostname.endsWith(`.${domain}`)) {
    const parts = hostname.split('.');
    const tenantId = parts[0];  // Extract subdomain
    return tenantId;
  }
  
  return null;  // Single-tenant mode
};
```

## Configuration

### Where to Set It

**Kubernetes (ConfigMap)**:
```yaml
# k8s/configmap.yaml
TENANT_DOMAIN: "ezkan.cloud"
```

**Docker Compose**:
```yaml
# docker-compose.yml
environment:
  - TENANT_DOMAIN=ezkan.cloud
```

### Default Value

If not set, defaults to `ezkan.cloud` in the code.

## Does It Need to Be Set in the Database?

**NO** - `TENANT_DOMAIN` does NOT need to be set per-tenant in the database.

### Why?

1. **Global Configuration**: Same domain for all tenants
2. **Infrastructure Setting**: Part of deployment configuration, not tenant data
3. **Application-Level**: Used by routing middleware, not stored in tenant databases

### Admin Portal Considerations

The admin portal should:
- ✅ **Set it globally** in ConfigMap/environment (once for all pods)
- ✅ **Match ingress configuration** (same domain used for subdomains)
- ❌ **NOT set it per-tenant** in tenant databases
- ❌ **NOT store it** in tenant settings

## Examples

### Example 1: Standard Setup

```yaml
# ConfigMap
TENANT_DOMAIN: "ezkan.cloud"

# Ingress creates:
customer1.ezkan.cloud  → tenant ID: customer1
customer2.ezkan.cloud  → tenant ID: customer2
customer3.ezkan.cloud  → tenant ID: customer3
```

### Example 2: Custom Domain

```yaml
# ConfigMap
TENANT_DOMAIN: "mycompany.com"

# Ingress creates:
acme.mycompany.com     → tenant ID: acme
contoso.mycompany.com  → tenant ID: contoso
```

### Example 3: Single-Tenant (Docker)

```yaml
# docker-compose.yml
MULTI_TENANT: "false"
TENANT_DOMAIN: "ezkan.cloud"  # Ignored when MULTI_TENANT=false
```

In single-tenant mode, `TENANT_DOMAIN` is ignored because:
- No hostname-based routing needed
- Single database at `/app/server/data/kanban.db`
- All requests use the same database

## Important Notes

1. **Must Match Ingress**: `TENANT_DOMAIN` must match the domain used in your Kubernetes ingress configuration
2. **Global Setting**: Set once for all pods, not per-tenant
3. **Not in Database**: Don't store this in tenant databases
4. **Backward Compatible**: Defaults to `ezkan.cloud` if not set

## Troubleshooting

### Tenant Not Found

If tenant routing isn't working:
1. Check `TENANT_DOMAIN` matches your ingress domain
2. Verify hostname format: `{tenantId}.{TENANT_DOMAIN}`
3. Check `MULTI_TENANT=true` is set
4. Verify ingress is routing correctly

### Example Debug

```bash
# Check environment variable
kubectl exec -n easy-kanban <pod> -- env | grep TENANT_DOMAIN

# Check hostname extraction
# Request to: customer1.ezkan.cloud
# Should extract: customer1
```

