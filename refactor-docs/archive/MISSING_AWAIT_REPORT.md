# Missing `await` Statements in SQL Operations

This report lists all SQL operations in `server/**/*.js` files that may be missing `await` statements.

## Files Requiring `await` (in async functions)

### `server/routes/files.js`
- **Line 74**: `db.prepare('SELECT id FROM users WHERE id = ?').get(decoded.id)` - Missing `await`
  - Context: Inside async route handler `router.get('/:filename', ...)`

### `server/services/activityLogger.js`
- **Line 74**: `database.prepare(...).get(userId)` - Missing `await`
  - Context: Inside `logTaskActivity` (async function)
- **Line 84**: `database.prepare(...).get()` - Missing `await`
  - Context: Inside `logTaskActivity` (async function)
- **Line 88**: `database.prepare(...).get(userId)` - Missing `await`
  - Context: Inside `logTaskActivity` (async function)
- **Line 294**: `database.prepare(...).get(userId)` - Missing `await`
  - Context: Inside `logActivity` (async function)
- **Line 304**: `database.prepare(...).get()` - Missing `await`
  - Context: Inside `logActivity` (async function)
- **Line 308**: `database.prepare(...).get(userId)` - Missing `await`
  - Context: Inside `logActivity` (async function)
- **Line 609**: `database.prepare(...).get()` - Missing `await`
  - Context: Inside `logCommentActivity` (async function)
- **Line 619**: `database.prepare(...).get(userId)` - Missing `await`
  - Context: Inside `logCommentActivity` (async function)
- **Line 634**: `database.prepare(...).get(taskId)` - Missing `await`
  - Context: Inside `logCommentActivity` (async function)

### `server/services/websocketService.js`
- **Line 116**: `dbInfo.db.prepare('SELECT id FROM users WHERE id = ?').get(decoded.id)` - Missing `await`
  - Context: Inside async WebSocket auth middleware

### `server/routes/users.js`
- **Line 423**: `db.exec(...)` - Missing `await`
  - Context: Inside async route handler `router.get('/settings', ...)`

## Files Requiring Function to be Made `async` (and then add `await`)

### `server/utils/appVersion.js`
- **Line 13**: `db.prepare('SELECT value FROM settings WHERE key = ?').get('APP_VERSION')` - Function `getAppVersion` is NOT async
  - **Action**: Make `getAppVersion` async and add `await`
  - **Note**: Check all callers to ensure they `await` this function

### `server/utils/i18n.js`
- **Line 60**: `db.prepare('SELECT value FROM settings WHERE key = ?').get('APP_LANGUAGE')` - Function `getAppLanguage` is NOT async
  - **Action**: Make `getAppLanguage` async and add `await`
  - **Note**: Check all callers to ensure they `await` this function

### `server/config/demoData.js`
- **Line 89**: `db.prepare('SELECT id FROM roles WHERE name = ?').get('user').id` - Function `createDemoUsers` is NOT async
- **Line 169**: `db.prepare('SELECT project FROM boards WHERE id = ?').get(boardId)` - Function `initializeDemoData` is NOT async
- **Line 402**: `db.prepare('SELECT id FROM tasks WHERE boardId = ?').all(boardId).map(...)` - Function `initializeDemoData` is NOT async
- **Line 413**: `db.prepare('SELECT id FROM tasks WHERE columnId = ? AND boardId = ?').all(...)` - Function `initializeDemoData` is NOT async
- **Line 420**: `db.prepare('UPDATE tasks SET ...').run(...)` - Function `initializeDemoData` is NOT async
- **Line 432**: `db.prepare('SELECT id FROM tasks WHERE columnId = ? AND boardId = ?').all(...)` - Function `initializeDemoData` is NOT async
- **Line 439**: `db.prepare('UPDATE tasks SET ...').run(...)` - Function `initializeDemoData` is NOT async
- **Line 675**: `db.prepare('SELECT id, email FROM users WHERE id = ?').get(member.userId)` - Function `initializeDemoData` is NOT async
- **Line 740**: `db.prepare('SELECT id FROM users WHERE id = ?').get(member.userId)` - Function `initializeDemoData` is NOT async
- **Line 844**: `db.prepare('SELECT tagId FROM task_tags WHERE taskId = ?').all(task.id)` - Function `initializeDemoData` is NOT async
- **Line 846**: `db.prepare('SELECT tag, color FROM tags WHERE id = ?').get(tt.tagId)` - Function `initializeDemoData` is NOT async
  - **Action**: Make `createDemoUsers` and `initializeDemoData` async and add `await` to all SQL operations
  - **Note**: Check all callers to ensure they `await` these functions

### `server/config/database.js`
- **Line 185**: `db.prepare('SELECT COUNT(*) as count FROM priorities WHERE initial = 1').get().count` - Inside `initializeDefaultPriorities` (async function) - Missing `await`
- **Line 188**: `db.prepare('SELECT id FROM priorities WHERE priority = ?').get('medium')` - Inside `initializeDefaultPriorities` (async function) - Missing `await`
- **Line 190**: `db.prepare('UPDATE priorities SET initial = 1 WHERE id = ?').run(mediumPriority.id)` - Inside `initializeDefaultPriorities` (async function) - Missing `await`
- **Line 194**: `db.prepare('SELECT id FROM priorities ORDER BY position ASC LIMIT 1').get()` - Inside `initializeDefaultPriorities` (async function) - Missing `await`
- **Line 196**: `db.prepare('UPDATE priorities SET initial = 1 WHERE id = ?').run(firstPriority.id)` - Inside `initializeDefaultPriorities` (async function) - Missing `await`
- **Line 197**: `db.prepare('SELECT priority FROM priorities WHERE id = ?').get(firstPriority.id)?.priority` - Inside `initializeDefaultPriorities` (async function) - Missing `await`
- **Line 744**: Conditional `db.prepare(...).get('UPLOAD_FILETYPES')` - Inside `initializeDefaultData` (async function) - Already has conditional `await` for proxy, but non-proxy path missing `await`
- **Line 848**: Conditional `db.prepare(...).get('admin').id` - Inside `initializeDefaultData` (async function) - Already has conditional `await` for proxy, but non-proxy path missing `await`
- **Line 983**: Conditional `db.prepare(...).get('UPLOAD_FILETYPES')` - Inside `initializeDefaultData` (async function) - Already has conditional `await` for proxy, but non-proxy path missing `await`
- **Line 1083**: Conditional `db.prepare(...).get(systemUserId)` - Inside `initializeDefaultData` (async function) - Already has conditional `await` for proxy, but non-proxy path missing `await`
- **Line 1100**: Conditional `db.prepare(...).get('user').id` - Inside `initializeDefaultData` (async function) - Already has conditional `await` for proxy, but non-proxy path missing `await`
- **Line 1187**: `db.prepare('ALTER TABLE members ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP').run()` - Inside migration function (NOT async) - Missing `await`
- **Line 1198**: `db.prepare('ALTER TABLE tasks ADD COLUMN dueDate TEXT').run()` - Inside migration function (NOT async) - Missing `await`
- **Line 1209**: `db.prepare('ALTER TABLE priorities ADD COLUMN position INTEGER NOT NULL DEFAULT 0').run()` - Inside migration function (NOT async) - Missing `await`
- **Line 1220**: `db.prepare('ALTER TABLE views ADD COLUMN projectFilter TEXT').run()` - Inside migration function (NOT async) - Missing `await`
- **Line 1231**: `db.prepare('ALTER TABLE views ADD COLUMN taskFilter TEXT').run()` - Inside migration function (NOT async) - Missing `await`
- **Line 1242**: `db.prepare('ALTER TABLE views ADD COLUMN boardColumnFilter TEXT').run()` - Inside migration function (NOT async) - Missing `await`
- **Line 1253**: `db.prepare('ALTER TABLE users ADD COLUMN force_logout INTEGER DEFAULT 0').run()` - Inside migration function (NOT async) - Missing `await`
- **Line 1264**: `db.prepare('ALTER TABLE columns ADD COLUMN is_archived BOOLEAN DEFAULT 0').run()` - Inside migration function (NOT async) - Missing `await`
- **Line 1327**: Conditional `db.prepare(...).get('APP_VERSION')` - Inside `initializeDefaultData` (async function) - Already has conditional `await` for proxy, but non-proxy path missing `await`
- **Line 1402**: `db.prepare('SELECT id, priority FROM priorities').all()` - Inside migration function (NOT async) - Missing `await`
- **Line 1409**: `db.prepare('SELECT id FROM priorities WHERE initial = 1').get()` - Inside migration function (NOT async) - Missing `await`
- **Line 1482**: `db.prepare('SELECT id, priority FROM priorities').all()` - Inside migration function (NOT async) - Missing `await`
- **Line 1489**: `db.prepare('SELECT id FROM priorities WHERE initial = 1').get()` - Inside migration function (NOT async) - Missing `await`

### `server/migrations/index.js`
- **Line 13**: `db.exec(...)` - Inside migration function (NOT async) - Missing `await`
- **Line 148**: `db.exec(...)` - Inside migration function (NOT async) - Missing `await`
- **Line 188**: `db.exec('ALTER TABLE planning_periods ADD COLUMN is_active INTEGER DEFAULT 0')` - Inside migration function (NOT async) - Missing `await`
- **Line 193**: `db.exec('ALTER TABLE planning_periods ADD COLUMN description TEXT')` - Inside migration function (NOT async) - Missing `await`
- **Line 198**: `db.exec('ALTER TABLE planning_periods ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP')` - Inside migration function (NOT async) - Missing `await`
- **Line 226**: `db.exec('ALTER TABLE task_snapshots ADD COLUMN is_completed INTEGER DEFAULT 0')` - Inside migration function (NOT async) - Missing `await`
- **Line 231**: `db.exec('ALTER TABLE task_snapshots ADD COLUMN start_date DATE')` - Inside migration function (NOT async) - Missing `await`
- **Line 236**: `db.exec('ALTER TABLE task_snapshots ADD COLUMN due_date DATE')` - Inside migration function (NOT async) - Missing `await`
- **Line 241**: `db.exec('ALTER TABLE task_snapshots ADD COLUMN watchers_count INTEGER DEFAULT 0')` - Inside migration function (NOT async) - Missing `await`
- **Line 246**: `db.exec('ALTER TABLE task_snapshots ADD COLUMN watchers_count INTEGER DEFAULT 0')` - Inside migration function (NOT async) - Missing `await`
- **Line 251**: `db.exec('ALTER TABLE task_snapshots ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP')` - Inside migration function (NOT async) - Missing `await`
- **Line 272**: `db.exec(...)` - Inside migration function (NOT async) - Missing `await`
- **Line 354**: `db.exec('DROP TABLE IF EXISTS badges')` - Inside migration function (NOT async) - Missing `await`
- **Line 370**: `db.exec('ALTER TABLE user_points ADD COLUMN watchers_added INTEGER DEFAULT 0')` - Inside migration function (NOT async) - Missing `await`
- **Line 398**: `db.exec('ALTER TABLE user_achievements ADD COLUMN badge_id TEXT')` - Inside migration function (NOT async) - Missing `await`
- **Line 402**: `db.exec('CREATE INDEX IF NOT EXISTS idx_user_achievements_badge_id ON user_achievements(badge_id)')` - Inside migration function (NOT async) - Missing `await`
- **Line 426**: `db.exec(...)` - Inside migration function (NOT async) - Missing `await`
- **Line 484**: `db.exec(...)` - Inside migration function (NOT async) - Missing `await`
- **Line 502**: `db.exec(...)` - Inside migration function (NOT async) - Missing `await`
- **Line 550**: `db.exec(...)` - Inside migration function (NOT async) - Missing `await`
- **Line 578**: `db.exec(...)` - Inside migration function (NOT async) - Missing `await`
- **Line 616**: `db.exec(...)` - Inside migration function (NOT async) - Missing `await`
- **Line 643**: `db.exec('ALTER TABLE tasks ADD COLUMN priority_id INTEGER')` - Inside migration function (NOT async) - Missing `await`
- **Line 650**: `db.prepare('SELECT id, priority FROM priorities').all()` - Inside migration function (NOT async) - Missing `await`
- **Line 657**: `db.prepare('SELECT id FROM priorities WHERE initial = 1').get()` - Inside migration function (NOT async) - Missing `await`
- **Line 697**: `db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_priority_id ON tasks(priority_id)')` - Inside migration function (NOT async) - Missing `await`
- **Line 740**: `await db.exec(...)` - Inside migration function (NOT async) - **Already has await** (this one is correct)
- **Line 750**: `db.exec(...)` - Inside migration function (NOT async) - Missing `await`
- **Line 763**: Conditional `db.prepare(...).all()` - Inside `runMigrations` (async function) - Already has conditional `await` for proxy, but non-proxy path missing `await`
- **Line 795**: Conditional `db.prepare(...).all()` - Inside `runMigrations` (async function) - Already has conditional `await` for proxy, but non-proxy path missing `await`
- **Line 879**: `db.exec(...)` - Inside migration function (NOT async) - Missing `await`

## Files with Synchronous Checks (May Be OK)

### `server/middleware/tenantRouting.js`
- **Line 106**: `cached.db.prepare('SELECT 1').get()` - Synchronous health check, might be OK
- **Line 255**: `dbInfo.db.prepare('SELECT 1').get()` - Synchronous health check, might be OK
  - **Note**: These are simple health checks. If the database is a proxy, they should be awaited. If direct better-sqlite3, they're synchronous and OK.

## Summary

- **Total files with issues**: 8
- **Total missing `await` statements**: ~80+
- **Files requiring function signature changes**: 4 (`appVersion.js`, `i18n.js`, `demoData.js`, migration functions in `database.js` and `migrations/index.js`)

## Priority

1. **High Priority**: Files with async functions missing `await` (routes, services)
2. **Medium Priority**: Utility functions that need to be made async (`appVersion.js`, `i18n.js`)
3. **Low Priority**: Migration functions and demo data initialization (these might work synchronously in direct database mode, but should be made async for consistency)

