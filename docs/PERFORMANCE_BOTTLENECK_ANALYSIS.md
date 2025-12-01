# Performance Bottleneck Analysis - Production

## Current Performance (After Async Activity Logging)

**Task Move Operation:**
- Task validation: 21ms (2.5%)
- Column fetch: 22ms (2.6%)
- Fetching tasks with relationships: 130ms (15.5%) ⚠️
- WebSocket publishing: 493ms (58.6%) ⚠️ **MAIN BOTTLENECK**
- Other overhead: 175ms (20.8%)
- **Total: 841ms** (similar to before, but bottlenecks shifted)

## Root Causes

### 1. WebSocket Publishing: 493ms (was 2-11ms)

**Why it's slow:**
- `logReportingActivity` is still **blocking** (lines 1064, 1072)
- `logReportingActivity` does multiple database queries:
  - `getUserInfo` query
  - Task query with JOINs (boards, columns)
  - Tags query
  - `reportingLogger.logActivity` which does:
    - INSERT into `activity_events`
    - `awardPoints` (which likely does more queries)
- All of this happens **BEFORE** WebSocket publish timing starts
- The 493ms might actually be the time for `logReportingActivity` + Redis publish combined

**Solution:**
- Make `logReportingActivity` fire-and-forget (non-blocking)
- This will remove the blocking database queries before WebSocket publish

### 2. Fetching Tasks: 130ms (was 42-47ms)

**Why it's slower:**
- `fetchTaskWithRelationships` does complex JOINs:
  - Multiple LEFT JOINs (attachments, comments, tags, watchers, collaborators, priorities)
  - Additional queries for comment attachments
  - Additional queries for priorities
- EFS (network storage) has higher latency than local storage
- Each query round-trip adds latency on EFS

**Potential Solutions:**
1. **Cache task relationships** (if task hasn't changed)
2. **Optimize queries** (reduce JOINs, use indexes)
3. **Batch queries** (already done for attachments, but could optimize more)
4. **Consider returning minimal data** in WebSocket events (frontend can fetch full data if needed)

### 3. Redis Publish Latency

**Possible causes:**
- Network latency to Redis (if Redis is on different node)
- Large payload size (full task with all relationships)
- Redis connection issues
- `JSON.stringify` of large objects

**Potential Solutions:**
1. **Make Redis publish non-blocking** (fire-and-forget)
2. **Reduce payload size** (send minimal task data, frontend can fetch full data)
3. **Check Redis connection** (ensure Redis is on same node or low-latency network)
4. **Optimize JSON serialization** (only send changed fields)

## Recommended Fixes

### Priority 1: Make `logReportingActivity` Fire-and-Forget

```javascript
// Before (blocking):
await logReportingActivity(db, eventType, userId, id, {...});

// After (non-blocking):
logReportingActivity(db, eventType, userId, id, {...}).catch(error => {
  console.error('Background reporting activity logging failed:', error);
});
```

**Expected impact:** Remove 200-400ms from blocking operations

### Priority 2: Make Redis Publish Non-Blocking (Optional)

If Redis publish is still slow after fixing `logReportingActivity`, consider making it fire-and-forget:

```javascript
// Fire-and-forget Redis publish
redisService.publish('task-updated', webSocketData, getTenantId(req)).catch(error => {
  console.error('Background WebSocket publish failed:', error);
});
```

**Note:** This means WebSocket events might be lost if Redis fails, but response time improves.

### Priority 3: Optimize `fetchTaskWithRelationships`

- Cache task relationships if task hasn't changed
- Reduce payload size (only send changed fields)
- Optimize queries (ensure indexes are used)

## Expected Performance After Fixes

**After making `logReportingActivity` fire-and-forget:**
- Task validation: 21ms
- Column fetch: 22ms
- Fetching tasks: 130ms (still slow, but acceptable)
- WebSocket publishing: **~5-10ms** (was 493ms) ✅
- Other overhead: 175ms
- **Total: ~350-360ms** (58% improvement)

**After optimizing `fetchTaskWithRelationships`:**
- Fetching tasks: **~50-60ms** (was 130ms)
- **Total: ~270-280ms** (67% improvement from original 841ms)

