# Complete List of `/api/admin` Routes

## Route Mount Points

Based on `server/index.js`, the following routes are mounted under `/api/admin` (and related):

1. `/api/admin/sprints` - sprintsRouter (lazy loaded)
2. `/api/admin/users` - adminUsersRouter (lazy loaded)
3. `/api/admin/tags` - tagsRouter
4. `/api/admin/priorities` - prioritiesRouter
5. `/api/admin/settings` - settingsRouter (eager loaded)
6. `/api/admin` - adminSystemRouter (lazy loaded)
7. `/api/admin/notification-queue` - adminNotificationQueueRouter (lazy loaded)
8. `/api/admin/lifecycle` - adminLifecycleRouter (lazy loaded)
9. `/api/admin/csp-reports` - cspAdminRouter (eager; list/clear CSP Report-Only violations)
10. `/api/admin-portal` - adminPortalRouter (lazy loaded, `INSTANCE_TOKEN`)

Related (not under `/api/admin` but often confused with admin tooling):

- `POST /api/csp-report` — public CSP beacon ingest (rate-limited; always 204)
- `POST /api/files/media-session` — sets HttpOnly `ek_media` cookie after login
- `/api/agent`, `/api/agent/runner`, `/api/agent/automation` — AI agent surface (see `docs/AI_INTEGRATION.md`)

---

## 1. `/api/admin/sprints` (Sprints/Planning Periods)

**File**: `server/routes/sprints.js`  
**Status**: Lazy loaded

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/sprints` | ✅ Token | Get all planning periods/sprints |
| GET | `/api/admin/sprints/active` | ✅ Token | Get currently active sprint |
| GET | `/api/admin/sprints/:id/usage` | ✅ Admin | Get sprint usage count |
| POST | `/api/admin/sprints` | ✅ Admin | Create new sprint |
| PUT | `/api/admin/sprints/:id` | ✅ Admin | Update sprint |
| DELETE | `/api/admin/sprints/:id` | ✅ Admin | Delete sprint |

---

## 2. `/api/admin/users` (User Management)

**File**: `server/routes/adminUsers.js`  
**Status**: Lazy loaded

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/users` | ✅ Admin | Get all users |
| GET | `/api/admin/users/can-create` | ✅ Admin | Check if can create new user |
| GET | `/api/admin/users/:userId/task-count` | ✅ Admin | Get user's task count |
| POST | `/api/admin/users` | ✅ Admin | Create new user |
| POST | `/api/admin/users/:userId/resend-invitation` | ✅ Admin | Resend invitation email |
| PUT | `/api/admin/users/:userId` | ✅ Admin | Update user |
| PUT | `/api/admin/users/:userId/member-name` | ✅ Admin | Update user's member name |
| PUT | `/api/admin/users/:userId/role` | ✅ Admin | Update user role |
| PUT | `/api/admin/users/:userId/color` | ✅ Admin | Update user's member color |
| POST | `/api/admin/users/:userId/avatar` | ✅ Admin | Upload user avatar |
| DELETE | `/api/admin/users/:userId/avatar` | ✅ Admin | Delete user avatar |
| DELETE | `/api/admin/users/:userId` | ✅ Admin | Delete user |

---

## 3. `/api/admin/tags` (Tag Management)

**File**: `server/routes/tags.js`  
**Status**: Lazy loaded

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/tags` | ✅ Admin | Get all tags (admin view) |
| GET | `/api/admin/tags/:tagId/usage` | ✅ Admin | Get tag usage count |
| GET | `/api/admin/tags/usage/batch` | ✅ Admin | Get batch tag usage counts |
| POST | `/api/admin/tags` | ✅ Admin | Create new tag |
| PUT | `/api/admin/tags/:tagId` | ✅ Admin | Update tag |
| DELETE | `/api/admin/tags/:tagId` | ✅ Admin | Delete tag |

---

## 4. `/api/admin/priorities` (Priority Management)

**File**: `server/routes/priorities.js`  
**Status**: Lazy loaded

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/priorities` | ✅ Admin | Get all priorities (admin view) |
| GET | `/api/admin/priorities/:priorityId/usage` | ✅ Admin | Get priority usage count |
| GET | `/api/admin/priorities/usage/batch` | ✅ Admin | Get batch priority usage counts |
| POST | `/api/admin/priorities` | ✅ Admin | Create new priority |
| PUT | `/api/admin/priorities/reorder` | ✅ Admin | Reorder priorities |
| PUT | `/api/admin/priorities/:priorityId` | ✅ Admin | Update priority |
| PUT | `/api/admin/priorities/:priorityId/set-default` | ✅ Admin | Set default priority |
| DELETE | `/api/admin/priorities/:priorityId` | ✅ Admin | Delete priority |

---

## 5. `/api/admin/settings` (System Settings)

**File**: `server/routes/settings.js`  
**Status**: Eager loaded (required immediately for frontend)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/settings` | ✅ Admin | Get all system settings |
| PUT | `/api/admin/settings` | ✅ Admin | Update system settings |
| PUT | `/api/admin/settings/app-url` | ✅ Token | Update app URL |
| POST | `/api/admin/settings/clear-mail` | ✅ Admin | Clear mail queue |
| GET | `/api/admin/settings/info` | ✅ Token | Get settings info |

---

## 6. `/api/admin` (System Administration)

**File**: `server/routes/adminSystem.js`  
**Status**: Lazy loaded

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/migrations` | ✅ Admin | Get database migration status |
| GET | `/api/admin/system-info` | ✅ Admin | Get system information (memory, CPU, disk) |
| GET | `/api/admin/owner` | ✅ Admin | Get instance owner |
| GET | `/api/admin/portal-config` | ✅ Admin | Get admin portal configuration |
| GET | `/api/admin/instance-portal/billing-history` | ✅ Admin | Get billing history (owner only) |
| GET | `/api/admin/email-status` | ✅ Admin | Check email server status |
| POST | `/api/admin/jobs/snapshot` | ✅ Admin | Trigger task snapshot job |
| POST | `/api/admin/jobs/achievements` | ✅ Admin | Trigger achievement check job |
| POST | `/api/admin/jobs/cleanup` | ✅ Admin | Trigger snapshot cleanup job |
| POST | `/api/admin/instance-portal/change-plan` | ✅ Admin | Change subscription plan (owner only) |
| POST | `/api/admin/instance-portal/cancel-subscription` | ✅ Admin | Cancel subscription (owner only) |
| POST | `/api/admin/test-email` | ✅ Admin | Send test email |

---

## 7. `/api/admin/notification-queue` (Notification Queue Management)

**File**: `server/routes/adminNotificationQueue.js`  
**Status**: Lazy loaded

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/notification-queue` | ✅ Admin | Get all notification queue items |
| POST | `/api/admin/notification-queue/send` | ✅ Admin | Send selected notifications immediately |
| DELETE | `/api/admin/notification-queue` | ✅ Admin | Delete selected notifications from queue |

---

## 8. `/api/admin/lifecycle` (Trash / soft-delete)

**File**: `server/routes/adminLifecycle.js`  
**Status**: Lazy loaded

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/lifecycle/tasks` | ✅ Admin | List soft-deleted tasks |
| GET | `/api/admin/lifecycle/boards` | ✅ Admin | List soft-deleted boards |
| POST | `/api/admin/lifecycle/tasks/restore-batch` | ✅ Admin | Restore selected tasks |
| POST | `/api/admin/lifecycle/tasks/purge-batch` | ✅ Admin | Permanently delete selected tasks |
| POST | `/api/admin/lifecycle/boards/purge-batch` | ✅ Admin | Permanently delete selected boards |

---

## 9. `/api/admin/csp-reports` (CSP Report-Only)

**File**: `server/routes/cspReport.js` (`cspAdminRouter`)  
**Status**: Eager loaded

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/csp-reports` | ✅ Admin | List recent CSP violations (tenant DB) |
| DELETE | `/api/admin/csp-reports` | ✅ Admin | Clear stored CSP reports |

Public ingest (not admin-auth): `POST /api/csp-report` — rate-limited, always 204.

---

## 10. `/api/admin-portal` (External Admin Portal)

**File**: `server/routes/adminPortal.js`  
**Status**: Lazy loaded  
**Auth**: Uses `INSTANCE_TOKEN` (external access)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin-portal/info` | 🔑 Instance Token | Get instance information |
| GET | `/api/admin-portal/owner-info` | 🔑 Instance Token | Get owner information |
| PUT | `/api/admin-portal/owner` | 🔑 Instance Token | Update owner information |
| GET | `/api/admin-portal/settings` | 🔑 Instance Token | Get settings |
| PUT | `/api/admin-portal/settings/:key` | 🔑 Instance Token | Update single setting |
| PUT | `/api/admin-portal/settings` | 🔑 Instance Token | Update multiple settings |
| DELETE | `/api/admin-portal/settings/:key` | 🔑 Instance Token | Delete setting |
| POST | `/api/admin-portal/settings` | 🔑 Instance Token | Create setting |
| GET | `/api/admin-portal/users` | 🔑 Instance Token | Get all users |
| POST | `/api/admin-portal/users` | 🔑 Instance Token | Create user |
| PUT | `/api/admin-portal/users/:userId` | 🔑 Instance Token | Update user |
| DELETE | `/api/admin-portal/users/:userId` | 🔑 Instance Token | Delete user |
| GET | `/api/admin-portal/health` | 🔑 Instance Token | Health check |
| GET | `/api/admin-portal/plan` | 🔑 Instance Token | Get license plan info |
| PUT | `/api/admin-portal/plan/:key` | 🔑 Instance Token | Update plan setting |
| DELETE | `/api/admin-portal/plan/:key` | 🔑 Instance Token | Delete plan setting |
| PUT | `/api/admin-portal/instance-status` | 🔑 Instance Token | Update instance status |

---

## Summary

### Total Routes by Status

- **Lazy Loaded**: admin routes for sprints, users, system, notification-queue, lifecycle, admin-portal
- **Eager Loaded**: `/api/admin/settings`, `/api/admin/csp-reports` (plus tags/priorities as mounted today)

### Total Endpoints

- **Admin Routes**: ~70+ endpoints (includes lifecycle + CSP)
- **Admin Portal Routes**: ~15 endpoints (external access)

### Breakdown by Category

- **User Management**: 12 endpoints
- **System Administration**: 12 endpoints
- **Sprints/Planning**: 6 endpoints
- **Tags Management**: 6 endpoints
- **Priorities Management**: 8 endpoints
- **Settings**: 5 endpoints
- **Notification Queue**: 3 endpoints
- **Lifecycle (trash)**: 5 endpoints
- **CSP reports**: 2 admin + 1 public ingest
- **Admin Portal (External)**: 15 endpoints

---

## Notes

1. **Lazy Loading**: Routes marked as "lazy loaded" are only loaded into memory when first accessed, reducing startup memory usage.

2. **Authentication**:
   - ✅ Token = Requires JWT authentication
   - ✅ Admin = Requires JWT authentication + admin role
   - 🔑 Instance Token = Requires INSTANCE_TOKEN for external admin portal access

3. **Route Priority**: Some routes have both public and admin versions (e.g., `/api/tags` vs `/api/admin/tags`). The router checks `req.baseUrl` to determine which handler to use.

