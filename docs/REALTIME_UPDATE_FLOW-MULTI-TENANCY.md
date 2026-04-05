# Real-Time Updates: Multi-Tenant PostgreSQL on Kubernetes

This document describes **only** the production-relevant path: **PostgreSQL** as the app database, **`DB_TYPE=postgresql`**, **`MULTI_TENANT=true`**, and the app running as **multiple replicas** in Kubernetes (e.g. `easy-kanban-pg` namespace). It replaces the single-process mental model in `REALTIME_UPDATE_FLOW.md` for operators and implementers working on this stack.

For a concrete UI example (member display name), see `REALTIME_UPDATE_FLOW.md`. Here we focus on **architecture, K8s behavior, failure modes, and hardening**.

---

## 1. Scope (current state)

| Layer | Role |
|--------|------|
| **Kubernetes** | N replicas of the same `easy-kanban` Deployment behind a Service; Ingress terminates TLS and routes HTTP/WebSocket. |
| **PostgreSQL** | Shared cluster database (`easykanban`); each tenant has schema `tenant_<tenantId>`. Application data and `pg_notify` run in this database. |
| **Redis** | **Required** for Socket.IO in this mode: `@socket.io/redis-adapter` so `io.to(room)` works **across pods**. |
| **NOTIFY** | `notificationService.publish()` uses **PostgreSQL `LISTEN` / `NOTIFY`** (not Redis pub/sub) for the database-to-app signal. |

SQLite, single-tenant Docker, and “Redis-only” notification paths are **out of scope** here.

---

## 2. End-to-end flow (one logical event)

### 2.1 Tenant resolution

- Browser hits `https://<tenantId>.<domain>/...`.
- Ingress must preserve the **public hostname** (`Host` / `X-Forwarded-Host`) so middleware can resolve `tenantId` and set `search_path` to `"tenant_<tenantId>"` for queries.

### 2.2 Mutation + publish

1. An API handler changes data in the tenant schema (e.g. `members`, `tasks`).
2. After commit, it calls `notificationService.publish(channel, payload, tenantId)`.
3. With `DB_TYPE=postgresql`, **`postgresNotificationService.publish`** runs `SELECT pg_notify($1, $2)` on a channel name derived from tenant + channel (non-alphanumeric characters escaped for SQL identifiers). Payload is JSON; **PostgreSQL limits `NOTIFY` payload size (~8000 bytes)** — large payloads may be truncated or replaced with a minimal “refetch” hint (see `server/services/postgresNotificationService.js`).

### 2.3 Every app pod receives NOTIFY

- **Each replica** holds a **dedicated `LISTEN` client** (separate from the query pool).
- PostgreSQL delivers **one notification per listening session**. With **three pods**, **three sessions** receive the **same** `NOTIFY`.

### 2.4 Socket.IO broadcast

- Each pod registers callbacks in `websocketService.setupPostgresSubscriptions()` (e.g. `member-updated`, `task-updated`).
- On NOTIFY, a pod runs something equivalent to:
  - `io.to(\`tenant-${tenantId}\`).emit('<event>', data)` (multi-tenant), not a global `io.emit`.
- Because **`MULTI_TENANT=true`**, the server configures the **Redis adapter**. Each `emit` is **federated** to all nodes so clients in that room receive the event regardless of which pod they are connected to.

### 2.5 Browser

- The client uses Socket.IO (often with HTTP long-polling fallback before upgrade).
- **Ingress** should use **session affinity** (sticky cookie or equivalent) for `/socket.io/` where applicable so upgrades and polling stay consistent.
- React hooks (e.g. `useMemberWebSocket`, `useTaskWebSocket`) apply payloads to local state.

**Corrected high-level diagram:**

```
API Pod (any) → COMMIT in tenant schema
       → pg_notify(tenant_<id>_<channel>, json)
              ↓
    ┌─────────┴─────────┬─────────────┐
    ▼                   ▼             ▼
 Pod A LISTEN      Pod B LISTEN   Pod C LISTEN
    │                   │             │
    └─────────┬─────────┴─────────────┘
              ▼
  Each pod: io.to(`tenant-<id>`).emit(event, data)
              ↓
       Redis adapter (cross-pod fan-out)
              ↓
    Clients in tenant room (one connection each)
```

---

## 3. Kubernetes-specific issues

### 3.1 Duplicate Socket.IO deliveries (architectural)

Because **every pod** both **LISTENs** and **emits**, a single logical `NOTIFY` can cause **N emits** (one per replica). The Redis adapter propagates each emit cluster-wide, so clients may observe **duplicate** `task-updated` / `member-updated` / etc. events. Whether that breaks UX depends on **idempotent** state updates in React; non-idempotent handlers can flicker or mis-count.

**Mitigation in this codebase:** `notificationService.publish()` adds a fresh `_rtId` (UUID) to **plain-object** payloads before they reach NOTIFY / Redis. In multi-tenant mode it also sets **`_notifyTenantId`** (from the publish argument) so pods route Socket.IO emits with the correct tenant **without** parsing the NOTIFY channel name (hyphenated tenant ids break naive `tenant-([^-]+)-` extraction). `_notifyTenantId` is removed before the payload is emitted to browsers. The client strips `_rtId` and **drops duplicate** `(eventName, _rtId)` pairs for ~45s (`src/utils/realtimeDedupe.ts`, wired in `websocketClient.ts`). Non-object payloads are unchanged (no dedupe). Oversized NOTIFY payloads still carry `_rtId` / `_notifyTenantId` when the message is shrunk to fit PostgreSQL limits. See section 5.3 for alternative architectures if you need stronger guarantees.

### 3.2 Redis availability

If Redis is down or misconfigured, Socket.IO may fall back to **in-memory** adapter per pod: **rooms no longer span replicas** — users on different pods see inconsistent realtime. Treat Redis as **tier-1** for this deployment.

### 3.3 LISTEN client on a single pod

If the dedicated `LISTEN` connection drops (network, Postgres restart, pod crash), that pod stops translating NOTIFY → Socket.IO until reconnect logic runs (see `postgresNotificationService.js`). Other pods may still emit; **users stuck on the unhealthy pod** can miss events until reconnect or they refresh.

### 3.4 Rollouts and connections

During rolling updates, pods terminate; **WebSockets disconnect**. Clients should reconnect; **brief gaps** or duplicate connects are normal. Combine with **readiness probes**, **`preStop` delay**, and **`maxUnavailable: 0`** style rollouts to reduce traffic to terminating pods (see `k8s/app-deployment-pg.yaml` and `DEBUGGING.md`).

### 3.5 Static assets vs API version skew

Separate from NOTIFY: if HTML/JS chunks come from **different image versions** across replicas (e.g. `:latest` pull skew), browsers can hit **failed dynamic imports**. Use **immutable image tags** per release, not only realtime fixes.

### 3.6 PostgreSQL connection budget

Each replica: query pool(s) **plus** one **LISTEN** connection **plus** Socket.IO Redis clients. Scaling replicas increases **total** DB connections; align with **`max_connections`** and PgBouncer (if introduced).

### 3.7 Payload and ordering claims

- **Payload:** stay under NOTIFY size limits or publish **IDs only** and let clients refetch.
- **Ordering:** NOTIFY ordering is meaningful **per channel/session**; with many writers and multiple consumers, **global total order** across all tenants and pods is **not** a guarantee for the whole system.

---

## 4. What Redis does *not* do here

- **Application events are not fan-out via Redis pub/sub** in the PostgreSQL configuration; **NOTIFY** carries the signal from DB to app.
- Redis is still **mandatory** for **Socket.IO horizontal scaling** in multi-tenant K8s as implemented today.

---

## 5. Steps toward a more robust realtime setup

Order is roughly **operational first**, then **architectural** if duplicates or scale bite.

### 5.1 Operations and platform (low code change)

1. **Run Redis for HA** appropriate to your SLO (e.g. managed Redis, Sentinel, or Redis Cluster) — single-node Redis is a single failure domain for **all** Socket.IO rooms.
2. **Ingress:** confirm **sticky sessions** and **timeouts** for `/socket.io/` (and any outer reverse proxy) match Socket.IO heartbeat and idle behavior.
3. **Rollouts:** keep **readiness** tied to `/ready`, use **`preStop` sleep** and **`terminationGracePeriodSeconds`** so endpoints drain before SIGTERM; prefer **`maxUnavailable: 0`** when you need continuous capacity during deploys.
4. **Images:** deploy **immutable tags** (build SHA) to avoid mixed JS across replicas.
5. **Observability:** log NOTIFY publish errors, LISTEN reconnects, Redis adapter failures; alert on Redis down and on sustained LISTEN disconnects.

### 5.2 Database and notifications

6. **Keep payloads small** — prefer `{ id, type, version }` and refetch heavy rows over the API when NOTIFY fires.
7. **Tune `max_connections`** and app pool sizes as replica count grows; consider **PgBouncer** in transaction mode **only** if compatible with your LISTEN strategy (LISTEN must stay on a **dedicated**, non-pooled session — as today).

### 5.3 Eliminate duplicate emits (code / design — higher effort)

**Implemented:** **A (client deduplication)** via `_rtId` on object payloads and `prepareRealtimeSocketArgs` in the Socket.IO client (duplicates still traverse the network; handlers see each logical event once).

Further patterns if you outgrow that:

| Approach | Idea | Tradeoff |
|----------|------|----------|
| **B. Single emitter** | Only one pod (or a sidecar) LISTENs and emits; others do not register PG callbacks. | Operational complexity or **SPOF** unless that component is HA with leader election. |
| **C. Redis as sole cluster bus** | After DB commit, publish **once** to Redis pub/sub (or a stream); all pods subscribe **once** and a single logical emit path runs (or use Socket.IO patterns that avoid N-fold emit). | Redesign; duplicates easier to reason about; NOTIFY optional for “DB-triggered only” paths. |
| **D. External realtime service** | Move WebSocket fan-out to a dedicated service (managed or self-hosted) fed by outbox / queue. | Largest change; best for very high scale or strict ordering needs. |

Today’s code path matches **“every pod LISTEN + every pod emit”** plus **client-side dedupe**; **B/C/D** remain options if you need fewer bytes on the wire or different delivery semantics.

### 5.4 Optional: durability and audit

8. **Transactional outbox** table: write event row in same transaction as domain change; separate worker reads outbox and publishes — improves **at-least-once** story and decouples API latency from NOTIFY size (advanced).

---

## 6. Source files (reference)

| Concern | Location |
|---------|-----------|
| Route → publish | Various `server/routes/*.js` |
| NOTIFY vs Redis routing | `server/services/notificationService.js` |
| `pg_notify`, LISTEN, payload limits | `server/services/postgresNotificationService.js` |
| Per-channel → `io.to(tenant-…).emit` | `server/services/websocketService.js` (`setupPostgresSubscriptions`) |
| Redis adapter gate | `server/services/websocketService.js` (`MULTI_TENANT` / `USE_REDIS_ADAPTER`) |
| Tenant hostname | `server/middleware/tenantRouting.js` |
| Frontend socket + hooks | `src/services/websocketClient.ts`, `src/utils/realtimeDedupe.ts`, `src/hooks/use*WebSocket.ts` |
| Deploy / rollout notes | `k8s/app-deployment-pg.yaml`, `DEBUGGING.md` |

---

## 7. Related doc

- **`REALTIME_UPDATE_FLOW.md`** — linear walkthrough (e.g. member name) useful for onboarding; it does **not** describe multi-pod Redis adapter behavior or duplicate NOTIFY delivery. Use **this** file when reasoning about **Kubernetes + PostgreSQL multi-tenancy**.
