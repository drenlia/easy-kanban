# AGENTS.md

## Core Principles
- Prioritize security, maintainability, and least-privilege by default.
- Never ship code that violates these rules unless explicitly instructed otherwise.

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
  - Real-time updates: `server/services/notificationService.js` (Redis pub/sub + Socket.IO)
- Use database transactions for multi-step operations (see `server/utils/dbAsync.js`)
- Publish real-time events via `notificationService.publish()` for WebSocket updates
- Support both single-tenant (Docker) and multi-tenant (Kubernetes) modes
- Run migrations via `server/migrations/index.js` for schema changes

## Security Checklist (agent must verify)
- No hardcoded secrets (use environment variables: `JWT_SECRET`, `INSTANCE_TOKEN`, `SMTP_*`)
- All database queries go through sqlManager (dual SQLite/PostgreSQL support with parameterized queries)
- JWT tokens validated via `authenticateToken` middleware before accessing protected routes
- Multi-tenant isolation: users can only access data from their tenant's database
- Security headers set globally in `server/index.js` (X-Content-Type-Options, X-Frame-Options, HSTS, etc.)
- CORS handled by nginx (Express CORS middleware disabled to avoid duplicate headers)
- File uploads validated via `server/utils/fileValidation.js` (size limits, mime types, extensions)
- Instance status checks prevent actions on suspended/terminated instances (`server/middleware/instanceStatus.js`)