# Debugging the platform

This document describes **tenant-level debug flags** stored in the database (`settings` table). Values are strings: `"true"` or `"false"`. All flags default to **`false`** for new databases (`server/config/database.js`) and are backfilled by migrations **12** and **13** for existing tenants.

Use these flags for **interactive troubleshooting**. They are not a substitute for production observability (metrics, APM, structured logging).

---

## How flags reach the browser (frontend)

**`FE_DEBUG_*` keys** are included in the **public** response of `GET /api/settings` (along with site name, mail status, OAuth client id, etc.). No login is required to *read* them, which lets the SPA load flag state early.

After settings load, `src/contexts/SettingsContext.tsx` calls `syncClientDebugFromSettings()` (`src/utils/clientDebug.ts`). Components and hooks gate logs with:

```ts
import { feDebug } from './utils/clientDebug';

if (feDebug('FE_DEBUG_AUTH')) {
  console.log('…');
}
```

Until settings are fetched, frontend flags behave as **off** (no entry in the in-memory map).

**Drag-and-drop** uses `src/utils/dndDebug.ts` (`dndLog`), which checks `FE_DEBUG_DND`.

---

## How to enable or disable flags

### 1. Admin UI / API (typical)

1. Sign in as a user with the **admin** role.
2. Open **Settings** (admin settings) in the product UI, or call the authenticated admin API:
   - `GET /api/admin/settings` — list all settings (includes every `FE_DEBUG_*` and `SERVER_DEBUG_*` key).
   - `PUT /api/admin/settings` — body: `{ "key": "FE_DEBUG_AUTH", "value": "true" }` (string value).

`SERVER_DEBUG_*` keys are **only** visible to admins via `/api/admin/settings`; they are **not** returned on public `GET /api/settings`.

### 2. Admin portal (multi-tenant / instance token)

If you use the external admin portal with `INSTANCE_TOKEN`, settings can be updated via the portal routes under `/api/admin-portal/` (see `server/routes/adminPortal.js`).

### 3. Database (direct)

For a given tenant database, update or insert the row in `settings`:

```sql
-- PostgreSQL example (schema may be tenant_xxx in multi-tenant mode)
UPDATE settings SET value = 'true' WHERE key = 'FE_DEBUG_WEBSOCKET';
```

Use the same pattern for SQLite (`settings` table). Prefer the admin API when possible so Redis/WebSocket broadcasts stay consistent.

### 4. After changing `SERVER_DEBUG_SQL`

The server caches whether SQL debug is enabled for about **15 seconds** (`server/utils/sqlDebugSettingsCache.js`) to avoid reading settings on every query. The cache is **cleared** when `SERVER_DEBUG_SQL` is updated through the normal settings APIs (`server/routes/settings.js`, `server/routes/adminPortal.js`).

---

## Frontend debug flags (`FE_DEBUG_*`)

| Key | Where it applies | What you get |
|-----|------------------|--------------|
| `FE_DEBUG_AUTH` | `src/api.ts`, `src/services/websocketClient.ts`, `src/App.tsx` | JWT / token lifecycle, invalid token handling, WebSocket auth errors, forced logout when account is gone. |
| `FE_DEBUG_WEBSOCKET` | `src/services/websocketClient.ts`, `src/hooks/useTaskWebSocket.ts`, `src/hooks/useColumnWebSocket.ts` | Verbose Socket.IO / realtime client logging; column reorder skip messages. |
| `FE_DEBUG_APP_CORE` | `src/App.tsx` | Initial load, board selection, refresh skips, WebSocket fallbacks, task copy / offline safety, owner `APP_URL` checks. |
| `FE_DEBUG_TASK_LINKING` | `src/App.tsx` | Task linking overlay flow and related `useEffect` / handler traces. |
| `FE_DEBUG_REPORTS_UI` | `src/components/Reports.tsx`, `src/components/layout/Header.tsx` | Reports settings from context, WebSocket-driven reports enable/disable and redirects. |
| `FE_DEBUG_FLOWCHART` | `src/components/TaskFlowChart.tsx` | Flow chart component console traces. |
| `FE_DEBUG_TASK_CARD` | `src/components/TaskCard.tsx` | Task card–scoped logs (via local helper). |
| `FE_DEBUG_TASK_PAGE` | `src/components/TaskPage.tsx` | Full task page–scoped logs (via local helper). |
| `FE_DEBUG_TASK_DETAILS` | `src/components/TaskDetails.tsx` | Task details panel–scoped logs (via local helper). |
| `FE_DEBUG_SETTINGS_CONTEXT` | `src/contexts/SettingsContext.tsx` | Admin check, fetch deduplication, public vs authenticated settings fetch, token/storage events, WebSocket settings updates. |
| `FE_DEBUG_API` | `src/api.ts` | Axios request/response traces: method, URL, params, short body summary, redacted `Authorization`, status, duration (ms). |
| `FE_DEBUG_DND` | `src/utils/dndDebug.ts`, `SimpleDragDropManager`, `taskReorderingUtils`, `App.tsx` | Drag end handling, cross-board moves, `handleMoveTaskToColumn`, reorder/cross-column moves, renumber-after-copy. |

**Authoritative list** (keep docs in sync with code): `server/constants/debugSettings.js` → `FE_PUBLIC_DEBUG_FLAG_KEYS`, and `src/constants/clientDebugKeys.ts` → `FE_CLIENT_DEBUG_KEYS`.

---

## Server debug flags (`SERVER_DEBUG_*`)

These are read with `await serverDebug(db, 'SERVER_DEBUG_…')` (`server/utils/serverDebug.js`) and affect **Node.js stdout** only.

| Key | Where it applies | What you get |
|-----|------------------|--------------|
| `SERVER_DEBUG_SETTINGS` | `server/routes/settings.js` | Verbose logs when updating settings (e.g. OAuth cache invalidation, Redis `settings-updated` publish payload). |
| `SERVER_DEBUG_HTTP` | `server/routes/settings.js` (`PUT /api/settings/app-url`) | Step-by-step logs for the owner `APP_URL` update flow (user, owner check, validation). |
| `SERVER_DEBUG_SQL` | `server/utils/queryLogger.js` | Per-query lines for every `wrapQuery` execution: truncated SQL, param summary, duration, errors. Prefix: `[SERVER_DEBUG_SQL]`. Setting is read via a **cached** path (≈15s TTL) that bypasses `wrapQuery` to avoid recursion (`server/utils/sqlDebugSettingsCache.js`). |

**Note:** Many routes still use ordinary `console.log` / timing lines (for example task batch endpoints in `server/routes/tasks.js`) that are **not** gated by these flags. Treat those as separate from this settings-based debug system.

---

## Stale frontend after deploy (`Failed to fetch dynamically imported module`)

If the browser loads an **old** `index.html` (cached) but the server only has **new** hashed chunks under `/assets/`, lazy-loaded routes fail with:

`TypeError: Failed to fetch dynamically imported module: …/assets/SomeChunk-xxxxx.js`

The app’s `lazyWithRetry` helper may retry and then force a reload; a **hard refresh** (or clearing site data) also fixes it for one session.

**Prevention:** The production server must **not** apply long-lived cache headers to the HTML shell. Only paths under `/assets/` (content-hashed filenames) should use long cache. If you terminate TLS or cache in **nginx / Ingress / CDN**, ensure `index.html` and `/` are **not** cached aggressively (or bypass cache for those paths).

**Kubernetes rolling restart with `image: …:latest` and `imagePullPolicy: Always`:** While old pods are still running, new pods may pull a **new** digest for `:latest`. The Service load-balances across both — the browser can get `index-*.js` from one build and a lazy chunk from another pod where that filename does not exist → same `Failed to fetch dynamically imported module` loop until the rollout finishes (or forever if something keeps skewing pulls). Prefer an **immutable tag per release** (e.g. git SHA) in the Deployment, or scale to one replica during cutover, or use a `Recreate` deploy strategy if brief downtime is acceptable.

---

## Practical tips

- **Production:** Leave all debug flags `false` unless you are actively investigating an issue; turn them off afterward.
- **Narrow the blast radius:** Enable only the **one** `FE_DEBUG_*` area that matches the bug (e.g. `FE_DEBUG_DND` for drag, `FE_DEBUG_WEBSOCKET` for stale boards).
- **`SERVER_DEBUG_SQL`:** Extremely noisy; enable briefly, reproduce, then disable.
- **`FE_DEBUG_API`:** Logs summaries of request/response bodies. Do not treat it as safe for highly sensitive data in shared logs; `Authorization` is redacted but payloads may still be sensitive.
- **Multi-tenant:** Each tenant has its own `settings` row set; flags are **per tenant**, not global.

---

## Source files (quick reference)

| Area | File(s) |
|------|---------|
| Flag definitions & defaults | `server/constants/debugSettings.js` |
| Migrations for defaults | `server/migrations/index.js` (versions 12–13) |
| Public settings keys | `server/routes/settings.js` (`FE_PUBLIC_DEBUG_FLAG_KEYS` spread into `GET /` when not admin mount) |
| Frontend sync & helpers | `src/utils/clientDebug.ts`, `src/constants/clientDebugKeys.ts` |
| DnD helper | `src/utils/dndDebug.ts` |
| Server flag reader | `server/utils/serverDebug.js` |
| SQL debug cache | `server/utils/sqlDebugSettingsCache.js` |
| Query wrapper logging | `server/utils/queryLogger.js` |
