# Legacy SQLite Kubernetes stack

Archived after cutting over to PostgreSQL (`easy-kanban-pg`) and retiring the
SQLite app Deployments in namespace `easy-kanban` (NFS server kept there).

Do not use these for new tenants. Current path: `k8s/deploy-pg.sh` /
`k8s/deploy-instance-pg.sh` and `*-pg.yaml` manifests.

`k8s/ingress.yaml` remains in `k8s/` because `deploy-pg.sh` still templates
per-tenant HTTP ingress from it.
