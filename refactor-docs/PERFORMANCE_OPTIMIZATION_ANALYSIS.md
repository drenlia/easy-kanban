# Performance Optimization Analysis

## 1. Why check-async-sql.js Didn't Catch the Missing Async Statement

### The Issue
The original code in `tasks.js` (line ~1061) was:
```javascript
await dbTransaction(db, () => {
  const updateStmt = db.prepare(`...`);
  updateStmt.run(...);  // ❌ Not awaited, not using wrapQuery
});
```

### Why the Script Missed It

The `check-async-sql.js` script has two patterns that could have caught this:

1. **Pattern: "Direct prepare().all/get/run() calls"**
   - Regex: `/\.prepare\([^)]+\)\.(all|get|run)\(/g`
   - **Why it missed**: This pattern looks for `.prepare(...).run()` in a single expression. The code split it across two lines:
     ```javascript
     const updateStmt = db.prepare(...);  // Line 1
     updateStmt.run(...);                  // Line 2
     ```
   - The pattern doesn't match multi-line expressions.

2. **Pattern: "stmt.all/get/run() without await"**
   - Regex: `/(?<!await\s)(?<!await\s\()stmt\.(all|get|run)\(/g`
   - **Why it missed**: This pattern specifically looks for `stmt.` but the variable was named `updateStmt`, not `stmt`.
   - The regex is too specific to catch all variable names.

### Recommendations to Improve the Script

1. **Add pattern for any variable ending in `Stmt`:**
   ```javascript
   {
     name: 'Statement variable .run/get/all() without await',
     regex: /(?<!await\s)(?<!await\s\()\w+[Ss]tmt\.(all|get|run)\(/g,
     description: 'These need await keyword and wrapQuery'
   }
   ```

2. **Add pattern for statements inside transaction callbacks:**
   ```javascript
   {
     name: 'Database operations inside dbTransaction without wrapQuery',
     regex: /dbTransaction\([^,]+,\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{[^}]*\.(prepare|exec|pragma)\(/gs,
     description: 'Check transaction callbacks for proper async handling'
   }
   ```

3. **Check for statements prepared outside but used inside transactions:**
   - This is harder to detect statically, but could be flagged with a warning.

---

## 2. Batch Queries That Would Benefit from /transaction Endpoint

The `/transaction` endpoint on the proxy can batch multiple queries into a single HTTP request, dramatically reducing network overhead for operations that perform many database calls.

### High-Priority Candidates (Many Operations Per Request)

#### A. Task Operations

1. **`POST /api/tasks/batch-update-positions`** (`server/routes/tasks.js:1050-1077`)
   - **Current**: N sequential HTTP requests (one per task update)
   - **Impact**: Very high - can update 50+ tasks in one drag operation
   - **Queries**: Multiple `UPDATE tasks SET position = ?, columnId = ?, ... WHERE id = ?`
   - **Optimization**: Collect all UPDATE queries and send as single batch

2. **`POST /api/tasks/:id/attachments`** (`server/routes/taskRelations.js:397-411`)
   - **Current**: N HTTP requests for N attachments
   - **Impact**: High - users can upload multiple files
   - **Queries**: Multiple `INSERT INTO attachments (...) VALUES (...)`
   - **Optimization**: Batch all INSERTs

#### B. Board Operations

3. **`POST /api/boards/reorder`** (`server/routes/boards.js:369-384`)
   - **Current**: Multiple UPDATE requests (one per board)
   - **Impact**: Medium - typically 5-20 boards
   - **Queries**: Multiple `UPDATE boards SET position = ? WHERE id = ?`
   - **Optimization**: Batch all position updates

#### C. Priority Operations

4. **`PUT /api/priorities/reorder`** (`server/routes/priorities.js:164-168`)
   - **Current**: N HTTP requests for N priority updates
   - **Impact**: Low-Medium - typically 3-10 priorities
   - **Queries**: Multiple `UPDATE priorities SET position = ? WHERE id = ?`
   - **Optimization**: Batch all position updates

#### D. Settings Operations

5. **`POST /api/settings/mail/disable`** (`server/routes/settings.js:252-266`)
   - **Current**: Multiple INSERT/UPDATE requests
   - **Impact**: Low - only a few settings
   - **Queries**: Multiple `INSERT OR REPLACE INTO settings (...) VALUES (...)`
   - **Optimization**: Batch all setting updates

#### E. Comment Operations

6. **`POST /api/comments`** (`server/routes/comments.js:26-56`)
   - **Current**: 1 INSERT for comment + N INSERTs for attachments
   - **Impact**: Medium - comments with multiple attachments
   - **Queries**: `INSERT INTO comments` + multiple `INSERT INTO attachments`
   - **Optimization**: Batch comment + all attachments

#### F. Background Jobs (Lower Priority - Less Frequent)

7. **`checkAllUserAchievements`** (`server/jobs/achievements.js:112-216`)
   - **Current**: Many INSERT/UPDATE operations in loops
   - **Impact**: High during execution, but runs infrequently (scheduled job)
   - **Queries**: Multiple `INSERT INTO user_achievements` and `INSERT INTO user_points`
   - **Optimization**: Batch all achievement and points updates per user

8. **`createDailyTaskSnapshots`** (`server/jobs/taskSnapshots.js:145-213`)
   - **Current**: Many INSERT/UPDATE operations in loops
   - **Impact**: High during execution, but runs once daily
   - **Queries**: Multiple `INSERT INTO task_snapshots` and `UPDATE task_snapshots`
   - **Optimization**: Batch all snapshot operations

### Medium-Priority Candidates (Fewer Operations, But Still Beneficial)

9. **`POST /api/tasks/:id/move`** (`server/routes/tasks.js:1360-1380`)
   - **Current**: 2 UPDATE requests (shift tasks + move task)
   - **Impact**: Low-Medium - only 2 queries, but common operation
   - **Queries**: `UPDATE tasks SET position = position + 1` + `UPDATE tasks SET columnId = ?, position = 0`
   - **Optimization**: Batch both UPDATEs

10. **`POST /api/tasks/reorder`** (`server/routes/tasks.js:1189-1204`)
    - **Current**: 1-2 UPDATE requests (shift + move)
    - **Impact**: Low-Medium - common operation
    - **Queries**: Conditional UPDATEs based on direction
    - **Optimization**: Batch both operations

11. **`POST /api/password-reset/reset`** (`server/routes/password-reset.js:181-193`)
    - **Current**: 2 UPDATE requests
    - **Impact**: Low - infrequent operation
    - **Queries**: `UPDATE users SET password_hash` + `UPDATE password_reset_tokens SET used = 1`
    - **Optimization**: Batch both UPDATEs

### Summary Table

| Endpoint/Function | Current Queries | Impact | Priority |
|------------------|----------------|--------|----------|
| `batch-update-positions` | 50+ UPDATEs | Very High | 🔴 Critical |
| `taskRelations attachments` | 5-20 INSERTs | High | 🟠 High |
| `boards/reorder` | 5-20 UPDATEs | Medium | 🟡 Medium |
| `comments` (with attachments) | 1 + N INSERTs | Medium | 🟡 Medium |
| `priorities/reorder` | 3-10 UPDATEs | Low-Medium | 🟡 Medium |
| `checkAllUserAchievements` | 100+ INSERTs | High (but infrequent) | 🟢 Low |
| `createDailyTaskSnapshots` | 100+ INSERTs | High (but infrequent) | 🟢 Low |
| `tasks/:id/move` | 2 UPDATEs | Low-Medium | 🟢 Low |
| `settings/mail/disable` | 3-5 INSERTs | Low | 🟢 Low |

---

## 3. /transaction Endpoint Scope: Multi-Tenant Only

### Yes, Correct! ✅

The `/transaction` endpoint optimization **only applies to multi-tenant mode** (when using the SQLite proxy). Here's why:

### Architecture Overview

1. **Multi-Tenant Mode (Kubernetes/NFS)**:
   - Uses `DatabaseProxy` class
   - All queries go through HTTP to `sqlite-proxy-service`
   - Each query = 1 HTTP request with network latency
   - **Problem**: Many sequential HTTP requests = slow
   - **Solution**: `/transaction` endpoint batches multiple queries into 1 HTTP request
   - **Location**: `scripts/sqlite-proxy-service.js:166-202`

2. **Self-Hosted Docker Mode**:
   - Uses direct `better-sqlite3` connection
   - Queries execute synchronously in-process
   - No network overhead
   - **Current behavior**: `dbTransaction()` uses `BEGIN`/`COMMIT`/`ROLLBACK` (already optimized)
   - **Location**: `server/utils/dbAsync.js:75-93` (lines 82-92 for direct DB)

### Code Evidence

**Direct DB Transaction (Self-Hosted)**:
```javascript
// server/utils/dbAsync.js:82-92
// Direct DB (better-sqlite3) - use manual transaction control
try {
  db.exec('BEGIN');           // Synchronous, in-process
  const result = await callback();
  db.exec('COMMIT');          // Synchronous, in-process
  return result;
} catch (error) {
  db.exec('ROLLBACK');        // Synchronous, in-process
  throw error;
}
```

**Proxy Transaction (Multi-Tenant)**:
```javascript
// server/utils/databaseProxy.js:124-135
async executeTransaction(callback, args) {
  // Currently just calls callback, which makes individual HTTP requests
  // TODO: Implement query collection and use /transaction endpoint
  return await callback(...args);
}
```

### Performance Impact

- **Self-Hosted**: Transactions are already fast (in-process, synchronous)
- **Multi-Tenant**: Transactions are slow (network latency × N queries)
- **Optimization Benefit**: Only helps multi-tenant mode

### Implementation Strategy

When implementing batch transaction optimization:

1. **Detect proxy mode**: `isProxyDatabase(db)` already exists
2. **Collect queries**: Intercept `db.prepare()` and `stmt.run/get/all()` calls within transaction
3. **Batch send**: Use `/transaction` endpoint for proxy, keep existing behavior for direct DB
4. **Fallback**: If collection fails, fall back to individual requests

### Example Implementation Sketch

```javascript
// In DatabaseProxy.executeTransaction()
async executeTransaction(callback, args) {
  if (this.useBatchTransactions) {
    // Collect queries
    const queries = [];
    const transactionContext = {
      prepare: (query) => {
        const stmt = { query, params: [] };
        queries.push({ query, params: [] });
        return {
          run: (...params) => { stmt.params = params; return { type: 'run' }; },
          get: (...params) => { stmt.params = params; return { type: 'get' }; },
          all: (...params) => { stmt.params = params; return { type: 'all' }; }
        };
      }
    };
    
    await callback(transactionContext, ...args);
    
    // Send batch request
    return await this.executeBatchTransaction(queries);
  } else {
    // Current behavior (individual requests)
    return await callback(...args);
  }
}
```

---

## Conclusion

1. **Script Improvement**: The `check-async-sql.js` script needs patterns that catch variable-named statements and multi-line expressions.

2. **Batch Optimization Priority**: Focus on `batch-update-positions` first (highest impact), then attachment uploads and board/priority reordering.

3. **Scope**: `/transaction` optimization only benefits multi-tenant mode. Self-hosted mode already uses optimized in-process transactions.

