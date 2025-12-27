# PostgreSQL-Only Refactor: Effort Estimate

## Executive Summary

**Estimated Total Effort**: 3-4 weeks (120-160 hours)  
**Risk Level**: Medium  
**Complexity**: Medium-High  
**Recommended Approach**: Phased migration over 4 weeks

## Current State Analysis

### Database Abstraction Layer
- **PostgresDatabase class**: ~515 lines with SQLite compatibility layer
- **Database initialization**: ~110 lines with SQLite/PostgreSQL/Proxy branching
- **dbAsync.js utilities**: ~150 lines with conditional checks
- **SQLite conversion logic**: Present in 3+ locations

### Route Files with Conditional SQL
Found **13 conditional SQL patterns** across **7 route files**:
- `server/routes/priorities.js` (1 conditional)
- `server/routes/tasks.js` (3 conditionals)
- `server/routes/boards.js` (1 conditional)
- `server/routes/adminUsers.js` (5 conditionals)
- `server/routes/health.js` (1 conditional)
- `server/routes/adminPortal.js` (1 conditional)
- `server/routes/testNotifications.js` (1 conditional)

### Infrastructure Components
- **SQLite Proxy Service**: Entire microservice (~500 lines) for multi-tenant SQLite
- **Database Proxy**: ~265 lines for async SQLite operations
- **Migration system**: Contains SQLite conversion logic
- **Docker/K8s configs**: SQLite-specific volumes and services

### Dependencies
- `better-sqlite3`: Native dependency (requires compilation)
- `pg`: Already present (PostgreSQL driver)

## Detailed Effort Breakdown

### Phase 1: Remove SQLite Dependencies & Core Infrastructure (Week 1)
**Effort**: 30-40 hours

#### 1.1 Remove SQLite Dependencies (2 hours)
- [ ] Remove `better-sqlite3` from `package.json`
- [ ] Remove SQLite-related npm scripts
- [ ] Update Dockerfiles (remove SQLite build steps)
- [ ] Test: Verify app fails gracefully if SQLite code is accidentally used

#### 1.2 Simplify Database Initialization (8-10 hours)
**File**: `server/config/database.js` (~1300 lines → ~200 lines)

**Current complexity**:
- SQLite direct connection path
- SQLite proxy path
- PostgreSQL path
- Multi-tenant logic for each

**Refactored**:
```javascript
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

**Tasks**:
- Remove SQLite initialization code (~100 lines)
- Remove SQLite proxy logic (~50 lines)
- Remove `getDbPath()` and related file system code
- Simplify `createTables()` (remove SQLite conversion)
- Update error handling

#### 1.3 Remove SQLite Proxy Service (10-12 hours)
**Files to remove/update**:
- `sqlite-proxy-service/` directory (entire service)
- `server/utils/databaseProxy.js` (~265 lines)
- `k8s/sqlite-proxy-*.yaml` files
- `Dockerfile.proxy`
- References in deployment scripts

**Tasks**:
- Remove proxy service code
- Remove proxy deployment configs
- Update documentation
- Remove proxy-related environment variables

#### 1.4 Simplify PostgresDatabase Class (10-12 hours)
**File**: `server/config/postgresDatabase.js` (~515 lines → ~300 lines)

**Remove**:
- `convertSqliteToPostgres()` method (~130 lines)
- SQLite placeholder conversion (now use `$1, $2, $3` directly)
- SQLite syntax compatibility code
- SQLite pragma simulation

**Simplify**:
- Remove SQLite compatibility comments
- Use native PostgreSQL features directly
- Simplify `prepare()` method (no conversion needed)

**Keep**:
- Connection pooling
- Transaction support
- Schema management (multi-tenant)
- Async API compatibility

### Phase 2: Clean Up Route Files (Week 2)
**Effort**: 40-50 hours

#### 2.1 Remove Conditional SQL (30-35 hours)
**7 route files** need updates:

**Pattern to remove**:
```javascript
const isPostgres = isPostgresDatabase(db);
const query = isPostgres ? postgresSql : sqliteSql;
```

**Replace with**:
```javascript
const query = postgresSql; // PostgreSQL-only
```

**Files and estimated effort**:

1. **`server/routes/adminUsers.js`** (8-10 hours)
   - 5 conditional SQL patterns
   - Complex GROUP BY differences
   - String aggregation differences
   - Column selection differences

2. **`server/routes/tasks.js`** (10-12 hours)
   - 3 conditional SQL patterns
   - JSON function differences
   - Placeholder differences
   - Large file (~2700 lines) - need careful review

3. **`server/routes/priorities.js`** (2-3 hours)
   - 1 conditional (lastInsertRowid vs RETURNING)
   - Simple fix

4. **`server/routes/boards.js`** (3-4 hours)
   - 1 conditional (JSON parsing)
   - JSON handling differences

5. **`server/routes/health.js`** (1 hour)
   - 1 conditional (DB_TYPE check)
   - Simple removal

6. **`server/routes/adminPortal.js`** (2-3 hours)
   - 1 conditional (string aggregation)
   - Similar to adminUsers.js

7. **`server/routes/testNotifications.js`** (1 hour)
   - 1 conditional (DB_TYPE check)
   - Simple removal

#### 2.2 Standardize SQL Syntax (10-15 hours)
**Tasks**:
- Replace all `?` placeholders with `$1, $2, $3`
- Replace `json_object()` with `json_build_object()`
- Replace `json_group_array()` with `json_agg()`
- Replace `GROUP_CONCAT()` with `string_agg()`
- Replace `INSERT OR REPLACE` with `ON CONFLICT DO UPDATE`
- Replace `INTEGER PRIMARY KEY AUTOINCREMENT` with `SERIAL PRIMARY KEY`
- Replace `DATETIME` with `TIMESTAMPTZ`
- Standardize column names (lowercase vs camelCase)

**Files to review**:
- All route files (~20 files)
- Migration files
- Job files (achievements, taskSnapshots)
- Utility files

### Phase 3: Clean Up Utilities & Migrations (Week 3)
**Effort**: 25-35 hours

#### 3.1 Simplify dbAsync.js (8-10 hours)
**File**: `server/utils/dbAsync.js` (~150 lines → ~80 lines)

**Remove**:
- `isPostgresDatabase()` function (no longer needed)
- `isProxyDatabase()` function (no longer needed)
- `convertSqlToPostgres()` function (no longer needed)
- Conditional logic in all helper functions

**Simplify**:
- All functions become PostgreSQL-only
- Remove sync/async branching (all async now)

#### 3.2 Update Migration System (6-8 hours)
**File**: `server/migrations/index.js`

**Remove**:
- `convertMigrationSql()` function
- `isPostgres` checks
- SQLite-specific migration syntax

**Update**:
- All migrations use PostgreSQL syntax
- Remove conditional INSERT syntax
- Use `ON CONFLICT` instead of `INSERT OR IGNORE`

#### 3.3 Update Other Files (10-15 hours)
**Files to update**:
- `server/jobs/achievements.js` - Remove SQLite comments
- `server/jobs/achievementsNew.js` - Remove SQLite comments
- `server/jobs/taskSnapshots.js` - Remove SQLite comments
- `server/routes/views.js` - Remove SQLite boolean conversion
- `server/routes/settings.js` - Remove SQLite type conversion
- `server/routes/comments.js` - Review for SQLite-specific code
- `server/routes/users.js` - Review for SQLite-specific code
- `server/routes/taskRelations.js` - Review for SQLite-specific code
- `server/routes/activity.js` - Review for SQLite-specific code
- `server/config/license.js` - Remove SQLite compatibility comments
- `src/App.tsx` - Remove SQLite boolean conversion comments

#### 3.4 Remove SQLite Migration Script (2 hours)
**File**: `scripts/migrate-sqlite-to-postgres.js`

**Decision**: Keep for one-time migrations, then archive
- Document that it's for one-time use only
- Add deprecation notice
- Plan removal after all migrations complete

### Phase 4: Testing, Documentation & Cleanup (Week 4)
**Effort**: 25-35 hours

#### 4.1 Comprehensive Testing (15-20 hours)
**Test Areas**:
- [ ] All API endpoints (CRUD operations)
- [ ] Real-time updates (LISTEN/NOTIFY)
- [ ] Multi-tenant isolation
- [ ] Data integrity (foreign keys, constraints)
- [ ] Transaction handling
- [ ] Migration system
- [ ] Performance (query speed, connection pooling)
- [ ] Error handling
- [ ] Edge cases (empty results, null values)

**Test Scenarios**:
- Single-tenant mode
- Multi-tenant mode
- Large datasets (550+ tasks)
- Concurrent operations
- Connection failures
- Transaction rollbacks

#### 4.2 Update Documentation (5-8 hours)
**Files to update**:
- `README.md` - Remove SQLite references
- `DOCKER.md` - Update Docker setup (PostgreSQL only)
- `docs/POSTGRESQL_ABSTRACTION_STRATEGY.md` - Mark as obsolete
- `docs/FULL_POSTGRESQL_MIGRATION_STRATEGY.md` - Update status
- Create `docs/POSTGRESQL_SETUP.md` - New setup guide
- Update deployment guides
- Update development setup instructions

#### 4.3 Infrastructure Updates (3-5 hours)
**Tasks**:
- Update `docker-compose.yml` (remove SQLite volumes)
- Update Kubernetes configs (remove SQLite services)
- Update environment variable documentation
- Remove SQLite-related env vars
- Update CI/CD pipelines (if applicable)

#### 4.4 Code Cleanup (2-3 hours)
**Tasks**:
- Remove unused imports
- Remove commented-out SQLite code
- Remove SQLite-related TODOs
- Run linter and fix issues
- Update code comments

## Risk Assessment

### High Risk Areas
1. **Route files with complex queries** (tasks.js, adminUsers.js)
   - **Risk**: Breaking existing functionality
   - **Mitigation**: Comprehensive testing, gradual rollout

2. **Multi-tenant schema isolation**
   - **Risk**: Schema conflicts or data leakage
   - **Mitigation**: Thorough testing of tenant isolation

3. **Migration system**
   - **Risk**: Breaking existing migrations
   - **Mitigation**: Test migrations on staging first

### Medium Risk Areas
1. **Transaction handling**
   - **Risk**: Different transaction semantics
   - **Mitigation**: Test all transaction paths

2. **JSON handling**
   - **Risk**: Different JSON parsing behavior
   - **Mitigation**: Test all JSON operations

3. **Performance**
   - **Risk**: Slower queries or connection issues
   - **Mitigation**: Benchmark before/after, optimize as needed

### Low Risk Areas
1. **Simple route files** (health.js, testNotifications.js)
2. **Configuration files**
3. **Documentation**

## Benefits After Refactor

### Code Quality
- **~500 lines removed** (SQLite compatibility code)
- **Simpler codebase** (no conditional SQL)
- **Easier maintenance** (single database system)
- **Better type safety** (PostgreSQL-specific types)

### Performance
- **Better connection pooling** (PostgreSQL native)
- **Better query optimization** (PostgreSQL query planner)
- **Native JSON support** (JSONB with indexing)
- **Better concurrency** (PostgreSQL handles concurrent writes better)

### Features
- **Native PostgreSQL features** (full-text search, arrays, etc.)
- **Better scalability** (PostgreSQL handles large datasets better)
- **Production-ready** (battle-tested for enterprise)

## Migration Checklist

### Pre-Migration
- [ ] Backup all SQLite databases
- [ ] Test migration script on staging
- [ ] Document current SQLite database locations
- [ ] Plan rollback strategy

### During Migration
- [ ] Remove SQLite dependencies
- [ ] Update database initialization
- [ ] Remove SQLite proxy service
- [ ] Simplify PostgresDatabase class
- [ ] Update all route files
- [ ] Update utilities and migrations
- [ ] Test thoroughly at each phase

### Post-Migration
- [ ] Verify all functionality works
- [ ] Performance testing
- [ ] Update documentation
- [ ] Archive SQLite databases
- [ ] Remove SQLite migration script (after confirmation)
- [ ] Update deployment guides

## Timeline Recommendation

### Option A: Aggressive (3 weeks)
- **Week 1**: Phases 1-2 (remove SQLite, update routes)
- **Week 2**: Phase 3 (utilities, migrations)
- **Week 3**: Phase 4 (testing, documentation)
- **Risk**: Higher risk of bugs, less time for testing

### Option B: Conservative (4 weeks) - **RECOMMENDED**
- **Week 1**: Phase 1 (remove SQLite infrastructure)
- **Week 2**: Phase 2 (update route files)
- **Week 3**: Phase 3 (utilities, migrations)
- **Week 4**: Phase 4 (testing, documentation)
- **Risk**: Lower risk, more time for testing and refinement

### Option C: Very Conservative (6 weeks)
- **Week 1-2**: Phase 1 (remove SQLite infrastructure)
- **Week 3-4**: Phase 2 (update route files)
- **Week 5**: Phase 3 (utilities, migrations)
- **Week 6**: Phase 4 (testing, documentation)
- **Risk**: Lowest risk, but longer timeline

## Conclusion

**Recommended Approach**: **Option B (4 weeks, conservative)**

**Key Success Factors**:
1. **Thorough testing** at each phase
2. **Gradual migration** (not all at once)
3. **Comprehensive documentation** updates
4. **Rollback plan** in case of issues

**Estimated Total Effort**: **120-160 hours** (3-4 weeks for 1 developer)

**Benefits**:
- Simpler, more maintainable codebase
- Better performance and scalability
- Native PostgreSQL features
- Production-ready architecture

**Next Steps**:
1. Review and approve this plan
2. Create detailed task breakdown
3. Set up staging environment for testing
4. Begin Phase 1 (remove SQLite infrastructure)

