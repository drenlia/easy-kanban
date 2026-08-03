# Easy Kanban — Security Hardening Guide

**Date:** August 2026 · **App:** 0.9-beta  
**Purpose:** Prioritized checklist to raise security posture toward production.  
**Overall:** Needs Work · **Internet-facing risk:** High  

---

## How to use this

1. Pick a **target** (e.g. Docker single-tenant vs K8s multi-tenant) — some P2 items matter more for SaaS.
2. Work **P0 → P1 → P2** in order. Do not skip P0 for “real” use beyond a trusted network.
3. Each item has: **where**, **do this**, **done when**, **UX risk**.
4. Prefer the **safe approach** notes where UX risk is medium/high.

---

## Strengths (keep these)

- Schema-per-tenant + `req.locals.db`; sqlManager / parameterized SQL
- Email queue: `FOR UPDATE SKIP LOCKED`; JWT required at boot; settings AES-GCM
- Rate limits on login / reset / activation; path hardening on file serve
- DOMPurify on most rich-text paths; Docker + K8s dual deploy; AGENTS.md / debug flags

---

## P0 — Blockers (do first)

### C1 — Auth on member create/delete

| | |
|--|--|
| **Where** | `server/routes/members.js` POST/DELETE; mount `server/index.js` |
| **Do** | Add `authenticateToken` + admin (or drop public mutators) |
| **Done when** | Unauthenticated POST/DELETE → 401; invite/user-create still creates members |
| **UX risk** | Low–medium — verify user-create still creates member rows [^C1] |

### C2 — Lock down `/api/debug`

| | |
|--|--|
| **Where** | `server/routes/debug.js`; `server/index.js` mount |
| **Do** | Admin auth, or remove in production |
| **Done when** | Unauthenticated GET/POST `/api/debug/*` → 401/404 |
| **UX risk** | None [^C2] |

### C3 — Gate `demo-credentials`

| | |
|--|--|
| **Where** | `server/routes/auth.js` `GET /demo-credentials` |
| **Do** | 404 unless `DEMO_ENABLED=true` (optionally single-tenant only) |
| **Done when** | Non-demo → 404; demo compose with `DEMO_ENABLED=true` still fills login |
| **UX risk** | Medium if demo flag missing [^C3] |

### C4 — Stop logging reset tokens

| | |
|--|--|
| **Where** | `server/routes/password-reset.js` |
| **Do** | Log token id / email hash only — never full reset URL |
| **Done when** | Grep logs: no reset URLs/tokens on request |
| **UX risk** | None [^C4] |

### H1 — JWT checks `is_active` + fresh roles

| | |
|--|--|
| **Where** | `server/middleware/auth.js` `authenticateToken`, `requireRole` |
| **Do** | Load `is_active` + roles from DB; reject inactive; don’t trust stale JWT `role` alone |
| **Done when** | Deactivated user → 401 on next API call; demoted admin loses admin routes without waiting 24h |
| **UX risk** | Low — intended privilege drop [^H1] |

### H2 — Sanitize comment tooltips

| | |
|--|--|
| **Where** | `TaskCard.tsx` ~2938; `ListView.tsx` comment tooltips |
| **Do** | `DOMPurify.sanitize` with same config as `TaskDetails` |
| **Done when** | Script in comment HTML does not run in card/list tooltips; formatting still OK |
| **UX risk** | Low if allowlist matches `TaskDetails` [^H2] |

### H3 — Bind comment author server-side

| | |
|--|--|
| **Where** | `server/routes/comments.js` |
| **Do** | Resolve author from `req.user` → member; admin may edit/delete any; ignore/override client `authorId`; keep agent path (`AGENT_MEMBER_ID`) separate |
| **Done when** | Forged `authorId` ignored; non-author non-admin cannot update/delete; agent comments still work; normal user comments still work |
| **UX risk** | Medium — must mirror FE `canModifyComment` [^H3] |

---

## P1 — Production hardening

### H4 — OAuth `state` + rate limits

| | |
|--|--|
| **Where** | `server/routes/auth.js` Google flow |
| **Do** | Signed `state` on start; validate on callback; rate-limit OAuth endpoints; keep `#login?token=…` unless FE updated together |
| **Done when** | Callback with bad/missing state fails; happy path Google login still works |
| **UX risk** | Low if state persisted correctly; don’t over-rate-limit [^H4] |

### H5 — Dependency hygiene

| | |
|--|--|
| **Where** | `package.json` / lockfile |
| **Do** | `npm audit fix`; axios ≥1.15.2; plan `xlsx` replace/isolate (don’t blind `--force`); CI audit gate |
| **Done when** | Critical/high actionable CVEs cleared or explicitly accepted; Excel export + API + WS smoke-tested |
| **UX risk** | Mixed — especially `xlsx` / TipTap / socket.io [^H5] |

### I1 — Admin portal token compare + real rate limit

| | |
|--|--|
| **Where** | `server/middleware/adminAuth.js` |
| **Do** | `crypto.timingSafeEqual`; never log token material; real limiter (Redis in multi-tenant) |
| **Done when** | Failed auth logs have no token prefixes; limiter rejects floods |
| **UX risk** | None for compare; tune limits for provisioning [^I1] |

### I2 — Stop logging JWT secret prefix

| | |
|--|--|
| **Where** | `server/middleware/auth.js` boot log |
| **Do** | Remove secret substring from logs |
| **Done when** | Boot logs show no JWT secret material |
| **UX risk** | None [^I2] |

### I7 — Tenant registry for background jobs

| | |
|--|--|
| **Where** | `tenantRouting.js` `getAllTenantDatabases()`; notification throttler / cron |
| **Do** | Iterate known tenants from a registry, not only per-pod `dbCache` |
| **Done when** | New tenant gets email/cron on all pods without needing a prior HTTP hit on each |
| **UX risk** | None / positive [^I7] |

### I8 — Cluster-wide rate limits

| | |
|--|--|
| **Where** | `server/middleware/rateLimiters.js` |
| **Do** | Redis store when `MULTI_TENANT` |
| **Done when** | Limits enforced across replicas (not ×N pods) |
| **UX risk** | Low — limits feel stricter; keep login/reset usable [^I8] |

### I9 — Minimal CI

| | |
|--|--|
| **Where** | `.github/workflows` (new) |
| **Do** | lint + build + `npm audit` (+ smoke tests when available) |
| **Done when** | PRs fail on lint/build/audit regressions |
| **UX risk** | None [^I9] |

---

## P2 — Design before shipping (higher UX risk)

### I3 — Remove JWT from file query strings

| | |
|--|--|
| **Where** | `files.js`, `upload.js`, `src/utils/authImageUrl.ts` + consumers |
| **Do** | Short-lived signed URLs **or** cookie auth for media — FE+BE together |
| **Done when** | No long-lived JWT in `?token=`; avatars/attachments/rich-text images still load |
| **UX risk** | **High** — expired URLs break images; not a server-only patch [^I3] |

### I4 — CSP + Socket.IO origin allowlist

| | |
|--|--|
| **Where** | `server/index.js` headers; `websocketService.js` |
| **Do** | CSP **Report-Only** first; then enforce. Restrict Socket.IO origins to known tenant hosts |
| **Done when** | Report-Only shows no unexpected violations; WS works for all tenants after allowlist |
| **UX risk** | **Highest** among mediums — TipTap, OAuth, WS can break [^I4] |

### I5 — Harden upload MIME allowlist

| | |
|--|--|
| **Where** | `fileValidation.js`; avatar filter in `multer.js` |
| **Do** | Block or sandbox SVG/HTML/JS; magic-byte checks; harden avatars |
| **Done when** | Scriptable types rejected or served safely; PNG/JPEG uploads still work |
| **UX risk** | Medium — SVG logos/avatars may need an exception or download-only [^I5] |

### I6 — Wire request validation

| | |
|--|--|
| **Where** | `src/validation/schemas.ts` → server routes |
| **Do** | Validate per-route against **live** shapes (not unused schemas blindly) |
| **Done when** | Malformed bodies → 400; existing happy paths still pass |
| **UX risk** | Medium if schemas are too strict [^I6] |

### I10 — Graceful shutdown

| | |
|--|--|
| **Where** | `server/index.js` SIGTERM |
| **Do** | `server.close()`; disconnect PG NOTIFY; drain before exit |
| **Done when** | Rolling deploy: in-flight requests finish within grace period |
| **UX risk** | None in steady state [^I10] |

---

## P3 — Later / product-dependent

- Per-board ACL (only if private boards are required)
- Split god files (`tasks.js`, `websocketService`, `database.js`) — maintainability, not a security gate
- sqlManager for email/throttler SQL; structured logging / APM
- Server-side HTML sanitize on write (defense in depth after H2)

---

## Suggested ticket order (copy/paste)

**Sprint A — P0**
- [ ] C1 members auth  
- [ ] C2 debug auth/remove  
- [ ] C3 demo-credentials gate  
- [ ] C4 + I2 stop secret/token logging  
- [ ] H1 JWT active + roles  
- [ ] H2 tooltip DOMPurify  
- [ ] H3 comment author binding  

**Sprint B — P1**
- [ ] H4 OAuth state  
- [ ] I1 admin portal token hardening  
- [ ] H5 deps (axios first; `xlsx` as separate spike)  
- [ ] I7 tenant registry  
- [ ] I8 Redis rate limits (multi-tenant)  
- [ ] I9 CI workflow  

**Sprint C — P2 (design spikes first)**
- [ ] Spike: I3 file URL auth  
- [ ] Spike: I4 CSP report-only + WS origins  
- [ ] I5 uploads; I6 validation; I10 shutdown  

---

## Out of scope for this guide (add separately if needed)

Ops runbooks, backups/restore drills, secrets rotation, monitoring/alerts, SLA, compliance — not covered here; pair with this checklist for full production readiness.

---

## Footnotes

[^C1]: Confirm invite/user-create still creates members after auth is required.
[^C2]: No end-user surface.
[^C3]: Keep `DEMO_ENABLED=true` in demo compose so `Login.tsx` polling works.
[^C4]: Logging only.
[^H1]: Immediate access/privilege drop for deactivated/demoted users (intended).
[^H2]: Same DOMPurify config as `TaskDetails`.
[^H3]: `req.user` → member; admin override; agent comments unchanged.
[^H4]: Persist `state`; keep fragment token unless FE changes with it.
[^H5]: Retest API, Excel export, TipTap links, Socket.IO.
[^I1]: Tune admin-portal rate limits for provisioning.
[^I2]: Logging only.
[^I3]: Update all `authImageUrl` consumers; plan TTL/refresh.
[^I4]: Report-Only CSP first; allowlist every tenant hostname for Socket.IO.
[^I5]: SVG/HTML may need exception or attachment-only serving.
[^I6]: Validate against real traffic shapes per route.
[^I7]: Reliability only.
[^I8]: Cluster-wide limits are stricter than per-pod.
[^I9]: CI only.
[^I10]: Deploy drain only.
