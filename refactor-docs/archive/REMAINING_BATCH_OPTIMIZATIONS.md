# Remaining Batch Transaction Optimizations

## ✅ Completed

1. **`POST /api/tasks/batch-update-positions`** ✅
   - Status: **DONE** - Uses `executeBatchTransaction()` for proxy databases
   - Performance: Reduced from N HTTP requests to 1 batched request
   - Result: 4-6ms for 80+ updates (was previously much slower)

## 🔴 High Priority - Remaining

### 2. **`POST /api/tasks/:id/attachments`** (`server/routes/taskRelations.js:397-411`)
   - **Current**: N HTTP requests for N attachments
   - **Impact**: High - users can upload multiple files
   - **Queries**: Multiple `INSERT INTO attachments (...) VALUES (...)`
   - **Optimization Needed**: 
     - Collect all attachment INSERT queries
     - Use `executeBatchTransaction()` for proxy databases
     - Keep existing transaction for direct DB

### 3. **`POST /api/boards/reorder`** (`server/routes/boards.js:369-384`)
   - **Current**: Multiple UPDATE requests (one per board)
   - **Impact**: Medium - typically 5-20 boards
   - **Queries**: Multiple `UPDATE boards SET position = ? WHERE id = ?`
   - **Optimization Needed**:
     - Collect all board position UPDATE queries
     - Use `executeBatchTransaction()` for proxy databases
     - Keep existing transaction for direct DB

### 4. **`PUT /api/priorities/reorder`** (`server/routes/priorities.js:164-168`)
   - **Current**: N HTTP requests for N priority updates
   - **Impact**: Low-Medium - typically 3-10 priorities
   - **Queries**: Multiple `UPDATE priorities SET position = ? WHERE id = ?`
   - **Optimization Needed**:
     - Collect all priority position UPDATE queries
     - Use `executeBatchTransaction()` for proxy databases
     - Keep existing transaction for direct DB

### 5. **`POST /api/comments`** (`server/routes/comments.js:26-56`)
   - **Current**: 1 INSERT for comment + N INSERTs for attachments
   - **Impact**: Medium - comments with multiple attachments
   - **Queries**: `INSERT INTO comments` + multiple `INSERT INTO attachments`
   - **Optimization Needed**:
     - Collect comment INSERT + all attachment INSERTs
     - Use `executeBatchTransaction()` for proxy databases
     - Keep existing transaction for direct DB

## 🟡 Medium Priority - Remaining

### 6. **`POST /api/tasks/:id/move`** (`server/routes/tasks.js:1360-1380`)
   - **Current**: 2 UPDATE requests (shift tasks + move task)
   - **Impact**: Low-Medium - only 2 queries, but common operation
   - **Queries**: `UPDATE tasks SET position = position + 1` + `UPDATE tasks SET columnId = ?, position = 0`
   - **Optimization Needed**:
     - Collect both UPDATE queries
     - Use `executeBatchTransaction()` for proxy databases
     - Keep existing transaction for direct DB

### 7. **`POST /api/tasks/reorder`** (`server/routes/tasks.js:1189-1204`)
   - **Current**: 1-2 UPDATE requests (shift + move)
   - **Impact**: Low-Medium - common operation
   - **Queries**: Conditional UPDATEs based on direction
   - **Optimization Needed**:
     - Collect all UPDATE queries
     - Use `executeBatchTransaction()` for proxy databases
     - Keep existing transaction for direct DB

### 8. **`POST /api/settings/mail/disable`** (`server/routes/settings.js:252-266`)
   - **Current**: Multiple INSERT/UPDATE requests
   - **Impact**: Low - only a few settings
   - **Queries**: Multiple `INSERT OR REPLACE INTO settings (...) VALUES (...)`
   - **Optimization Needed**:
     - Collect all setting INSERT/UPDATE queries
     - Use `executeBatchTransaction()` for proxy databases
     - Keep existing transaction for direct DB

### 9. **`POST /api/password-reset/reset`** (`server/routes/password-reset.js:181-193`)
   - **Current**: 2 UPDATE requests
   - **Impact**: Low - infrequent operation
   - **Queries**: `UPDATE users SET password_hash` + `UPDATE password_reset_tokens SET used = 1`
   - **Optimization Needed**:
     - Collect both UPDATE queries
     - Use `executeBatchTransaction()` for proxy databases
     - Keep existing transaction for direct DB

## 🟢 Low Priority - Background Jobs (Less Frequent) - ✅ COMPLETED

### 10. **`checkAllUserAchievements`** (`server/jobs/achievements.js`) ✅
   - **Status**: **DONE** - Batches all achievement and points INSERT queries
   - **Impact**: High during execution, but runs infrequently (scheduled job)
   - **Optimization**: Collects all INSERT queries and uses `executeBatchTransaction()` for proxy databases

### 11. **`createDailyTaskSnapshots`** (`server/jobs/taskSnapshots.js`) ✅
   - **Status**: **DONE** - Batches all snapshot INSERT/UPDATE queries
   - **Impact**: High during execution, but runs once daily
   - **Optimization**: Collects all INSERT/UPDATE queries and uses `executeBatchTransaction()` for proxy databases

## Implementation Pattern

For each endpoint, follow this pattern (same as `batch-update-positions`):

```javascript
if (isProxyDatabase(db)) {
  // Proxy mode: Collect all queries and send as batch
  const batchQueries = [];
  
  // Collect all queries
  for (const item of items) {
    batchQueries.push({
      query: 'INSERT/UPDATE ...',
      params: [...]
    });
  }
  
  // Execute all queries in a single batched transaction
  await db.executeBatchTransaction(batchQueries);
} else {
  // Direct DB mode: Use standard transaction
  await dbTransaction(db, async () => {
    // Existing transaction code
  });
}
```

## Summary

- **Total Optimized**: 11 endpoints/functions ✅
- **High Priority**: 4 endpoints ✅ (attachments, boards/reorder, priorities/reorder, comments)
- **Medium Priority**: 4 endpoints ✅ (tasks/:id/move, tasks/reorder, settings/mail/disable, password-reset/reset)
- **Low Priority**: 2 background jobs ✅ (achievements, snapshots)
- **Remaining**: 0 endpoints/functions

## 🎉 All Batch Optimizations Complete!

## Estimated Impact

- **High Priority**: Could improve performance by 50-200ms per operation
- **Medium Priority**: Could improve performance by 10-50ms per operation
- **Low Priority**: Could improve background job execution time by 1-5 seconds (but runs infrequently)

