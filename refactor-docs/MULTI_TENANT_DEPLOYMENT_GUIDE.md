# Multi-Tenant Deployment Guide (PostgreSQL)

> **Canonical ops guide for SaaS / K8s multi-tenant.**  
> Easy Kanban is **PostgreSQL-only**. Per-tenant SQLite files (`kanban.db`) and the old `deploy-instance.sh` / `deploy.sh` scripts are **retired**.

## Overview

A single shared application Deployment serves all tenants. Each tenant has:

| Shared | Per tenant |
|--------|------------|
| Namespace `easy-kanban-pg` | Ingress host `{tenantId}.ezkan.cloud` |
| App pods (`easy-kanban`) | PostgreSQL schema `tenant_{tenantId}` |
| PostgreSQL (`easykanban` DB) | NFS dirs for attachments / avatars |
| Redis (Socket.IO adapter) | License / settings rows in that schema |
| ConfigMap / Services | Instance token (generated / preserved by deploy) |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Kubernetes Namespace: easy-kanban-pg (shared)         │
│                                                         │
│  App Deployment (N replicas) ← hostname → tenant schema │
│  PostgreSQL: DB easykanban, schemas tenant_<id>         │
│  Redis: Socket.IO cross-pod adapter (required)          │
│  Ingress: easy-kanban-ingress-{tenantId}                │
└─────────────────────────────────────────────────────────┘
         NFS (often in namespace easy-kanban)
         attachments/tenants/{id}/  avatars/tenants/{id}/
```

Realtime path (do not confuse with Redis pub/sub):

1. API mutates tenant schema → `notificationService.publish()`  
2. **PostgreSQL `NOTIFY`** → every pod `LISTEN`s  
3. Each pod `io.to('tenant-…').emit(…)`  
4. **Redis Socket.IO adapter** fans rooms across pods  

See [`docs/REALTIME_UPDATE_FLOW-MULTI-TENANCY.md`](../docs/REALTIME_UPDATE_FLOW-MULTI-TENANCY.md).

## Deploy a tenant

```bash
# From repo root — two arguments only (token is auto-generated / reused)
./k8s/deploy-instance-pg.sh <instance_name> <plan>

# Examples
./k8s/deploy-instance-pg.sh my-company basic
./k8s/deploy-instance-pg.sh enterprise pro
```

This wraps `k8s/deploy-pg.sh` and prints JSON suitable for the admin portal (`INSTANCE_TOKEN`, hostname, storage paths, etc.).

**Do not use:**

- `./k8s/deploy-instance.sh` — retired  
- `./k8s/deploy.sh` — retired  

## Destroy a tenant

```bash
./k8s/destroy-instance-pg.sh <instance_name>
```

Removes:

- Ingress `easy-kanban-ingress-{instance_name}` in `easy-kanban-pg`
- Schema `tenant_{instance_name}` in PostgreSQL
- Tenant attachment/avatar directories on NFS (NFS server may live in namespace `easy-kanban`)

Does **not** tear down the shared app Deployment, Redis, or Postgres for other tenants.

**Do not use** legacy `destroy-instance.sh` for PG tenants (it targets the old SQLite layout and will not drop schemas).

## Remove shared PG stack (ops only)

Use `k8s/remove-instance-pg.sh` only when intentionally removing shared infrastructure — not for routine tenant offboarding.

## Environment (shared ConfigMap)

Typical keys in `k8s/configmap-pg.yaml` / app env:

- `MULTI_TENANT=true`
- `TENANT_DOMAIN=ezkan.cloud` (hostname → tenant id)
- `DB_TYPE=postgresql` / `POSTGRES_*` pointing at in-cluster Postgres
- `REDIS_URL` for the Socket.IO adapter

See also [`TENANT_DOMAIN_EXPLANATION.md`](./TENANT_DOMAIN_EXPLANATION.md).

## Single-tenant Docker (not this guide)

Self-hosted free/dev/example compose uses **one Postgres database**, usually the **`public`** schema, with `MULTI_TENANT=false`. No per-tenant ingress or schemas. AI runner is included in free/example/dev compose; enable AI in Admin → App Settings.
