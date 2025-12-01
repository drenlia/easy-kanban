# Activity Logging Performance Analysis

## Problem Statement

**Production Issue**: Activity logging takes 553-663ms per task move, causing significant latency in API responses.

**Performance Breakdown (per task move)**:
- Task validation: 20-28ms ✅
- Database updates: 39-44ms ✅
- **Activity logging: 553-663ms** ❌ (Bottleneck)
- WebSocket publishing: 0-1ms ✅
- **Total: 759-900ms**

**Root Cause**: Activity logging writes synchronously to SQLite on EFS (Elastic File System), which has higher latency than local storage.

## Current Implementation Analysis

### Activity Logging Flow (`logTaskActivity`)

Located in: `server/services/activityLogger.js:31-263`

#### Sequential Database Operations (Blocking)

1. **Task Info Query** (lines 57-72)
   ```javascript
   const taskInfo = await wrapQuery(database.prepare(
     `SELECT t.title, t.boardId, t.columnId, b.title as boardTitle 
      FROM tasks t 
      LEFT JOIN boards b ON t.boardId = b.id 
      WHERE t.id = ?`
   ), 'SELECT').get(taskId);
   ```
   - **Latency**: ~50-100ms on EFS
   - **Purpose**: Get task title, board info for activity details

2. **User Role Query** (lines 75-86)
   ```javascript
   const userRole = await wrapQuery(database.prepare(`
     SELECT r.id as roleId 
     FROM user_roles ur 
     JOIN roles r ON ur.role_id = r.id 
     WHERE ur.user_id = ? 
     ORDER BY r.name DESC 
     LIMIT 1
   `), 'SELECT').get(userId);
   ```
   - **Latency**: ~50-100ms on EFS
   - **Purpose**: Get user's role for activity log

3. **Fallback Role Query** (line 85)
   ```javascript
   const fallbackRole = await wrapQuery(database.prepare(`SELECT id FROM roles ORDER BY id ASC LIMIT 1`), 'SELECT').get();
   ```
   - **Latency**: ~30-50ms on EFS (if needed)
   - **Purpose**: Fallback if user has no role

4. **User Existence Check** (line 89)
   ```javascript
   const userExists = await wrapQuery(database.prepare(`SELECT id FROM users WHERE id = ?`), 'SELECT').get(userId);
   ```
   - **Latency**: ~30-50ms on EFS
   - **Purpose**: Verify user exists

5. **Task Details Query** (lines 101-114)
   ```javascript
   const taskDetails = await wrapQuery(database.prepare(
     `SELECT t.ticket, b.project 
      FROM tasks t 
      LEFT JOIN boards b ON t.boardId = b.id 
      WHERE t.id = ?`
   ), 'SELECT').get(taskId);
   ```
   - **Latency**: ~50-100ms on EFS
   - **Purpose**: Get project identifier and task ticket

6. **Translator Initialization** (line 117)
   ```javascript
   const t = await getTranslator(database);
   ```
   - **Latency**: ~50-100ms on EFS (if cache miss)
   - **Purpose**: Get translation function for activity messages

7. **Activity INSERT** (lines 189-205)
   ```javascript
   await wrapQuery(stmt, 'INSERT').run(
     userId, roleId, action, taskId, columnId, boardId, tagId, enhancedDetails
   );
   ```
   - **Latency**: ~100-150ms on EFS (write operation)
   - **Purpose**: Insert activity record

8. **Latest Activities Query** (lines 211-229)
   ```javascript
   const latestActivities = await dbAll(
     database.prepare(`
       SELECT a.id, a.userId, a.roleId, a.action, a.taskId, a.columnId, a.boardId, a.tagId, a.details,
         datetime(a.created_at) || 'Z' as created_at, ...
       FROM activity a
       LEFT JOIN members m ON a.userId = m.user_id
       LEFT JOIN roles r ON a.roleId = r.id
       LEFT JOIN boards b ON a.boardId = b.id
       LEFT JOIN columns c ON a.columnId = c.id
       ORDER BY a.created_at DESC
       LIMIT 20
     `)
   );
   ```
   - **Latency**: ~150-200ms on EFS (complex JOIN query)
   - **Purpose**: Get latest activities for Redis broadcast

**Total Sequential Latency**: ~510-750ms (all queries executed one after another)

### EFS vs Local Storage Latency

| Operation | Local Storage | EFS (Production) | Difference |
|-----------|--------------|------------------|------------|
| SELECT (simple) | 1-5ms | 30-100ms | 6-20x slower |
| SELECT (JOIN) | 5-10ms | 50-150ms | 5-15x slower |
| INSERT | 2-5ms | 100-150ms | 20-30x slower |
| Complex JOIN | 10-20ms | 150-200ms | 7-10x slower |

## Optimization Solutions

### Solution 1: Asynchronous Activity Logging (Recommended - Immediate Impact)

**Make activity logging non-blocking** by running it in the background after the API response is sent.

#### Implementation

```javascript
// In server/routes/tasks.js (and other routes)
// BEFORE (blocking):
await logTaskActivity(userId, TASK_ACTIONS.UPDATE, id, details, {...});

// AFTER (non-blocking):
// Fire-and-forget: don't await, let it run in background
logTaskActivity(userId, TASK_ACTIONS.UPDATE, id, details, {...})
  .catch(error => {
    console.error('Background activity logging failed:', error);
    // Don't throw - activity logging should never break main flow
  });
```

**Benefits**:
- ✅ **Immediate**: Reduces API response time from 759-900ms to ~60-70ms
- ✅ **Zero risk**: Activity logging already has error handling
- ✅ **Simple**: Minimal code changes
- ✅ **Backward compatible**: Activity still gets logged, just asynchronously

**Trade-offs**:
- ⚠️ Activity may appear in feed slightly later (acceptable for UX)
- ⚠️ If server crashes immediately after response, activity might be lost (rare)

#### Code Changes Required

1. **Update all `logTaskActivity` calls** in:
   - `server/routes/tasks.js` (8 locations)
   - `server/routes/taskRelations.js` (2 locations)
   - Any other routes using activity logging

2. **Update `logActivity` calls** similarly

3. **Keep error handling**: Ensure `.catch()` is used to prevent unhandled promise rejections

### Solution 2: Batch Database Queries (Medium Impact)

**Combine multiple SELECT queries into a single query** to reduce round-trips.

#### Current (Sequential):
```javascript
// Query 1: Task info
const taskInfo = await wrapQuery(...).get(taskId);

// Query 2: User role
const userRole = await wrapQuery(...).get(userId);

// Query 3: Task details
const taskDetails = await wrapQuery(...).get(taskId);
```

#### Optimized (Batched):
```javascript
// Single query with JOINs
const activityData = await wrapQuery(database.prepare(`
  SELECT 
    t.title as taskTitle,
    t.boardId,
    t.columnId,
    t.ticket,
    b.title as boardTitle,
    b.project,
    r.id as roleId,
    u.id as userId
  FROM tasks t
  LEFT JOIN boards b ON t.boardId = b.id
  LEFT JOIN users u ON u.id = ?
  LEFT JOIN user_roles ur ON ur.user_id = u.id
  LEFT JOIN roles r ON ur.role_id = r.id
  WHERE t.id = ?
  ORDER BY r.name DESC
  LIMIT 1
`), 'SELECT').get(userId, taskId);
```

**Benefits**:
- ✅ Reduces 4-5 queries to 1 query
- ✅ Reduces latency from ~200-400ms to ~100-150ms
- ✅ Still works with Solution 1 (async)

**Trade-offs**:
- ⚠️ More complex query (but still readable)
- ⚠️ Requires testing to ensure correctness

### Solution 3: Cache Frequently Accessed Data (Low Impact)

**Cache user roles, board info, and task metadata** to avoid repeated queries.

#### Implementation

```javascript
// Simple in-memory cache with TTL
const roleCache = new Map(); // userId -> { roleId, expires }
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getCachedUserRole(database, userId) {
  const cached = roleCache.get(userId);
  if (cached && cached.expires > Date.now()) {
    return cached.roleId;
  }
  
  // Fetch from database
  const userRole = await wrapQuery(...).get(userId);
  roleCache.set(userId, {
    roleId: userRole?.roleId,
    expires: Date.now() + CACHE_TTL
  });
  
  return userRole?.roleId;
}
```

**Benefits**:
- ✅ Reduces repeated queries for same user/board
- ✅ Works well with Solution 1 (async)

**Trade-offs**:
- ⚠️ Memory usage (minimal for small caches)
- ⚠️ Cache invalidation complexity
- ⚠️ Stale data risk (acceptable for activity logging)

### Solution 4: Queue-Based Activity Logging (Long-term)

**Use a background job queue** (e.g., Bull, BullMQ) to process activity logs asynchronously.

#### Architecture

```
API Request → Task Update → Response (fast)
                ↓
         Activity Log Queue
                ↓
    Background Worker (processes queue)
                ↓
         Database Write (async)
```

**Benefits**:
- ✅ Complete decoupling from API response
- ✅ Can batch multiple activity logs
- ✅ Retry mechanism for failed logs
- ✅ Scalable (multiple workers)

**Trade-offs**:
- ⚠️ Requires Redis (already have it)
- ⚠️ More complex implementation
- ⚠️ Requires monitoring/alerting
- ⚠️ Overkill for current scale

## Recommended Implementation Plan

### Phase 1: Immediate Fix (Solution 1) - **Do This First**

**Goal**: Reduce API response time from 759-900ms to ~60-70ms

**Steps**:
1. Update all `logTaskActivity` calls to be fire-and-forget
2. Update all `logActivity` calls similarly
3. Test in dev environment
4. Deploy to production
5. Monitor activity logs to ensure they're still being written

**Estimated Impact**: **~650ms reduction** (from 759-900ms to ~60-70ms)

**Time Required**: 1-2 hours

### Phase 2: Query Optimization (Solution 2) - **Do This Next**

**Goal**: Further reduce activity logging time from 553-663ms to ~200-300ms

**Steps**:
1. Refactor `logTaskActivity` to use batched queries
2. Test query correctness
3. Deploy to production
4. Monitor performance

**Estimated Impact**: **~300-400ms reduction** in activity logging time (when combined with Phase 1, total API time: ~60-70ms)

**Time Required**: 2-3 hours

### Phase 3: Caching (Solution 3) - **Optional**

**Goal**: Reduce repeated queries for same user/board

**Steps**:
1. Implement simple in-memory cache for user roles
2. Implement cache for board/task metadata
3. Add cache invalidation on updates
4. Monitor cache hit rates

**Estimated Impact**: **~50-100ms reduction** for repeated operations

**Time Required**: 3-4 hours

## Code Examples

### Example 1: Fire-and-Forget Activity Logging

```javascript
// server/routes/tasks.js:1019
// BEFORE:
await logTaskActivity(
  userId,
  TASK_ACTIONS.UPDATE,
  id,
  details,
  {
    columnId: task.columnId,
    boardId: task.boardId,
    oldValue,
    newValue,
    tenantId: getTenantId(req),
    db: db
  }
);

// AFTER:
// Fire-and-forget: don't await, let it run in background
logTaskActivity(
  userId,
  TASK_ACTIONS.UPDATE,
  id,
  details,
  {
    columnId: task.columnId,
    boardId: task.boardId,
    oldValue,
    newValue,
    tenantId: getTenantId(req),
    db: db
  }
).catch(error => {
  console.error('Background activity logging failed:', error);
  // Don't throw - activity logging should never break main flow
});
```

### Example 2: Batched Query

```javascript
// server/services/activityLogger.js
// BEFORE (multiple queries):
const taskInfo = await wrapQuery(...).get(taskId);
const userRole = await wrapQuery(...).get(userId);
const taskDetails = await wrapQuery(...).get(taskId);

// AFTER (single batched query):
const activityData = await wrapQuery(database.prepare(`
  SELECT 
    t.title as taskTitle,
    t.boardId,
    t.columnId,
    t.ticket,
    b.title as boardTitle,
    b.project,
    COALESCE(
      (SELECT r.id FROM user_roles ur 
       JOIN roles r ON ur.role_id = r.id 
       WHERE ur.user_id = ? 
       ORDER BY r.name DESC 
       LIMIT 1),
      (SELECT id FROM roles ORDER BY id ASC LIMIT 1)
    ) as roleId,
    CASE WHEN u.id IS NOT NULL THEN 1 ELSE 0 END as userExists
  FROM tasks t
  LEFT JOIN boards b ON t.boardId = b.id
  LEFT JOIN users u ON u.id = ?
  WHERE t.id = ?
`), 'SELECT').get(userId, userId, taskId);
```

## Monitoring & Validation

### Metrics to Track

1. **API Response Time** (before/after)
   - Target: < 100ms (from 759-900ms)
   - Measure: P95, P99 response times

2. **Activity Logging Time** (if still measured)
   - Target: < 300ms (from 553-663ms)
   - Measure: Time spent in `logTaskActivity`

3. **Activity Log Success Rate**
   - Target: > 99.9%
   - Measure: Count of successful vs failed activity logs

4. **Activity Feed Latency**
   - Target: < 1 second delay
   - Measure: Time from API response to activity appearing in feed

### Validation Steps

1. **Load Testing**: Simulate task moves and measure response times
2. **Activity Verification**: Ensure activities are still being logged correctly
3. **Feed Verification**: Ensure activity feed updates correctly (may have slight delay)
4. **Error Monitoring**: Monitor for any unhandled promise rejections

## Risk Assessment

### Low Risk ✅
- **Solution 1 (Async)**: Already has error handling, minimal code changes
- **Solution 2 (Batching)**: Standard SQL optimization, well-tested pattern

### Medium Risk ⚠️
- **Solution 3 (Caching)**: Requires cache invalidation logic, potential for stale data

### High Risk ❌
- **Solution 4 (Queue)**: Complex infrastructure, requires monitoring

## Conclusion

**Recommended Approach**: Implement **Solution 1 (Async Activity Logging)** immediately for maximum impact with minimal risk. This will reduce API response time from 759-900ms to ~60-70ms, solving the production performance issue.

**Next Steps**: Implement **Solution 2 (Query Batching)** to further optimize activity logging performance, reducing the background processing time from 553-663ms to ~200-300ms.

Both solutions can be implemented independently and provide cumulative benefits.


