# Easy Kanban — Security Hardening Guide

**Date:** August 2026 · **App:** 0.9-beta  
**Purpose:** Prioritized checklist to raise security posture toward production.  
**Overall:** Needs Work · **Internet-facing risk:** High (reduced after Sprint A low-impact fixes)

**Status legend:** ✅ Implemented · ⬜ Open · 🔶 Design first

---

## How to use this

1. Pick a **target** (e.g. Docker single-tenant vs K8s multi-tenant) — some P2 items matter more for SaaS.
2. Work **P0 → P1 → P2** in order. Do not skip remaining P0 for “real” use beyond a trusted network.
3. Each item has: **where**, **do this**, **done when**, **UX risk**, **status**.
4. Prefer the **safe approach** notes where UX risk is medium/high.

---

## Strengths (keep these)

- Schema-per-tenant + `req.locals.db`; sqlManager / parameterized SQL
- Email queue: `FOR UPDATE SKIP LOCKED`; JWT required at boot; settings AES-GCM
- Rate limits on login / reset / activation; path hardening on file serve
- DOMPurify on most rich-text paths; Docker + K8s dual deploy; AGENTS.md / debug flags

---

## P0 — Blockers (do first)

### C1 — Auth on member create/delete · ⬜ Open

| | |
|--|--|
| **Where** | `server/routes/members.js` POST/DELETE; mount `server/index.js` |
| **Do** | Add `authenticateToken` + admin (or drop public mutators) |
| **Done when** | Unauthenticated POST/DELETE → 401; invite/user-create still creates members |
| **UX risk** | Low–medium — verify user-create still creates member rows [^C1] |

### C2 — Lock down `/api/debug` · ✅ Implemented

| | |
|--|--|
| **Where** | `server/routes/debug.js` |
| **Do** | Admin auth on all debug routes |
| **Done when** | Unauthenticated GET/POST `/api/debug/*` → 401 |
| **UX risk** | None [^C2] |
| **Shipped** | `authenticateToken` + `requireRole(['admin'])` on router |

### C3 — Gate `demo-credentials` · ⬜ Open

| | |
|--|--|
| **Where** | `server/routes/auth.js` `GET /demo-credentials` |
| **Do** | 404 unless `DEMO_ENABLED=true` (optionally single-tenant only) |
| **Done when** | Non-demo → 404; demo compose with `DEMO_ENABLED=true` still fills login |
| **UX risk** | Medium if demo flag missing [^C3] |

### C4 — Stop logging reset tokens · ✅ Implemented

| | |
|--|--|
| **Where** | `server/routes/password-reset.js` |
| **Do** | Never log full reset URL / token |
| **Done when** | Grep logs: no reset URLs/tokens on request |
| **UX risk** | None [^C4] |
| **Shipped** | Logs user id only; `resetUrl` not printed |

### H1 — JWT checks `is_active` + fresh roles · ✅ Implemented

| | |
|--|--|
| **Where** | `server/middleware/auth.js` |
| **Do** | Load `is_active` + roles from DB; reject inactive; refresh role from DB |
| **Done when** | Deactivated user → 401; demoted admin loses admin without waiting 24h |
| **UX risk** | Low — intended privilege drop [^H1] |
| **Shipped** | Active check + DB roles on JWT and PAT; `requireRole` also checks `roles[]` |

### H2 — Sanitize comment tooltips · ✅ Implemented

| | |
|--|--|
| **Where** | `TaskCard.tsx`; `ListView.tsx` comment tooltips |
| **Do** | `DOMPurify.sanitize` before `innerHTML` / `dangerouslySetInnerHTML` |
| **Done when** | Script in comment HTML does not run in card/list tooltips |
| **UX risk** | Low [^H2] |
| **Shipped** | Sanitize after blob-URL fix, before DOM parse (same pattern as descriptions) |

### H3 — Bind comment author server-side · ⬜ Open

| | |
|--|--|
| **Where** | `server/routes/comments.js` |
| **Do** | Resolve author from `req.user` → member; admin may edit/delete any; ignore/override client `authorId`; keep agent path separate |
| **Done when** | Forged `authorId` ignored; non-author non-admin cannot update/delete; agent + normal comments work |
| **UX risk** | Medium — must mirror FE `canModifyComment` [^H3] |

---

## P1 — Production hardening

### H4 — OAuth `state` + rate limits · ⬜ Open

| | |
|--|--|
| **Where** | `server/routes/auth.js` Google flow |
| **Do** | Signed `state` on start; validate on callback; rate-limit OAuth; keep `#login?token=…` unless FE updated together |
| **Done when** | Bad/missing state fails; happy path Google login works |
| **UX risk** | Low if state persisted correctly [^H4] |

### H5 — Dependency hygiene · ⬜ Open

| | |
|--|--|
| **Where** | `package.json` / lockfile |
| **Do** | `npm audit fix`; axios ≥1.15.2; plan `xlsx` replace/isolate; CI audit gate |
| **Done when** | Actionable critical/high CVEs cleared or accepted; export + API + WS smoke-tested |
| **UX risk** | Mixed — especially `xlsx` / TipTap / socket.io [^H5] |

### I1 — Admin portal token compare + real rate limit · ✅ Implemented

| | |
|--|--|
| **Where** | `server/middleware/adminAuth.js`; `rateLimiters.js` `adminPortalLimiter` |
| **Do** | `timingSafeEqual`; never log token material; real limiter |
| **Done when** | Failed auth logs have no token prefixes; limiter rejects floods |
| **UX risk** | None for compare; tune limits for provisioning [^I1] |
| **Shipped** | Timing-safe compare; no token prefix logs; `adminPortalLimiter` (120/15m); secret not attached to `req` |
| **Note** | Still in-memory per pod (Redis store remains I8) |

### I2 — Stop logging JWT secret prefix · ✅ Implemented

| | |
|--|--|
| **Where** | `server/middleware/auth.js` boot log |
| **Do** | Remove secret substring from logs |
| **Done when** | Boot logs show no JWT secret material |
| **UX risk** | None [^I2] |
| **Shipped** | Boot log confirms secret configured without printing it |

### I7 — Tenant registry for background jobs · ⬜ Open

| | |
|--|--|
| **Where** | `tenantRouting.js` `getAllTenantDatabases()`; throttler / cron |
| **Do** | Iterate known tenants from a registry, not only per-pod `dbCache` |
| **Done when** | New tenant gets email/cron on all pods without prior HTTP hit on each |
| **UX risk** | None / positive [^I7] |

### I8 — Cluster-wide rate limits · ⬜ Open

| | |
|--|--|
| **Where** | `server/middleware/rateLimiters.js` |
| **Do** | Redis store when `MULTI_TENANT` |
| **Done when** | Limits enforced across replicas |
| **UX risk** | Low — limits feel stricter [^I8] |

### I9 — Minimal CI · ⬜ Open

| | |
|--|--|
| **Where** | `.github/workflows` (new) |
| **Do** | lint + build + `npm audit` (+ smoke when available) |
| **Done when** | PRs fail on lint/build/audit regressions |
| **UX risk** | None [^I9] |

---

## P2 — Design before shipping (higher UX risk)

### I3 — Remove JWT from file query strings · 🔶 Design first

| | |
|--|--|
| **Where** | `files.js`, `upload.js`, `authImageUrl.ts` + consumers |
| **Do** | Short-lived signed URLs **or** cookie auth — FE+BE together |
| **Done when** | No long-lived JWT in `?token=`; media still loads |
| **UX risk** | **High** [^I3] |

### I4 — CSP + Socket.IO origin allowlist · 🔶 Design first

| | |
|--|--|
| **Where** | `server/index.js`; `websocketService.js` |
| **Do** | CSP Report-Only first; restrict Socket.IO origins |
| **Done when** | No unexpected CSP violations; WS works for all tenants |
| **UX risk** | **Highest** among mediums [^I4] |

### I5 — Harden upload MIME allowlist · ⬜ Open

| | |
|--|--|
| **Where** | `fileValidation.js`; `multer.js` avatar filter |
| **Do** | Block or sandbox SVG/HTML/JS; magic-byte checks |
| **Done when** | Scriptable types rejected or served safely; PNG/JPEG OK |
| **UX risk** | Medium [^I5] |

### I6 — Wire request validation · ⬜ Open

| | |
|--|--|
| **Where** | schemas → server routes |
| **Do** | Validate per-route against live shapes |
| **Done when** | Malformed → 400; happy paths pass |
| **UX risk** | Medium if too strict [^I6] |

### I10 — Graceful shutdown · ⬜ Open

| | |
|--|--|
| **Where** | `server/index.js` SIGTERM |
| **Do** | `server.close()`; disconnect PG NOTIFY; drain |
| **Done when** | Rolling deploy finishes in-flight requests within grace |
| **UX risk** | None in steady state [^I10] |

---

## P3 — Later / product-dependent

- Per-board ACL (only if private boards are required)
- Split god files (`tasks.js`, `websocketService`, `database.js`)
- sqlManager for email/throttler SQL; structured logging / APM
- Server-side HTML sanitize on write (defense in depth after H2)

---

## Suggested ticket order

**Sprint A — low-impact (done)**
- [x] C2 debug auth  
- [x] C4 + I2 stop secret/token logging  
- [x] I1 admin portal timing-safe + rate limit  
- [x] H1 JWT active + roles  
- [x] H2 tooltip DOMPurify  

**Sprint A — remaining P0**
- [ ] C1 members auth  
- [ ] C3 demo-credentials gate  
- [ ] H3 comment author binding  

**Sprint B — P1**
- [ ] H4 OAuth state  
- [ ] H5 deps (axios first; `xlsx` as separate spike)  
- [ ] I7 tenant registry  
- [ ] I8 Redis rate limits (multi-tenant)  
- [ ] I9 CI workflow  

**Sprint C — P2 (design spikes first)**
- [ ] Spike: I3 file URL auth  
- [ ] Spike: I4 CSP report-only + WS origins  
- [ ] I5 uploads; I6 validation; I10 shutdown  

---

## Out of scope for this guide

Ops runbooks, backups/restore drills, secrets rotation, monitoring/alerts, SLA, compliance — pair separately for full production readiness.

---

## Footnotes

[^C1]: Confirm invite/user-create still creates members after auth is required.
[^C2]: No end-user surface.
[^C3]: Keep `DEMO_ENABLED=true` in demo compose so `Login.tsx` polling works.
[^C4]: Logging only.
[^H1]: Immediate access/privilege drop for deactivated/demoted users (intended).
[^H2]: Same DOMPurify approach as card descriptions / TaskDetails.
[^H3]: `req.user` → member; admin override; agent comments unchanged.
[^H4]: Persist `state`; keep fragment token unless FE changes with it.
[^H5]: Retest API, Excel export, TipTap links, Socket.IO.
[^I1]: In-memory limiter per pod until I8; tune for provisioning.
[^I2]: Logging only.
[^I3]: Update all `authImageUrl` consumers; plan TTL/refresh.
[^I4]: Report-Only CSP first; allowlist every tenant hostname for Socket.IO.
[^I5]: SVG/HTML may need exception or attachment-only serving.
[^I6]: Validate against real traffic shapes per route.
[^I7]: Reliability only.
[^I8]: Cluster-wide limits are stricter than per-pod.
[^I9]: CI only.
[^I10]: Deploy drain only.
