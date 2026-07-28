# Destroy Instance Script Review (PostgreSQL)

> **Use `k8s/destroy-instance-pg.sh` for current multi-tenant tenants.**  
> Legacy `destroy-instance.sh` targeted the old SQLite-on-NFS layout and **does not drop PostgreSQL schemas**.

## Canonical script

```bash
./k8s/destroy-instance-pg.sh <instance_name>
```

### What it removes

| Resource | Detail |
|----------|--------|
| Ingress | `easy-kanban-ingress-{instance_name}` in namespace **`easy-kanban-pg`** |
| Database | Schema **`tenant_{instance_name}`** in DB `easykanban` |
| Files | Tenant attachment / avatar dirs on NFS (often under `/data/nfs-server/…/tenants/{instance_name}/`; NFS server may run in namespace **`easy-kanban`**) |

### What it does **not** remove

- Shared Deployment `easy-kanban`
- Shared Redis / Postgres pods
- Other tenants’ schemas or ingresses

## Shared vs per-tenant

In multi-tenant PG mode, instances share:

- Namespace `easy-kanban-pg`
- App Deployment and Services
- One Postgres database (schemas isolate tenants)
- NFS volumes for binary files

Each instance only owns its ingress, schema, and NFS subdirectories.

## Why not the old script?

`destroy-instance.sh` assumed:

- Namespace `easy-kanban`
- Deleting `…/data/tenants/{id}/kanban.db`

That leaves live `tenant_*` data in Postgres if used against the PG stack. Prefer `destroy-instance-pg.sh` and confirm schema drop in the Postgres pod logs / `\dn` if debugging.

## Related

- Deploy: `./k8s/deploy-instance-pg.sh <name> <plan>`
- Guide: [`MULTI_TENANT_DEPLOYMENT_GUIDE.md`](./MULTI_TENANT_DEPLOYMENT_GUIDE.md)
