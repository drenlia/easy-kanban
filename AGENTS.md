# AGENTS.md

## Core Principles
- Prioritize security, maintainability, and least-privilege by default.
- Never ship code that violates these rules unless explicitly instructed otherwise.

## Documentation Policy
- **DO NOT create new .md documentation files** unless explicitly requested by the user
- **ESPECIALLY for QA/testing work**: Do NOT create README files, CHANGES files, or summary documents
- Update existing documentation when making changes to related code
- Use code comments for explaining implementation details
- Reserve documentation files for:
  - Major architectural decisions (when requested)
  - Setup/configuration guides (when requested)
  - API reference documentation (when requested)
- Exception: README.md updates are acceptable for significant feature additions

## Package Management (npm)
- Always choose secure, actively maintained packages.
- Packages currently used in this project:
  - **Backend**: `express`, `better-sqlite3`, `pg`, `redis`, `socket.io`, `bcrypt`, `jsonwebtoken`, `multer`, `nodemailer`, `node-cron`, `express-rate-limit`, `cors`, `axios`, `zod`
  - **Frontend**: `react`, `react-dom`, `react-i18next`, `i18next`, `i18next-browser-languagedetector`, `@tiptap/*` (rich text editor), `@dnd-kit/*` (drag-and-drop), `lucide-react`, `react-joyride`, `react-window`, `recharts`, `xlsx`, `dompurify`, `socket.io-client`
  - **Real-time**: `socket.io`, `socket.io-client`, `@socket.io/redis-adapter`, `redis`
  - **Build/Dev**: `vite`, `typescript`, `tailwindcss`, `eslint`, `concurrently`
- Avoid packages with known vulnerabilities, >1 year without updates, or <1k weekly downloads unless there is a very specific reason.
- Use exact versions or caret ranges (^) for dependencies; versions are pinned via package-lock.json for reproducible builds.

## API Routes & Endpoints
- EVERY route must be authenticated by default using `authenticateToken` middleware.
- Only make a route public if it is explicitly listed as public:
  - **Authentication**: `/api/auth/login`, `/api/auth/activate-account`, `/api/auth/google/*`, `/api/auth/demo-credentials`, `/api/auth/check-*`
  - **Password Reset**: `/api/password-reset/request`, `/api/password-reset/reset`, `/api/password-reset/verify/:token`
  - **Health Checks**: `/health`, `/ready`, `/api/ready`, `/api/version`
  - **Public Settings**: `/api/settings` (GET only, for site name, mail status, OAuth config)
  - **Admin Portal**: `/api/admin-portal/*` (uses `INSTANCE_TOKEN` auth, not user JWT)
- Use existing auth middleware from `server/middleware/auth.js`:
  - `authenticateToken` - JWT token validation (required for all protected routes)
  - `requireRole(['admin'])` - Role-based access control for admin-only endpoints
- Apply rate limiting for sensitive public endpoints (see `server/middleware/rateLimiters.js`):
  - `loginLimiter` for login attempts
  - `passwordResetRequestLimiter` (3/hour) and `passwordResetCompletionLimiter` (6/hour)
  - `registrationLimiter` and `activationLimiter` for account creation
- Use sqlManager queries from `server/utils/sqlManager/index.js` (never write raw SQL in routes)
- Handle multi-tenant database access via `getRequestDatabase(req)` from `server/middleware/tenantRouting.js`
- Never expose error stack traces to clients (log errors server-side only)

## General Best Practices
- Backend is JavaScript (ES modules), frontend is TypeScript + React
- Follow existing patterns:
  - Routes: `server/routes/*.js` (Express.js router pattern)
  - Database queries: `server/utils/sqlManager/*.js` (abstracted SQL with dual SQLite/PostgreSQL support)
  - Auth flow: `server/middleware/auth.js` (JWT with 24h expiration)
  - **Real-time (WebSockets / cross-pod)**: `server/services/notificationService.js` — `publish()` / `subscribe()` only; uses Redis or PostgreSQL `LISTEN/NOTIFY` when `DB_TYPE=postgresql`. **Not for SMTP.**
  - **Outbound email (SMTP)**: `server/services/emailService.js` — Nodemailer, tenant `settings` (`MAIL_ENABLED`, `SMTP_*`). Used for test email, password reset, user invitations, admin portal invites. Do not send mail through `notificationService`.
- Use database transactions for multi-step operations (see `server/utils/dbAsync.js`)
- Publish real-time events via `notificationService.publish()` for WebSocket updates
- Support both single-tenant (Docker) and multi-tenant (Kubernetes) modes
- Run migrations via `server/migrations/index.js` for schema changes

## Task activity email notifications (queue) — implementation notes

When restoring **task/comment email** notifications (throttled queue in `notification_queue`, processed by `notificationThrottler.js`, sent via `EmailService`), design for **multi-tenant** and **multiple K8s pods** as follows.

### One shared queue per tenant (not per pod)

- Use the **tenant database’s** `notification_queue` table as the **single** queue for that tenant. **All pods** share the same DB and thus the **same** queue.
- Do **not** introduce a separate queue per pod; that fragments work and does not fix duplication.

### Avoid duplicate emails with multiple replicas

- With **more than one pod**, two workers can otherwise read the same `pending` rows and **send the same email twice**.
- **Require atomic claiming** before send: e.g. PostgreSQL `SELECT … FOR UPDATE SKIP LOCKED`, or an `UPDATE … WHERE status = 'pending' … RETURNING` that flips to a `processing` / `claimed` state in one statement, then send SMTP, then mark `sent` or `failed`.
- Alternatives: run the queue consumer as a **single** replica (Deployment replicas=1 for a worker) or an external work queue with consumer-group semantics—only if DB-level claiming is not used.

### Multi-tenant processing

- **Enqueue** using the **request-scoped tenant DB** (`getRequestDatabase(req)` / `additionalData.db` from activity logging), same as today’s activity logger pattern.
- **Process** by iterating **each tenant database** that the instance knows about (same idea as `getAllTenantDatabases()` in `tenantRouting.js` for cron), not only `defaultDb`.

### New tenants must be visible on every pod (onboarding caveat)

- Tenant DB handles are typically held in a **per-process cache** (`dbCache` in `tenantRouting.js`). **`getAllTenantDatabases()` only returns tenants already cached on that pod** (usually after at least one HTTP request opened that tenant).
- **Implication:** background jobs (queue processor, cleanup, etc.) on a given pod may **not** see **newly onboarded** tenants until that pod has loaded their DB (first request to that host, explicit warm-up, or a future **tenant registry** that opens connections per known tenant ID).
- When implementing or changing onboarding, **always consider**: ensuring **every pod** eventually has the new tenant in cache, or providing a **registry-driven** iteration path so scheduled work is not skipped for new tenants.

## Security Checklist (agent must verify)
- No hardcoded secrets (use environment variables: `JWT_SECRET`, `INSTANCE_TOKEN`, `SMTP_*`)
- All database queries go through sqlManager (dual SQLite/PostgreSQL support with parameterized queries)
- JWT tokens validated via `authenticateToken` middleware before accessing protected routes
- Multi-tenant isolation: users can only access data from their tenant's database
- Security headers set globally in `server/index.js` (X-Content-Type-Options, X-Frame-Options, HSTS, etc.)
- CORS handled by nginx (Express CORS middleware disabled to avoid duplicate headers)
- File uploads validated via `server/utils/fileValidation.js` (size limits, mime types, extensions)
- Instance status checks prevent actions on suspended/terminated instances (`server/middleware/instanceStatus.js`)