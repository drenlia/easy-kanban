# Server Index.js Refactoring Plan

## Overview
The `server/index.js` file has been successfully refactored from ~3900 lines down to ~376 lines. All routes and helper functions have been extracted into modular files. This document tracks what was completed.

## Completed Extractions

### 1. Rate Limiters ✅
- **File**: `server/middleware/rateLimiters.js`
- **Routes Extracted**: None (middleware only)
- **Exports**: `loginLimiter`, `passwordResetLimiter`, `registrationLimiter`, `activationLimiter`

### 2. Comments Routes ✅
- **File**: `server/routes/comments.js`
- **Routes Extracted**:
  - `POST /api/comments`
  - `PUT /api/comments/:id`
  - `DELETE /api/comments/:id`
  - `GET /api/comments/:commentId/attachments`

### 3. User Profile Routes ✅
- **File**: `server/routes/users.js`
- **Routes Extracted**:
  - `POST /api/users/upload`
  - `POST /api/users/avatar`
  - `DELETE /api/users/avatar`
  - `PUT /api/users/profile`
  - `DELETE /api/users/account`

### 4. Files Routes ✅
- **File**: `server/routes/files.js`
- **Routes Extracted**:
  - `GET /api/files/attachments/:filename`
  - `GET /api/files/avatars/:filename`

### 5. Debug Routes ✅
- **File**: `server/routes/debug.js`
- **Routes Extracted**:
  - `GET /api/debug/logs`
  - `POST /api/debug/logs/clear`

### 6. Health Routes ✅
- **File**: `server/routes/health.js`
- **Routes Extracted**:
  - `GET /health`

### 7. Utility Functions ✅
- **File**: `server/utils/appVersion.js`
- **Functions Extracted**: `getAppVersion(db)`
- **File**: `server/utils/containerMemory.js`
- **Functions Extracted**: `getContainerMemoryInfo()`

### 8. Admin User Management Routes ✅
- **File**: `server/routes/adminUsers.js`
- **Routes**:
  - `GET /api/admin/users`
  - `PUT /api/admin/users/:userId/member-name`
  - `PUT /api/admin/users/:userId`
  - `PUT /api/admin/users/:userId/role`
  - `GET /api/admin/users/can-create`
  - `POST /api/admin/users`
  - `GET /api/admin/email-status`
  - `POST /api/admin/users/:userId/resend-invitation`
  - `GET /api/admin/users/:userId/task-count`
  - `DELETE /api/admin/users/:userId`
  - `PUT /api/admin/users/:userId/color`
  - `POST /api/admin/users/:userId/avatar`
  - `DELETE /api/admin/users/:userId/avatar`

### 9. Tags Routes ✅
- **File**: `server/routes/tags.js`
- **Routes**:
  - `POST /api/tags` (user-created tags)
  - `GET /api/admin/tags`
  - `POST /api/admin/tags`
  - `PUT /api/admin/tags/:tagId`
  - `GET /api/admin/tags/:tagId/usage`
  - `DELETE /api/admin/tags/:tagId`
  - `GET /api/tags`
  - `GET /api/tasks/:taskId/tags`
  - `POST /api/tasks/:taskId/tags/:tagId`
  - `DELETE /api/tasks/:taskId/tags/:tagId`

### 10. Priorities Routes ✅
- **File**: `server/routes/priorities.js`
- **Routes**:
  - `GET /api/admin/priorities`
  - `POST /api/admin/priorities`
  - `PUT /api/admin/priorities/reorder`
  - `PUT /api/admin/priorities/:priorityId`
  - `DELETE /api/admin/priorities/:priorityId`
  - `PUT /api/admin/priorities/:priorityId/set-default`
  - `GET /api/admin/priorities/:priorityId/usage`
  - `GET /api/priorities`

### 11. Settings Routes ✅
- **File**: `server/routes/settings.js`
- **Routes**:
  - `GET /api/settings` (public)
  - `GET /api/admin/settings`
  - `PUT /api/admin/settings`
  - `GET /api/storage/info`
  - `GET /api/admin/owner`
  - `GET /api/admin/portal-config`

### 12. Admin System Routes ✅
- **File**: `server/routes/adminSystem.js`
- **Routes**:
  - `GET /api/admin/migrations`
  - `POST /api/admin/jobs/snapshot`
  - `POST /api/admin/jobs/achievements`
  - `POST /api/admin/jobs/cleanup`
  - `GET /api/admin/system-info`
  - `POST /api/admin/test-email`

### 13. Admin Instance Portal Routes ✅
- **File**: `server/routes/adminSystem.js` (merged into adminSystem.js)
- **Routes**:
  - `GET /api/admin/instance-portal/billing-history`
  - `POST /api/admin/instance-portal/change-plan`
  - `POST /api/admin/instance-portal/cancel-subscription`

### 14. Task Relations Routes ✅
- **File**: `server/routes/taskRelations.js`
- **Routes**:
  - `GET /api/tasks/:taskId/watchers`
  - `POST /api/tasks/:taskId/watchers/:memberId`
  - `DELETE /api/tasks/:taskId/watchers/:memberId`
  - `GET /api/tasks/:taskId/collaborators`
  - `POST /api/tasks/:taskId/collaborators/:memberId`
  - `DELETE /api/tasks/:taskId/collaborators/:memberId`
  - `GET /api/tasks/:taskId/attachments`
  - `POST /api/tasks/:taskId/attachments`
  - `DELETE /api/attachments/:id`

### 15. Activity & User Status Routes ✅
- **File**: `server/routes/activity.js`
- **Routes**:
  - `GET /api/activity/feed`
  - `GET /api/user/status`
  - `GET /api/user/settings`
  - `PUT /api/user/settings`

### 16. Auth Routes ✅
- **File**: `server/routes/auth.js`
- **Routes Extracted**:
  - `POST /api/auth/login`
  - `POST /api/auth/activate-account`
  - `POST /api/auth/register`
  - `GET /api/auth/me`
  - `GET /api/auth/check-default-admin`
  - `GET /api/auth/check-demo-user`
  - `GET /api/auth/demo-credentials`
  - Google OAuth endpoints

### 17. Upload Routes ✅
- **File**: `server/routes/upload.js`
- **Routes Extracted**:
  - `POST /api/upload` (generic file upload endpoint)

### 18. Version Route
- **Route**: `GET /api/version`
- **Status**: Remains in `index.js` (intentional - simple endpoint for version info)

## Helper Functions Extracted ✅

- `getAppVersion()` → `utils/appVersion.js` ✅
- `getContainerMemoryInfo()` → `utils/containerMemory.js` ✅

## Implementation Steps

1. ✅ Extract rate limiters
2. ✅ Extract comments routes
3. ✅ Extract user profile routes
4. ✅ Extract files routes
5. ✅ Extract debug routes
6. ✅ Extract health routes
7. ✅ Extract getAppVersion utility
8. ✅ Extract remaining routes (admin users, tags, priorities, settings, etc.)
9. ✅ Update index.js to import and use all new route modules
10. ✅ Extract helper functions (getContainerMemoryInfo)
11. ✅ Fix route path issues discovered during testing
12. ✅ Test all endpoints to ensure nothing is broken

## Refactoring Complete! ✅

**Before**: ~3900 lines in `server/index.js`  
**After**: ~376 lines in `server/index.js`  
**Reduction**: ~90% reduction in main file size

All routes have been successfully extracted into modular files. The `index.js` file now focuses on:
- App initialization
- Middleware setup
- Route module imports and mounting
- Server startup
- Graceful shutdown
- SPA fallback routing

## Notes

- All route modules should use `req.app.locals.db` to access the database
- Rate limiters should be imported from `middleware/rateLimiters.js`
- The main `index.js` should focus on:
  - App initialization
  - Middleware setup
  - Route module imports and mounting
  - Server startup
  - Graceful shutdown

## File Structure After Refactoring

```
server/
├── index.js (main app setup, ~300-500 lines)
├── middleware/
│   ├── auth.js
│   ├── rateLimiters.js ✅
│   └── ...
├── routes/
│   ├── comments.js ✅
│   ├── users.js ✅
│   ├── files.js ✅
│   ├── debug.js ✅
│   ├── health.js ✅
│   ├── adminUsers.js ✅
│   ├── tags.js ✅
│   ├── priorities.js ✅
│   ├── settings.js ✅
│   ├── adminSystem.js ✅
│   ├── taskRelations.js ✅
│   ├── activity.js ✅
│   ├── auth.js ✅
│   ├── upload.js ✅
│   └── ... (other pre-existing route files)
└── utils/
    ├── appVersion.js ✅
    ├── containerMemory.js ✅
    └── ...
```

## Benefits

1. **Maintainability**: Each route file is focused on a specific domain
2. **Testability**: Easier to test individual route modules
3. **Readability**: Smaller files are easier to understand
4. **Collaboration**: Multiple developers can work on different route files
5. **Code Organization**: Clear separation of concerns

