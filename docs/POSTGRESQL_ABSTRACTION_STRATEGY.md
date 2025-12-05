# PostgreSQL Abstraction Strategy

## Current State

We have a **partial abstraction layer** that handles:
- ✅ Parameter placeholder conversion (`?` → `$1, $2, $3`) - **Automatic in PostgresStatement**
- ✅ Async/await support - **Works transparently**
- ✅ Transaction support - **Works transparently**

But we're still adding PostgreSQL-specific code because:
- ❌ SQL function names differ (`json_object` vs `json_build_object`)
- ❌ Column name case sensitivity (PostgreSQL lowercases unquoted identifiers)
- ❌ SQL syntax differences (`INSERT OR REPLACE` vs `ON CONFLICT DO UPDATE`)

## The Problem

**Current approach**: We're checking `isPostgresDatabase()` and writing different SQL in route files.

**Issues**:
- Code duplication (SQLite and PostgreSQL versions of queries)
- Maintenance burden (need to update both versions)
- Easy to miss places that need conversion
- Breaks the abstraction principle

## Solution Options

### Option 1: Enhanced Abstraction Layer (Recommended)
**Make `db.prepare()` automatically convert SQLite SQL to PostgreSQL SQL**

**Pros**:
- Route files stay database-agnostic
- Single source of truth for SQL
- Automatic conversion for all queries

**Cons**:
- Complex SQL parsing needed
- May have edge cases

**Implementation**:
- Add `convertSqliteToPostgres()` method to `PostgresDatabase`
- Call it automatically in `prepare()` method
- Handle:
  - Function name conversion (`json_object` → `json_build_object`)
  - Column name case handling (quote identifiers or use lowercase)
  - Syntax conversion (`INSERT OR REPLACE` → `ON CONFLICT DO UPDATE`)

### Option 2: Query Builder Utilities
**Create helper functions that generate database-agnostic queries**

**Pros**:
- Explicit control over query generation
- Type-safe (if using TypeScript)
- Easy to test

**Cons**:
- Requires refactoring all queries
- More code to maintain

### Option 3: Hybrid Approach (Current + Improvements)
**Keep current approach but make it more systematic**

**Pros**:
- Minimal changes needed
- Works for complex queries

**Cons**:
- Still requires database-specific code
- Doesn't solve the maintenance problem

## Recommended Approach: Enhanced Abstraction Layer

### Phase 1: Automatic SQL Conversion in `prepare()`
```javascript
// In PostgresDatabase.prepare()
prepare(query) {
  const convertedQuery = this.convertSqliteToPostgres(query);
  return new PostgresStatement(this, convertedQuery);
}
```

### Phase 2: Handle Column Name Case Sensitivity
**Option A**: Quote all identifiers in PostgreSQL
```sql
-- SQLite: SELECT taskId FROM tasks
-- PostgreSQL: SELECT "taskId" FROM tasks
```

**Option B**: Use lowercase everywhere (requires schema migration)
```sql
-- Both: SELECT taskid FROM tasks
```

**Option C**: Smart conversion - detect camelCase and quote it
```javascript
// Convert unquoted camelCase identifiers to quoted
taskId → "taskId"
columnId → "columnId"
```

### Phase 3: Handle Complex Patterns
- `INSERT OR REPLACE` → `INSERT ... ON CONFLICT DO UPDATE`
- `INSERT OR IGNORE` → `INSERT ... ON CONFLICT DO NOTHING`
- `datetime('now')` → `CURRENT_TIMESTAMP`

## Implementation Plan

1. **Enhance `PostgresDatabase.prepare()`** to automatically convert SQL
2. **Add column name quoting** for camelCase identifiers
3. **Convert common SQL patterns** automatically
4. **Remove PostgreSQL-specific code** from route files
5. **Test thoroughly** to ensure all queries work

## Files That Need Updates

Based on grep results, these files use camelCase column names:
- `server/routes/tasks.js` (361 matches)
- `server/routes/boards.js` (39 matches)
- `server/routes/users.js` (14 matches)
- `server/routes/activity.js` (3 matches)
- `server/routes/taskRelations.js` (96 matches)
- And 12 more files...

## Next Steps

1. Implement automatic SQL conversion in `PostgresDatabase.prepare()`
2. Test with a few route files
3. Gradually remove PostgreSQL-specific code from routes
4. Document the conversion rules

