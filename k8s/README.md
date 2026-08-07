# Kubernetes (SaaS / multi-tenant)

Live product stack: namespace **`easy-kanban-pg`** (shared app, Postgres, Redis).  
Namespace **`easy-kanban`** currently hosts **`nfs-server` only** (attachments/avatars mounts + internal registry export). The SQLite app stack was removed.

Tenant hostnames are `{tenantId}.{TENANT_DOMAIN}` (default **`agila.dev`**).

## Day-to-day (tenants)

| Action | Command |
|--------|---------|
| Deploy / update tenant | `./k8s/deploy-instance-pg.sh <instance_name> <basic\|pro>` |
| Destroy tenant (schema + ingress + NFS dirs) | `./k8s/destroy-instance-pg.sh <instance_name>` |
| Remove ingress only (keep data) | `./k8s/remove-instance-pg.sh <instance_name>` |
| Verify DNS → ingress → service | `./k8s/verify-tenant-routing-pg.sh <instance_name>` |

Canonical guide: [`refactor-docs/MULTI_TENANT_DEPLOYMENT_GUIDE.md`](../refactor-docs/MULTI_TENANT_DEPLOYMENT_GUIDE.md).

Shared ConfigMap template: [`configmap-pg.yaml.example`](./configmap-pg.yaml.example) (copy to gitignored `configmap-pg.yaml`).  
Crypto / S3 secrets: `settings-crypto-secret-pg.yaml.example`, `managed-s3-secret-pg.yaml.example`.

## Images & rollout

| Action | Command |
|--------|---------|
| Build & push app image | `./k8s/build-and-push-to-registry-app.sh` |
| Build & push agent runner | `./k8s/build-and-push-to-registry-runner.sh` |

App Deployment: [`app-deployment-pg.yaml`](./app-deployment-pg.yaml).

## Cluster setup (infrequent)

Scripts stay next to manifests under `k8s/` (e.g. `setup-nfs.sh`, `setup-registry.sh`, `setup-ingress-controller.sh`, `add-worker-node.sh`). Details:

| Topic | Doc |
|-------|-----|
| NFS for shared mounts | [`reference-docs/NFS_SETUP.md`](./reference-docs/NFS_SETUP.md), [`NFS_MULTI_NODE_EXPLANATION.md`](./reference-docs/NFS_MULTI_NODE_EXPLANATION.md) |
| NFS + registry | [`reference-docs/NFS_REGISTRY_EXPLANATION.md`](./reference-docs/NFS_REGISTRY_EXPLANATION.md) |
| Internal registry | [`reference-docs/REGISTRY_SETUP.md`](./reference-docs/REGISTRY_SETUP.md), [`REGISTRY_STORAGE_INFO.md`](./reference-docs/REGISTRY_STORAGE_INFO.md) |
| Build / push / nodes | [`reference-docs/IMAGE_DISTRIBUTION_GUIDE.md`](./reference-docs/IMAGE_DISTRIBUTION_GUIDE.md), [`DEPLOYMENT_WORKFLOW.md`](./reference-docs/DEPLOYMENT_WORKFLOW.md), [`README-IMAGE-IMPORT.md`](./reference-docs/README-IMAGE-IMPORT.md) |
| Ingress body size | [`reference-docs/INGRESS_CONTROLLER_SETUP.md`](./reference-docs/INGRESS_CONTROLLER_SETUP.md) |
| Scheduling / workers | [`reference-docs/POD_SCHEDULING_GUIDE.md`](./reference-docs/POD_SCHEDULING_GUIDE.md), [`ADD_WORKER_NODE.md`](./reference-docs/ADD_WORKER_NODE.md) |

## Domain / realtime / storage

| Topic | Doc |
|-------|-----|
| Agila domain cut-over | [`docs/REBRAND.md`](../docs/REBRAND.md) |
| Hostname → tenant id | [`refactor-docs/TENANT_DOMAIN_EXPLANATION.md`](../refactor-docs/TENANT_DOMAIN_EXPLANATION.md) |
| WebSocket sticky + Redis adapter | [`docs/SOCKET_IO_STICKY_SESSIONS.md`](../docs/SOCKET_IO_STICKY_SESSIONS.md) |
| Multi-pod realtime (PG NOTIFY) | [`docs/REALTIME_UPDATE_FLOW-MULTI-TENANCY.md`](../docs/REALTIME_UPDATE_FLOW-MULTI-TENANCY.md) |
| Attachments / S3 | [`refactor-docs/STORAGE_SYSTEM.md`](../refactor-docs/STORAGE_SYSTEM.md) |

## Legacy (do not use for new tenants)

| Location | Contents |
|----------|----------|
| [`old/sqlite/`](./old/sqlite/) | Retired SQLite deploy/destroy scripts and manifests |
| [`reference-docs/archive/`](./reference-docs/archive/) | SQLite-era checklists and version notes |

`ingress.yaml` remains here as the HTTP ingress **template** used by `deploy-pg.sh` (sed’d per tenant). Do not confuse with archived `old/sqlite/ingress-websocket.yaml`.
