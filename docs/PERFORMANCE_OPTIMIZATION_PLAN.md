# Performance Optimization Plan - EKS/EFS Environment

## Executive Summary

This document outlines performance optimization strategies for task create/update/delete operations in the Easy Kanban application when deployed on AWS EKS with EFS storage. The goal is to achieve sub-100ms response times for these critical operations.

## Current Performance Characteristics

### Local/Docker (Same Host)
- ✅ **Excellent**: < 50ms for task operations
- Database and server on same host, minimal latency

### Local Kubernetes (NFS)
- ✅ **Very Good**: < 100ms for task operations
- Local NFS provides acceptable latency

### EKS with EFS (AWS)
- ⚠️ **Slow**: 500-900ms for task operations
- Network latency to EFS adds significant overhead
- Multiple sequential database queries compound the issue

## Root Cause Analysis

### 1. Blocking Operations (High Priority)

#### Issue: `logReportingActivity` Still Blocking
**Location**: `server/routes/tasks.js`
- Line 757: Task creation (await)
- Line 864: Task creation at top (await)
- Line 1300: Task deletion (await)

**Impact**: Each call performs 3-4 sequential database queries:
1. `getUserInfo` - JOIN query
2. Task query with JOINs (boards, columns)
3. Tags query
4. `logActivity` - INSERT + `awardPoints` (more queries)

**Estimated Time**: 200-400ms per call on EFS

#### Solution: Make All `logReportingActivity` Calls Fire-and-Forget
```javascript
// Current (blocking):
await logReportingActivity(db, 'task_created', userId, task.id);

// Optimized (non-blocking):
logReportingActivity(db, 'task_created', userId, task.id).catch(error => {
  console.error('Background reporting activity logging failed:', error);
});
```

**Expected Improvement**: 200-400ms reduction per operation

### 2. Complex Query Performance (Medium Priority)

#### Issue: `fetchTaskWithRelationships` Complex JOINs
**Location**: `server/routes/tasks.js:21-153`

**Current Query Structure**:
- Multiple LEFT JOINs (attachments, comments, tags, watchers, collaborators, priorities)
- JSON aggregation functions
- Additional query for comment attachments
- Additional query for priority info

**Impact**: 130ms on EFS (vs 42-47ms locally)

**Solutions**:

**Option A: Return Minimal Data (Recommended)**
- Return only changed fields in WebSocket events
- Frontend can fetch full task data if needed (lazy loading)
- Reduces payload size and query complexity

**Option B: Optimize Query**
- Use CTEs (Common Table Expressions) for better query planning
- Add covering indexes for frequently accessed columns
- Cache task relationships (if task hasn't changed)

**Option C: Batch Priority Lookups**
- Fetch all priorities once and cache in memory
- Avoid per-task priority queries

**Expected Improvement**: 50-80ms reduction

### 3. Redis Publish Latency (Low Priority)

#### Issue: Synchronous Redis Publish
**Location**: Multiple locations in `server/routes/tasks.js`

**Current**: `await redisService.publish(...)`

**Solution**: Make Redis publish fire-and-forget
```javascript
// Fire-and-forget Redis publish
redisService.publish('task-updated', webSocketData, getTenantId(req)).catch(error => {
  console.error('Background WebSocket publish failed:', error);
});
```

**Note**: This means WebSocket events might be lost if Redis fails, but response time improves.

**Expected Improvement**: 10-20ms reduction

### 4. Sequential Query Execution (Medium Priority)

#### Issue: Multiple Sequential Queries
**Example in Task Update**:
1. Validate task (SELECT)
2. Get priority info (SELECT)
3. Update task (UPDATE)
4. Fetch task with relationships (complex SELECT with JOINs)
5. Publish to Redis

**Solution**: Batch Operations Where Possible
- Use SQLite transactions for related updates
- Combine multiple SELECTs into single query where possible
- Use `fetchTasksWithRelationshipsBatch` for multiple tasks

**Expected Improvement**: 20-40ms reduction

## Optimization Implementation Plan

### Phase 1: Quick Wins (Immediate Impact)

**Priority**: 🔴 High
**Estimated Time**: 1-2 hours
**Expected Improvement**: 200-400ms per operation

1. **Make all `logReportingActivity` calls fire-and-forget**
   - Line 757: Task creation
   - Line 864: Task creation at top
   - Line 1300: Task deletion
   - Already done: Lines 1064, 1074 (task update)

2. **Make Redis publish fire-and-forget** (optional, lower priority)
   - Task creation (line 775)
   - Task update (line 1097)
   - Task deletion (line 1388)

### Phase 2: Query Optimization (Medium Impact)

**Priority**: 🟡 Medium
**Estimated Time**: 4-6 hours
**Expected Improvement**: 50-80ms per operation

1. **Optimize `fetchTaskWithRelationships`**
   - Add covering indexes for frequently joined columns
   - Consider using CTEs for better query planning
   - Cache priority data in memory (refresh on startup/change)

2. **Reduce Payload Size**
   - Return minimal task data in WebSocket events
   - Frontend can fetch full data on-demand
   - Only include changed fields in update events

3. **Batch Operations**
   - Use batch transactions for position updates
   - Combine related SELECTs where possible

### Phase 3: Infrastructure Optimization (Long-term)

**Priority**: 🟢 Low
**Estimated Time**: 1-2 days
**Expected Improvement**: 100-200ms per operation

1. **EFS Performance Tuning**
   - Use EFS Provisioned Throughput (if not already)
   - Enable EFS Performance Mode: `maxIO` (if not already)
   - Consider EFS One Zone for lower latency (if acceptable)
   - Use EFS Access Points for better performance

2. **SQLite Proxy Optimization**
   - Add connection pooling in proxy service
   - Implement query result caching (for read-heavy operations)
   - Batch multiple queries in single HTTP request

3. **Caching Layer**
   - Redis cache for frequently accessed data (priorities, boards, columns)
   - Cache invalidation on updates
   - TTL-based expiration

4. **Database Optimization**
   - Analyze and optimize indexes
   - Run `VACUUM` periodically
   - Consider WAL mode optimizations

## Detailed Code Changes

### Change 1: Make `logReportingActivity` Fire-and-Forget

**File**: `server/routes/tasks.js`

**Line 757** (Task Creation):
```javascript
// Before:
await logReportingActivity(db, 'task_created', userId, task.id);

// After:
logReportingActivity(db, 'task_created', userId, task.id).catch(error => {
  console.error('Background reporting activity logging failed:', error);
});
```

**Line 864** (Task Creation at Top):
```javascript
// Before:
await logReportingActivity(db, 'task_created', userId, task.id);

// After:
logReportingActivity(db, 'task_created', userId, task.id).catch(error => {
  console.error('Background reporting activity logging failed:', error);
});
```

**Line 1300** (Task Deletion):
```javascript
// Before:
await logReportingActivity(db, 'task_deleted', userId, id);

// After:
logReportingActivity(db, 'task_deleted', userId, id).catch(error => {
  console.error('Background reporting activity logging failed:', error);
});
```

### Change 2: Optimize `fetchTaskWithRelationships` Query

**File**: `server/routes/tasks.js`

**Option A: Add Priority Caching**
```javascript
// At top of file, after imports
let priorityCache = null;
let priorityCacheTime = 0;
const PRIORITY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getPriorityCache(db) {
  const now = Date.now();
  if (!priorityCache || (now - priorityCacheTime) > PRIORITY_CACHE_TTL) {
    priorityCache = await wrapQuery(
      db.prepare('SELECT id, priority, color FROM priorities'),
      'SELECT'
    ).all();
    priorityCacheTime = now;
  }
  return priorityCache;
}

// In fetchTaskWithRelationships, replace priority query:
const priorities = await getPriorityCache(db);
const priority = priorities.find(p => 
  p.id === priorityId || (priorityId === null && p.priority === priorityName)
);
```

**Option B: Return Minimal Data in WebSocket Events**
```javascript
// Instead of full task with relationships, return minimal data:
const webSocketData = {
  boardId: taskResponse.boardId,
  task: {
    id: taskResponse.id,
    title: taskResponse.title,
    columnId: taskResponse.columnId,
    boardId: taskResponse.boardId,
    // Only include changed fields
    ...(task.columnId !== currentTask.columnId && { columnId: task.columnId }),
    ...(task.priority !== currentTask.priority && { priority: task.priority }),
    // ... other changed fields
    updatedBy: userId
  },
  timestamp: new Date().toISOString()
};
```

### Change 3: Make Redis Publish Fire-and-Forget (Optional)

**File**: `server/routes/tasks.js`

**Line 775** (Task Creation):
```javascript
// Before:
await redisService.publish('task-created', {...}, getTenantId(req));

// After:
redisService.publish('task-created', {...}, getTenantId(req)).catch(error => {
  console.error('Background WebSocket publish failed:', error);
});
```

**Line 1097** (Task Update):
```javascript
// Before:
await redisService.publish('task-updated', webSocketData, getTenantId(req));

// After:
redisService.publish('task-updated', webSocketData, getTenantId(req)).catch(error => {
  console.error('Background WebSocket publish failed:', error);
});
```

**Line 1388** (Task Deletion):
```javascript
// Before:
await redisService.publish('task-deleted', {...}, getTenantId(req));

// After:
redisService.publish('task-deleted', {...}, getTenantId(req)).catch(error => {
  console.error('Background WebSocket publish failed:', error);
});
```

## Expected Performance After Optimizations

### Phase 1 (Quick Wins)
- **Before**: 500-900ms
- **After**: 200-400ms
- **Improvement**: 50-60% faster

### Phase 2 (Query Optimization)
- **Before**: 200-400ms
- **After**: 100-200ms
- **Improvement**: 50% faster

### Phase 3 (Infrastructure)
- **Before**: 100-200ms
- **After**: 50-100ms
- **Improvement**: 50% faster

### Final Target
- **Goal**: < 100ms for 95% of operations
- **Achievable**: Yes, with all phases implemented

## Testing Strategy

### 1. Performance Testing
- Measure response times before and after each phase
- Test with realistic data volumes
- Test under concurrent load
- Compare local vs EKS/EFS performance

### 2. Functional Testing
- Verify activities still appear in activity feed (may have slight delay)
- Verify WebSocket events still work correctly
- Verify reporting data is still accurate
- Test error handling for fire-and-forget operations

### 3. Monitoring
- Add metrics for:
  - API response times (p50, p95, p99)
  - Background operation success rates
  - WebSocket event delivery rates
  - Database query times

## Risk Assessment

### Low Risk
- Making `logReportingActivity` fire-and-forget (already has error handling)
- Making Redis publish fire-and-forget (events are best-effort)

### Medium Risk
- Query optimizations (need thorough testing)
- Reducing WebSocket payload size (frontend may need updates)

### High Risk
- Infrastructure changes (EFS settings, caching layer)

## Rollout Plan

1. **Week 1**: Implement Phase 1 (Quick Wins)
   - Deploy to dev environment
   - Monitor for 2-3 days
   - Deploy to production

2. **Week 2-3**: Implement Phase 2 (Query Optimization)
   - Deploy to dev environment
   - Performance testing
   - Deploy to production

3. **Week 4+**: Implement Phase 3 (Infrastructure)
   - Plan infrastructure changes
   - Test in staging
   - Gradual rollout to production

## Success Metrics

- ✅ API response time < 100ms (p95)
- ✅ Activity logging success rate > 99.9%
- ✅ WebSocket event delivery rate > 99%
- ✅ No increase in error rates
- ✅ User-reported performance improvement

## Additional Recommendations

### 1. Database Connection Pooling
- If using SQLite proxy, ensure connection reuse
- Consider connection pooling in proxy service

### 2. Query Result Caching
- Cache frequently accessed, rarely changed data (priorities, boards, columns)
- Invalidate cache on updates

### 3. Background Job Queue
- Consider using Bull/BullMQ for activity logging
- Provides better reliability and monitoring

### 4. Monitoring and Alerting
- Set up alerts for:
  - API response times > 200ms
  - Background operation failures
  - Database query times > 100ms

## Conclusion

The primary bottleneck is blocking `logReportingActivity` calls. Making these fire-and-forget will provide immediate 50-60% performance improvement. Combined with query optimizations and infrastructure tuning, we can achieve sub-100ms response times in EKS/EFS environments.

