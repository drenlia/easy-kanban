# SQLite Proxy Implementation Plan (Option 1: Minimal Changes)

## Overview
This document outlines the files that need to be changed to implement SQLite proxy support with minimal refactoring. The goal is to make database operations async only when using the proxy, while keeping single-tenant mode synchronous.

## Files That Need Changes

### 1. Core Database Files

#### `server/utils/databaseProxy.js` ✅ (Already created)
- **Purpose**: Database proxy adapter that mimics better-sqlite3 API
- **Changes**: None - already implemented
- **Status**: Complete

#### `server/config/database.js`
- **Purpose**: Database initialization
- **Changes Needed**:
  - ✅ Already imports DatabaseProxy
  - ✅ Already checks for `SQLITE_PROXY_URL` env var
  - ⚠️ Need to handle async table creation/migrations when using proxy
  - ⚠️ Need to make `createTables()` and `runMigrations()` work with proxy
- **Status**: Partially complete

#### `server/middleware/tenantRouting.js`
- **Purpose**: Tenant routing and database connection management
- **Changes Needed**:
  - ⚠️ Update `getTenantDatabase()` to handle async proxy connections
  - ⚠️ Update connection cache to work with async proxy
  - ✅ `getDbPath()` can stay (used for logging only when proxy enabled)
- **Status**: Needs changes

### 2. Database Operation Wrappers

#### `server/utils/queryLogger.js`
- **Purpose**: Wraps database queries for logging
- **Changes Needed**:
  - ⚠️ Make `wrapQuery()` async-aware (check if db is proxy)
  - ⚠️ Handle async statement methods (get, all, run)
- **Status**: Needs changes

### 3. Route Handlers (Conditional Async)

These files need conditional async support - only when using proxy:

#### `server/routes/tasks.js`
- **Changes**: Make database operations conditionally async
- **Pattern**: `const result = await (isProxy ? db.prepare(...).get() : db.prepare(...).get())`

#### `server/routes/auth.js`
- **Changes**: Same pattern as tasks.js

#### `server/routes/boards.js`
- **Changes**: Same pattern

#### `server/routes/columns.js`
- **Changes**: Same pattern

#### `server/routes/comments.js`
- **Changes**: Same pattern

#### `server/routes/users.js`
- **Changes**: Same pattern

#### `server/routes/settings.js`
- **Changes**: Same pattern

#### `server/routes/tags.js`
- **Changes**: Same pattern

#### `server/routes/priorities.js`
- **Changes**: Same pattern

#### `server/routes/activity.js`
- **Changes**: Same pattern

#### `server/routes/reports.js`
- **Changes**: Same pattern

#### `server/routes/views.js`
- **Changes**: Same pattern

#### `server/routes/adminUsers.js`
- **Changes**: Same pattern

#### `server/routes/adminSystem.js`
- **Changes**: Same pattern

#### `server/routes/adminPortal.js`
- **Changes**: Same pattern

#### `server/routes/adminNotificationQueue.js`
- **Changes**: Same pattern

#### `server/routes/taskRelations.js`
- **Changes**: Same pattern

#### `server/routes/sprints.js`
- **Changes**: Same pattern

#### `server/routes/password-reset.js`
- **Changes**: Same pattern

#### `server/routes/files.js`
- **Changes**: Same pattern

#### `server/routes/members.js`
- **Changes**: Same pattern

#### `server/routes/health.js`
- **Changes**: Same pattern

### 4. Services (Conditional Async)

#### `server/services/activityLogger.js`
- **Changes**: Make database operations conditionally async

#### `server/services/notificationService.js`
- **Changes**: Make database operations conditionally async

#### `server/services/notificationThrottler.js`
- **Changes**: Make database operations conditionally async

#### `server/services/reportingLogger.js`
- **Changes**: Make database operations conditionally async

#### `server/services/websocketService.js`
- **Changes**: Make database operations conditionally async

### 5. Jobs (Conditional Async)

#### `server/jobs/taskSnapshots.js`
- **Changes**: Make database operations conditionally async

#### `server/jobs/achievements.js`
- **Changes**: Make database operations conditionally async

#### `server/jobs/achievementsNew.js`
- **Changes**: Make database operations conditionally async

### 6. Utilities (Conditional Async)

#### `server/utils/storageUtils.js`
- **Changes**: Make database operations conditionally async

#### `server/utils/i18n.js`
- **Changes**: Make database operations conditionally async

#### `server/utils/appVersion.js`
- **Changes**: Make database operations conditionally async

### 7. Middleware (Conditional Async)

#### `server/middleware/auth.js`
- **Changes**: Make database operations conditionally async

#### `server/middleware/instanceStatus.js`
- **Changes**: Make database operations conditionally async

### 8. Configuration Files

#### `server/config/demoData.js`
- **Changes**: Make database operations conditionally async

#### `server/config/license.js`
- **Changes**: Make database operations conditionally async

### 9. Migrations

#### `server/migrations/index.js`
- **Changes**: 
  - ⚠️ Make migrations work with proxy
  - ⚠️ Proxy service should handle migrations on first access
  - Or: Run migrations separately on proxy service startup

### 10. New Files (Infrastructure)

#### `scripts/sqlite-proxy-service.js` ✅ (Already created)
- **Purpose**: SQLite proxy service
- **Status**: Complete, but needs:
  - ⚠️ Table creation/migration handling
  - ⚠️ Better transaction support
  - ⚠️ Error handling improvements

#### `k8s/sqlite-proxy-deployment.yaml` (New)
- **Purpose**: Kubernetes deployment for proxy service
- **Status**: Needs creation

#### `k8s/sqlite-proxy-service.yaml` (New)
- **Purpose**: Kubernetes service for proxy
- **Status**: Needs creation

## Helper Function Pattern

Create a utility to detect if database is proxy and handle async:

```javascript
// server/utils/dbHelpers.js
export function isProxyDatabase(db) {
  return db && db.constructor.name === 'DatabaseProxy';
}

export async function dbGet(stmt, ...params) {
  if (isProxyDatabase(stmt.dbProxy)) {
    return await stmt.get(...params);
  }
  return stmt.get(...params);
}

export async function dbAll(stmt, ...params) {
  if (isProxyDatabase(stmt.dbProxy)) {
    return await stmt.all(...params);
  }
  return stmt.all(...params);
}

export async function dbRun(stmt, ...params) {
  if (isProxyDatabase(stmt.dbProxy)) {
    return await stmt.run(...params);
  }
  return stmt.run(...params);
}
```

## Summary

**Total Files to Modify**: ~40-50 files
**Core Changes**: 
- Add conditional async support to all database operations
- Update queryLogger to handle async
- Update migrations to work with proxy
- Create Kubernetes manifests for proxy service

**Key Insight**: `getDbPath()` can stay - it's only used for logging when proxy is enabled. The proxy service itself uses the path internally.

