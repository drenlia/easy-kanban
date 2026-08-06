# Docru rebrand & domain hard cutover

Operator runbook for migrating from **Easy Kanban** / `ezkan.cloud` to **Docru** / `docru.app`.

This document describes:

1. What was already changed in the application repo (code + Docker).
2. Docker cutover steps you can run locally.
3. What the **on-machine Kubernetes agent** must still do under `k8s/` and on the cluster (**`k8s/` was intentionally left unchanged** in the rebrand PR).

Hard cutover: after DNS flip, `*.ezkan.cloud` should stop serving the app. There is no dual-domain support in application code.

---

## Decisions

| Topic | Choice |
|-------|--------|
| Product name | **Docru** (display / seeds / i18n / docs). Internal names (`easy-kanban` images, crypto salts, `ek_media`, localStorage keys) unchanged. |
| Domain | **`docru.app`** via `TENANT_DOMAIN` (default in code if unset). |
| `SITE_NAME` | Rows exactly equal to `Easy Kanban` → `Docru`. Custom site names left alone. |
| Existing `SMTP_*` | **Not** rewritten by the cutover script — fix in Admin → Mail. |
| New managed SMTP seeds | Env: `MANAGED_SMTP_HOST`, `MANAGED_SMTP_USERNAME`, `MANAGED_SMTP_FROM_EMAIL`, `MANAGED_SMTP_FROM_NAME`, `MANAGED_SMTP_PASSWORD` (fallbacks derived from `TENANT_DOMAIN`). |
| Favicon | Still `public/kanban.ico` until a Docru asset is supplied. |

---

## What already changed in the repo

### Application

- Shared helper: [`server/utils/tenantDomain.js`](../server/utils/tenantDomain.js) — `getTenantDomain()`, `getManagedSmtpSeedDefaults()`.
- Call sites use the helper instead of hardcoded `ezkan.cloud`: tenant routing, CSP, Socket.IO CORS, password-reset / invite / admin-portal URL builders.
- DB seeds ([`server/config/database.js`](../server/config/database.js)): `SITE_NAME` / `SMTP_FROM_NAME` → `Docru`; `WEBSITE_URL` / `ADMIN_PORTAL_URL` from `TENANT_DOMAIN`; managed SMTP from env.
- UI: `index.html` title, Header / email fallbacks, maintenance page, Admin mail noreply display fallback, owner-setup “custom identity” check vs `Docru`.
- i18n EN/FR product strings → Docru.
- [`README.md`](../README.md) / [`DOCKER.md`](../DOCKER.md) product naming → Docru.

### Docker / env (not `k8s/`)

- All `docker-compose*.yml`: `TENANT_DOMAIN=docru.app`; `admin.docru.app` where admin portal URLs appeared; licensed compose files pass through `MANAGED_SMTP_*`.
- [`.env.example`](../.env.example): documents `TENANT_DOMAIN`, portal URL, `MANAGED_SMTP_*`.

### Cutover script

- [`scripts/rebrand-domain-cutover.js`](../scripts/rebrand-domain-cutover.js)  
  - Updates `public` and every `tenant_*` schema that has `settings`.  
  - `SITE_NAME` exact match; host rewrite on `APP_URL`, `GOOGLE_CALLBACK_URL`, `WEBSITE_URL`, `ADMIN_PORTAL_URL`.  
  - **Skips all `SMTP_*`.**

```bash
# Dry run
POSTGRES_HOST=localhost POSTGRES_PORT=5432 POSTGRES_DB=kanban \
  POSTGRES_USER=kanban_user POSTGRES_PASSWORD=… \
  node scripts/rebrand-domain-cutover.js --dry-run

# Apply
node scripts/rebrand-domain-cutover.js
```

Optional: `OLD_DOMAIN=ezkan.cloud` `NEW_DOMAIN=docru.app` (defaults).

---

## Docker instance cutover

1. Backup Postgres volume / `pg_dump`.
2. Note Google OAuth redirect URIs for the current public origin.
3. Deploy image that includes this rebrand; set compose / `.env`:
   - `TENANT_DOMAIN=docru.app`
   - `ALLOWED_ORIGINS` → new public host(s) only (no `ezkan.cloud`)
   - `MANAGED_SMTP_*` if this instance seeds managed mail for new DBs
4. Point edge DNS/TLS at the same upstream under the new hostname; prepare to retire `ezkan.cloud`.
5. Run `scripts/rebrand-domain-cutover.js` against the instance DB (dry-run first).
6. Update Google Cloud Console callbacks to the new origin; remove old URIs after smoke.
7. Restart app; smoke: login, media (`ek_media` is host-only — users refresh session on new host), WebSocket, invite/reset links.
8. Fix SMTP in Admin if needed; retire old hostname in DNS/proxy.

---

## Kubernetes — for the on-machine agent

**Do not assume these files were updated.** Edit and apply them on the ops host.

### A. Repo file edits under `k8s/`

Replace `ezkan.cloud` with `docru.app` (and product strings where user-facing) in at least:

| File | What to change |
|------|----------------|
| [`k8s/configmap.yaml`](../k8s/configmap.yaml) | `TENANT_DOMAIN`, `ALLOWED_ORIGINS`, `ADMIN_SERVICE_URL`, comments mentioning `*.ezkan.cloud` |
| [`k8s/configmap-pg.yaml`](../k8s/configmap-pg.yaml) | Same + `app-pg.…` origins |
| [`k8s/app-deployment.yaml`](../k8s/app-deployment.yaml) | Probe `Host:` `app.ezkan.cloud` → `app.docru.app` (or actual probe host) |
| [`k8s/app-deployment-pg.yaml`](../k8s/app-deployment-pg.yaml) | Probe `Host:` `app-pg.ezkan.cloud` → new host |
| [`k8s/ingress-websocket.yaml`](../k8s/ingress-websocket.yaml) | Every `*.ezkan.cloud` host → `*.docru.app` |
| [`k8s/deploy-pg.sh`](../k8s/deploy-pg.sh) | `DOMAIN="ezkan.cloud"` → `DOMAIN="${TENANT_DOMAIN:-docru.app}"`; example URLs / echo text |
| [`k8s/deploy-instance-pg.sh`](../k8s/deploy-instance-pg.sh) | Example hostname in usage text |
| [`k8s/deploy-instance.sh`](../k8s/deploy-instance.sh) | Same (legacy path if still used) |
| [`k8s/remove-instance.sh`](../k8s/remove-instance.sh) / [`remove-instance-pg.sh`](../k8s/remove-instance-pg.sh) | `DOMAIN="ezkan.cloud"` |
| [`k8s/verify-tenant-routing-pg.sh`](../k8s/verify-tenant-routing-pg.sh) | Default `TENANT_DOMAIN` / comments |
| [`k8s/migrate-tenant-to-pg.sh`](../k8s/migrate-tenant-to-pg.sh) | Default domain + final visit URL |
| [`k8s/setup-nfs.sh`](../k8s/setup-nfs.sh) | Example `TENANT_DOMAIN` in echo |
| [`k8s/reference-docs/*`](../k8s/reference-docs/) | Docs still saying `ezkan.cloud` / Easy Kanban (optional cleanup) |

Also add ConfigMap entries for managed SMTP if SaaS seeds new tenants:

```yaml
MANAGED_SMTP_HOST: "smtp.docru.app"
MANAGED_SMTP_USERNAME: "noreply@docru.app"
MANAGED_SMTP_FROM_EMAIL: "noreply@docru.app"
MANAGED_SMTP_FROM_NAME: "Docru"
# MANAGED_SMTP_PASSWORD via Secret, not plain ConfigMap, if used
```

Quick inventory on the machine:

```bash
rg -n 'ezkan\.cloud' k8s/
```

### B. Cluster cutover checklist

1. DNS/certs for `*.docru.app` and `admin.docru.app` ready; plan to stop answering on `ezkan.cloud`.
2. Inventory tenant settings (rollback):

   ```sql
   -- example: list APP_URL / SITE_NAME per tenant schema
   SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%';
   ```

3. Google OAuth: add `https://{tenant}.docru.app/api/auth/google/callback` for each tenant before flip; remove old after.
4. Deploy Docru image; apply updated ConfigMaps / deployments / ingresses so hosts are `{id}.docru.app`.
5. Rollout pods with `TENANT_DOMAIN=docru.app`.
6. Run cutover script against the cluster DB (port-forward or `kubectl exec` into Postgres), e.g.:

   ```bash
   # After port-forward to Postgres:
   POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=5432 \
     POSTGRES_DB=easykanban POSTGRES_USER=kanban POSTGRES_PASSWORD=… \
     node scripts/rebrand-domain-cutover.js --dry-run
   node scripts/rebrand-domain-cutover.js
   ```

   Adjust DB name/user to match [`k8s/postgres-secret-pg.yaml`](../k8s/postgres-secret-pg.yaml) / live secrets.

7. Flip DNS so `*.ezkan.cloud` no longer serves the app.
8. Smoke sample tenants: Host → correct schema, SSO, email links, Socket.IO, media.
9. New deploys only create `*.docru.app` ingresses.
10. Per-tenant SMTP still on old hosts: Admin → Mail (script does not touch `SMTP_*`).

### C. Rollback (cluster)

1. Revert ingress hosts + ConfigMap `TENANT_DOMAIN` + DNS to `ezkan.cloud`.
2. Inverse host rewrite from inventory (`OLD_DOMAIN=docru.app` `NEW_DOMAIN=ezkan.cloud` with a careful one-off, or restore from backup).
3. Reverse `SITE_NAME` only where inventory showed the old default.
4. App image can remain Docru-branded; routing/DNS is the critical axis.

---

## Env reference

| Variable | Role |
|----------|------|
| `TENANT_DOMAIN` | Base domain for `{tenantId}.{domain}` routing, CSP, Socket.IO, URL fallbacks. Default in code: `docru.app`. |
| `ALLOWED_ORIGINS` | Extra Socket.IO / Vite origins (comma-separated). |
| `ADMIN_SERVICE_URL` | Set in compose/ConfigMaps historically; runtime portal link uses DB `ADMIN_PORTAL_URL`. |
| `MANAGED_SMTP_HOST` / `_USERNAME` / `_FROM_EMAIL` / `_FROM_NAME` / `_PASSWORD` | Seeds for **new** licensed tenants only. |
| `MULTI_TENANT` | `true` in K8s SaaS; `false` for typical Docker. |

---

## Out of scope (intentionally)

- Renaming Docker images, K8s namespaces, DB name `easykanban`, crypto salts, localStorage prefixes, `ek_media`
- Dual-domain acceptance in `extractTenantId`
- Migrating existing tenant `SMTP_*` rows
- Replacing favicon until a Docru asset is provided
