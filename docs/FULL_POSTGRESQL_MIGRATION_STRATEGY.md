# Full PostgreSQL Migration Strategy

## Overview

If we decide to **fully migrate to PostgreSQL and drop SQLite support**, here's the smart way to proceed:

## Benefits of Full Migration

1. **Simplified Codebase**: Remove all SQLite-specific code and conditional logic
2. **Better Performance**: PostgreSQL is optimized for production workloads
3. **Native Features**: Use PostgreSQL-specific features without abstraction overhead
4. **Easier Maintenance**: Single database system to maintain
5. **Production Ready**: PostgreSQL is battle-tested for enterprise applications

## Migration Strategy

### Phase 1: Remove SQLite Support (Clean Slate Approach)

#### 1.1 Remove SQLite Dependencies
```bash
# Remove from package.json
npm uninstall better-sqlite3
```

#### 1.2 Simplify Database Initialization
**Current**: `server/config/database.js` has complex logic for SQLite/PostgreSQL/Proxy
**New**: Only PostgreSQL initialization

```javascript
// Simplified database.js
export const initializeDatabase = async (tenantId = null) => {
  const db = new PostgresDatabase(tenantId);
  await db.ensureSchema();
  await createTables(db);
  await initializeDefaultPriorities(db);
  await runMigrations(db);
  const versionInfo = await initializeDefaultData(db, tenantId);
  return { db, ...versionInfo };
};
```

#### 1.3 Remove Abstraction Layer Complexity
**Current**: `PostgresDatabase` tries to be compatible with `better-sqlite3`
**New**: Native PostgreSQL interface

**Option A: Keep current abstraction (easier)**
- Keep `PostgresDatabase` but remove SQLite conversion logic
- Remove `convertSqliteToPostgres()` method
- Remove `isPostgresDatabase()` checks everywhere

**Option B: Use native `pg` library (cleaner)**
- Replace `PostgresDatabase` with direct `pg.Pool` usage
- Use native PostgreSQL features directly
- Requires more refactoring but cleaner code

### Phase 2: Clean Up Route Files

#### 2.1 Remove All Conditional SQL
**Current**:
```javascript
const isPostgres = isPostgresDatabase(db);
const rolesAgg = isPostgres ? 'string_agg(r.name, \',\')' : 'GROUP_CONCAT(r.name)';
```

**New**:
```javascript
const rolesAgg = 'string_agg(r.name, \',\')';
```

#### 2.2 Use PostgreSQL-Native Features
- `string_agg()` instead of `GROUP_CONCAT()`
- `json_build_object()` instead of `json_object()`
- `json_agg()` instead of `json_group_array()`
- `ON CONFLICT DO UPDATE` instead of `INSERT OR REPLACE`
- `TIMESTAMPTZ` with proper timezone handling
- `SERIAL` instead of `INTEGER PRIMARY KEY AUTOINCREMENT`

#### 2.3 Fix Column Name Case Sensitivity
**Current**: Mixed camelCase and lowercase
**New**: Standardize on one approach

**Option A: Use lowercase everywhere (recommended)**
```sql
-- All queries use lowercase
SELECT taskid, columnid, userid FROM tasks
```

**Option B: Quote camelCase identifiers**
```sql
-- All queries quote identifiers
SELECT "taskId", "columnId", "userId" FROM tasks
```

**Recommendation**: Use lowercase everywhere for simplicity.

### Phase 3: Remove SQLite-Specific Code

#### 3.1 Files to Update
- `server/config/database.js` - Remove SQLite initialization
- `server/config/postgresDatabase.js` - Simplify (remove SQLite compatibility)
- `server/utils/dbAsync.js` - Remove `isPostgresDatabase()` checks
- All route files - Remove conditional SQL

#### 3.2 Remove SQLite Migration Scripts
- `scripts/migrate-sqlite-to-postgres.js` - Keep for one-time migration, then remove
- SQLite database files - Archive or delete

### Phase 4: Leverage PostgreSQL Features

#### 4.1 Use PostgreSQL-Specific Features
- **Full-text search**: Use `tsvector` and `tsquery` for better search
- **Array types**: Use PostgreSQL arrays instead of JSON for simple lists
- **JSONB**: Use `JSONB` instead of `TEXT` for JSON columns (better indexing)
- **Partitioning**: Use table partitioning for large tables
- **Materialized views**: For complex aggregations
- **Triggers**: Use database triggers for audit logs

#### 4.2 Optimize Queries
- Use `EXPLAIN ANALYZE` to optimize slow queries
- Add proper indexes (PostgreSQL has better indexing options)
- Use `LATERAL JOIN` for complex queries
- Use `CTE` (Common Table Expressions) for readability

### Phase 5: Testing & Validation

#### 5.1 Test Checklist
- [ ] All API endpoints work
- [ ] Real-time updates work (LISTEN/NOTIFY)
- [ ] Multi-tenant isolation works
- [ ] Data integrity maintained
- [ ] Performance is acceptable
- [ ] Migration script works correctly

#### 5.2 Performance Testing
- Load testing with production-like data
- Query performance comparison
- Connection pooling optimization
- Index optimization

## Recommended Approach: Gradual Cleanup

### Step 1: Remove SQLite Code Paths (Week 1)
1. Remove `better-sqlite3` dependency
2. Remove SQLite initialization from `database.js`
3. Remove `isPostgresDatabase()` checks (replace with assertions)
4. Update all route files to use PostgreSQL-only SQL

### Step 2: Simplify Database Layer (Week 2)
1. Simplify `PostgresDatabase` class
2. Remove SQLite conversion logic
3. Use native PostgreSQL features directly
4. Update documentation

### Step 3: Optimize for PostgreSQL (Week 3)
1. Add PostgreSQL-specific indexes
2. Use JSONB for JSON columns
3. Optimize slow queries
4. Add database-level constraints

### Step 4: Clean Up & Document (Week 4)
1. Remove unused code
2. Update all documentation
3. Create PostgreSQL-specific guides
4. Update deployment scripts

## Code Examples

### Before (Dual Support)
```javascript
// server/routes/adminUsers.js
const isPostgres = isPostgresDatabase(db);
const rolesAgg = isPostgres ? 'string_agg(r.name, \',\')' : 'GROUP_CONCAT(r.name)';
const users = await db.prepare(`SELECT u.*, ${rolesAgg} as roles ...`).all();
```

### After (PostgreSQL Only)
```javascript
// server/routes/adminUsers.js
const users = await db.prepare(`
  SELECT u.*, string_agg(r.name, ',') as roles, 
         MAX(m.name) as member_name, MAX(m.color) as member_color
  FROM users u
  LEFT JOIN user_roles ur ON u.id = ur.user_id
  LEFT JOIN roles r ON ur.role_id = r.id
  LEFT JOIN members m ON u.id = m.user_id
  GROUP BY u.id
  ORDER BY u.created_at DESC
`).all();
```

### Database Initialization

**Before**:
```javascript
export const initializeDatabase = async (tenantId = null) => {
  const usePostgres = process.env.DB_TYPE === 'postgresql';
  if (usePostgres) {
    // PostgreSQL code
  } else {
    // SQLite code
  }
};
```

**After**:
```javascript
export const initializeDatabase = async (tenantId = null) => {
  const db = new PostgresDatabase(tenantId);
  await db.ensureSchema();
  await createTables(db);
  // ... rest of initialization
  return { db, ...versionInfo };
};
```

## Migration Checklist

- [ ] Remove `better-sqlite3` from `package.json`
- [ ] Remove SQLite initialization code
- [ ] Remove `isPostgresDatabase()` checks
- [ ] Update all route files to PostgreSQL-only SQL
- [ ] Remove SQLite conversion logic from `PostgresDatabase`
- [ ] Standardize column names (lowercase or quoted)
- [ ] Update all documentation
- [ ] Remove SQLite migration scripts (after migration complete)
- [ ] Update Docker Compose (remove SQLite volumes)
- [ ] Update deployment documentation

## Risks & Mitigation

### Risk 1: Breaking Changes
**Mitigation**: Keep migration script available, test thoroughly before removing SQLite code

### Risk 2: Performance Regression
**Mitigation**: Benchmark before/after, optimize queries as needed

### Risk 3: Missing Features
**Mitigation**: Document any PostgreSQL limitations, use PostgreSQL features to compensate

## Conclusion

**Recommended Timeline**: 4-6 weeks for full migration
**Recommended Approach**: Gradual cleanup with thorough testing at each step
**Key Benefit**: Simpler, more maintainable codebase with better performance

The smart way forward is to:
1. **Remove SQLite support gradually** (not all at once)
2. **Test thoroughly** at each step
3. **Leverage PostgreSQL features** to improve the application
4. **Document everything** for future maintainers

