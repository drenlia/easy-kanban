# SQLite to PostgreSQL Migration Status & Next Steps

## Executive Summary

**Current Status**: ~98-99% Complete  
**SQLite Compatibility**: ✅ Still exists (can be removed)  
**SQLite Proxy**: ✅ Still exists (can be removed - only for SQLite, not PostgreSQL)  
**PostgreSQL Ready**: ✅ Fully functional when `DB_TYPE=postgresql`

---

## Current State Analysis

### ✅ What's Complete

1. **PostgreSQL Infrastructure** (100%)
   - PostgreSQL service configured in Docker Compose
   - Environment variables set up
   - Connection pooling implemented
   - Multi-tenant schema support

2. **Query Migration** (~98-99%)
   - **20+ domains fully migrated** to SQL Manager with PostgreSQL-native queries
   - **~540+ queries migrated** to use PostgreSQL syntax
   - All SQL Manager modules use PostgreSQL syntax (`$1, $2, $3` placeholders)
   - Proper boolean, timestamp, and JSON handling

3. **LISTEN/NOTIFY Implementation** (100%)
   - PostgreSQL notification service implemented
   - All routes automatically use `pg_notify()` when `DB_TYPE=postgresql`
   - WebSocket integration complete
   - Multi-tenant support with schema isolation

4. **Database Abstraction** (100%)
   - `PostgresDatabase` class provides better-sqlite3 compatible API
   - Async/await support throughout
   - Transaction support
   - Schema management for multi-tenant

### ⚠️ What Still Exists (SQLite Compatibility)

1. **SQLite Code Paths**
   - Location: `server/config/database.js` (lines 1227-1295)
   - Condition: `if (process.env.DB_TYPE !== 'postgresql')`
   - Includes:
     - Direct SQLite connection (`new Database(dbPath)`)
     - SQLite proxy connection (`new DatabaseProxy(...)`)
     - File system operations for SQLite databases
     - `getDbPath()` function

2. **SQLite Proxy Service**
   - Location: `sqlite-proxy-service/` directory (entire microservice)
   - Purpose: Prevents NFS locking issues for multi-tenant SQLite
   - Used when: `SQLITE_PROXY_URL` is set AND `MULTI_TENANT=true` AND tenantId exists
   - **Important**: This proxy is ONLY for SQLite, NOT for PostgreSQL
   - Files:
     - `sqlite-proxy-service/index.js` (~350 lines)
     - `sqlite-proxy-service/k8s/deployment.yaml`
     - `sqlite-proxy-service/k8s/service.yaml`
     - `sqlite-proxy-service/Dockerfile`
     - `sqlite-proxy-service/README.md`

3. **Database Proxy Class**
   - Location: `server/utils/databaseProxy.js` (~285 lines)
   - Purpose: HTTP client adapter for SQLite proxy service
   - Used when: SQLite proxy mode is enabled
   - **Not needed for PostgreSQL** (PostgreSQL has native connection pooling)

4. **SQLite Conversion Logic**
   - Location: `server/config/postgresDatabase.js` (~130 lines)
   - Method: `convertSqliteToPostgres()`
   - Purpose: Converts SQLite syntax to PostgreSQL (DATETIME → TIMESTAMPTZ, etc.)
   - Status: Still used but can be removed if all queries use PostgreSQL syntax

5. **Conditional SQL in Routes**
   - Found in 7 route files with ~13 conditional patterns
   - Pattern: `const isPostgres = isPostgresDatabase(db); const query = isPostgres ? postgresSql : sqliteSql;`
   - Files:
     - `server/routes/priorities.js` (1 conditional)
     - `server/routes/tasks.js` (3 conditionals)
     - `server/routes/boards.js` (1 conditional)
     - `server/routes/adminUsers.js` (5 conditionals)
     - `server/routes/health.js` (1 conditional)
     - `server/routes/adminPortal.js` (1 conditional)
     - `server/routes/testNotifications.js` (1 conditional)

6. **Dependencies**
   - `better-sqlite3` in `package.json` (line 61)
   - Native dependency requiring compilation

7. **Helper Functions**
   - `server/utils/dbAsync.js`:
     - `isProxyDatabase()` - checks for DatabaseProxy or PostgresDatabase
     - `isPostgresDatabase()` - checks for PostgresDatabase
     - `convertSqlToPostgres()` - SQLite to PostgreSQL conversion
     - Conditional logic in all helper functions

---

## Key Findings

### 1. SQLite Compatibility Still Exists ✅

**Answer**: Yes, SQLite compatibility is still present in the codebase.

**Evidence**:
- `server/config/database.js` has three code paths:
  1. PostgreSQL (when `DB_TYPE=postgresql`)
  2. SQLite Proxy (when `SQLITE_PROXY_URL` is set)
  3. Direct SQLite (default fallback)

**Current Flow**:
```javascript
// server/config/database.js:1189
export const initializeDatabase = async (tenantId = null) => {
  const usePostgres = process.env.DB_TYPE === 'postgresql';
  
  if (usePostgres) {
    // PostgreSQL mode ✅
    return new PostgresDatabase(tenantId);
  }
  
  // SQLite mode (still exists) ⚠️
  const useProxy = process.env.SQLITE_PROXY_URL && isMultiTenant() && tenantId;
  
  if (useProxy) {
    // SQLite proxy mode ⚠️
    return new DatabaseProxy(tenantId, process.env.SQLITE_PROXY_URL);
  }
  
  // Direct SQLite mode ⚠️
  return new Database(dbPath);
};
```

### 2. SQLite Proxy Still Exists ✅

**Answer**: Yes, the SQLite proxy service still exists, but it's ONLY for SQLite, not PostgreSQL.

**Evidence**:
- Entire `sqlite-proxy-service/` directory exists
- `server/utils/databaseProxy.js` class exists
- Used when `SQLITE_PROXY_URL` is set (only for SQLite mode)

**Important**: 
- The proxy is **NOT needed for PostgreSQL**
- PostgreSQL has native connection pooling via `pg.Pool`
- The proxy was created to solve NFS locking issues with SQLite
- PostgreSQL doesn't have this problem (it's a proper database server)

**When Proxy is Used**:
```javascript
// Only used when:
// 1. NOT using PostgreSQL (DB_TYPE !== 'postgresql')
// 2. Multi-tenant mode (MULTI_TENANT=true)
// 3. SQLite proxy URL is set (SQLITE_PROXY_URL is set)
// 4. Tenant ID exists

const useProxy = process.env.SQLITE_PROXY_URL && isMultiTenant() && tenantId;
```

### 3. PostgreSQL Works Without Proxy ✅

**Answer**: Yes, PostgreSQL works perfectly without any proxy.

**Evidence**:
- When `DB_TYPE=postgresql`, the code uses `PostgresDatabase` directly
- No proxy is involved in PostgreSQL mode
- PostgreSQL uses native `pg.Pool` for connection management
- Multi-tenant isolation is handled via PostgreSQL schemas (not file-based like SQLite)

---

## Next Steps to Complete Migration (Remove SQLite & Proxy)

### Phase 1: Remove SQLite Dependencies & Infrastructure (Week 1)
**Estimated Effort**: 30-40 hours

#### 1.1 Remove SQLite Dependencies (2 hours)
- [ ] Remove `better-sqlite3` from `package.json`
- [ ] Remove SQLite-related npm scripts (if any)
- [ ] Update Dockerfiles (remove SQLite build steps)
- [ ] Test: Verify app fails gracefully if SQLite code is accidentally used

#### 1.2 Simplify Database Initialization (8-10 hours)
**File**: `server/config/database.js`

**Current** (~1300 lines with 3 code paths):
```javascript
export const initializeDatabase = async (tenantId = null) => {
  const usePostgres = process.env.DB_TYPE === 'postgresql';
  
  if (usePostgres) {
    // PostgreSQL path
  }
  
  // SQLite proxy path
  if (useProxy) {
    // ...
  }
  
  // Direct SQLite path
  // ...
};
```

**Target** (~200 lines, PostgreSQL-only):
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
- [ ] Remove SQLite initialization code (~100 lines)
- [ ] Remove SQLite proxy logic (~50 lines)
- [ ] Remove `getDbPath()` and related file system code
- [ ] Simplify `createTables()` (remove SQLite conversion)
- [ ] Remove `convertSqliteToPostgres()` from `database.js`
- [ ] Update error handling

#### 1.3 Remove SQLite Proxy Service (10-12 hours)
**Files to remove**:
- [ ] `sqlite-proxy-service/` directory (entire service)
- [ ] `server/utils/databaseProxy.js` (~285 lines)
- [ ] `k8s/sqlite-proxy-*.yaml` files
- [ ] `Dockerfile.proxy` (if exists)
- [ ] References in deployment scripts

**Files to update**:
- [ ] `k8s/configmap.yaml` - Remove `SQLITE_PROXY_URL`
- [ ] `k8s/app-deployment.yaml` - Remove proxy wait init container
- [ ] `server/config/database.js` - Remove proxy import and logic
- [ ] `server/utils/dbAsync.js` - Remove `isProxyDatabase()` checks

**Tasks**:
- [ ] Remove proxy service code
- [ ] Remove proxy deployment configs
- [ ] Update documentation
- [ ] Remove proxy-related environment variables

#### 1.4 Simplify PostgresDatabase Class (10-12 hours)
**File**: `server/config/postgresDatabase.js` (~515 lines → ~300 lines)

**Remove**:
- [ ] `convertSqliteToPostgres()` method (~130 lines)
- [ ] SQLite placeholder conversion (now use `$1, $2, $3` directly)
- [ ] SQLite syntax compatibility code
- [ ] SQLite pragma simulation

**Simplify**:
- [ ] Remove SQLite compatibility comments
- [ ] Use native PostgreSQL features directly
- [ ] Simplify `prepare()` method (no conversion needed)

**Keep**:
- ✅ Connection pooling
- ✅ Transaction support
- ✅ Schema management (multi-tenant)
- ✅ Async API compatibility

### Phase 2: Clean Up Route Files (Week 2)
**Estimated Effort**: 40-50 hours

#### 2.1 Remove Conditional SQL (30-35 hours)

**Pattern to remove**:
```javascript
const isPostgres = isPostgresDatabase(db);
const query = isPostgres ? postgresSql : sqliteSql;
```

**Replace with**:
```javascript
const query = postgresSql; // PostgreSQL-only
```

**Files to update**:

1. **`server/routes/adminUsers.js`** (8-10 hours)
   - 5 conditional SQL patterns
   - Complex GROUP BY differences
   - String aggregation differences

2. **`server/routes/tasks.js`** (10-12 hours)
   - 3 conditional SQL patterns
   - JSON function differences
   - Large file (~2700 lines)

3. **`server/routes/priorities.js`** (2-3 hours)
   - 1 conditional (lastInsertRowid vs RETURNING)

4. **`server/routes/boards.js`** (3-4 hours)
   - 1 conditional (JSON parsing)

5. **`server/routes/health.js`** (1 hour)
   - 1 conditional (DB_TYPE check)

6. **`server/routes/adminPortal.js`** (2-3 hours)
   - 1 conditional (string aggregation)

7. **`server/routes/testNotifications.js`** (1 hour)
   - 1 conditional (DB_TYPE check)

#### 2.2 Standardize SQL Syntax (10-15 hours)
- [ ] Replace all `?` placeholders with `$1, $2, $3`
- [ ] Replace `json_object()` with `json_build_object()`
- [ ] Replace `json_group_array()` with `json_agg()`
- [ ] Replace `GROUP_CONCAT()` with `string_agg()`
- [ ] Replace `INSERT OR REPLACE` with `ON CONFLICT DO UPDATE`
- [ ] Replace `INTEGER PRIMARY KEY AUTOINCREMENT` with `SERIAL PRIMARY KEY`
- [ ] Replace `DATETIME` with `TIMESTAMPTZ`

### Phase 3: Clean Up Utilities & Migrations (Week 3)
**Estimated Effort**: 25-35 hours

#### 3.1 Simplify dbAsync.js (8-10 hours)
**File**: `server/utils/dbAsync.js` (~150 lines → ~80 lines)

**Remove**:
- [ ] `isPostgresDatabase()` function
- [ ] `isProxyDatabase()` function
- [ ] `convertSqlToPostgres()` function
- [ ] Conditional logic in all helper functions

**Simplify**:
- [ ] All functions become PostgreSQL-only
- [ ] Remove sync/async branching (all async now)

#### 3.2 Update Migration System (6-8 hours)
**File**: `server/migrations/index.js`

**Remove**:
- [ ] `convertMigrationSql()` function
- [ ] SQLite-specific migration syntax
- [ ] Conditional SQLite/PostgreSQL logic

**Update**:
- [ ] All migrations use PostgreSQL syntax
- [ ] Remove SQLite conversion comments

#### 3.3 Clean Up Job Files (4-6 hours)
- [ ] `server/jobs/achievements.js` - Remove SQLite comments
- [ ] `server/jobs/achievementsNew.js` - Remove SQLite comments
- [ ] `server/jobs/taskSnapshots.js` - Remove SQLite comments

#### 3.4 Remove SQLite Migration Script (2 hours)
**File**: `scripts/migrate-sqlite-to-postgres.js`

**Decision**: 
- Keep for one-time migration use
- Archive after all migrations complete
- Document as "one-time migration tool"

#### 3.5 Clean Up Route Comments (2-4 hours)
- [ ] `server/routes/views.js` - Remove SQLite boolean conversion comments
- [ ] `server/routes/settings.js` - Remove SQLite type conversion comments
- [ ] `server/routes/comments.js` - Review for SQLite-specific code
- [ ] `server/routes/users.js` - Review for SQLite-specific code
- [ ] `server/routes/taskRelations.js` - Review for SQLite-specific code
- [ ] `server/routes/activity.js` - Review for SQLite-specific code

### Phase 4: Update Documentation & Configs (Week 4)
**Estimated Effort**: 15-25 hours

#### 4.1 Update Documentation (8-12 hours)
- [ ] Update `docs/DATABASE_SETUP.md` - Remove SQLite references
- [ ] Update `docs/POSTGRESQL_MIGRATION_PLAN.md` - Mark as complete
- [ ] Update `README.md` - Remove SQLite references
- [ ] Create `docs/POSTGRESQL_ONLY.md` - New setup guide
- [ ] Update deployment guides

#### 4.2 Update Docker/K8s Configs (4-6 hours)
- [ ] Update `docker-compose.yml` (remove SQLite volumes)
- [ ] Update Kubernetes configs (remove SQLite services)
- [ ] Remove SQLite-related env vars from ConfigMaps
- [ ] Update deployment scripts

#### 4.3 Code Cleanup (3-7 hours)
- [ ] Remove commented-out SQLite code
- [ ] Remove SQLite-related TODOs
- [ ] Update code comments
- [ ] Run linter and fix issues

---

## Migration Checklist

### Pre-Migration
- [ ] Backup all SQLite databases (if any exist)
- [ ] Verify all data is migrated to PostgreSQL
- [ ] Test PostgreSQL functionality thoroughly
- [ ] Document current SQLite database locations

### Phase 1: Remove SQLite Infrastructure
- [ ] Remove `better-sqlite3` dependency
- [ ] Remove SQLite proxy service
- [ ] Simplify database initialization
- [ ] Simplify PostgresDatabase class

### Phase 2: Clean Up Routes
- [ ] Remove conditional SQL from all routes
- [ ] Standardize SQL syntax
- [ ] Test all routes

### Phase 3: Clean Up Utilities
- [ ] Simplify dbAsync.js
- [ ] Update migration system
- [ ] Clean up job files
- [ ] Remove SQLite comments

### Phase 4: Documentation & Configs
- [ ] Update documentation
- [ ] Update Docker/K8s configs
- [ ] Final code cleanup

### Post-Migration
- [ ] Archive SQLite databases
- [ ] Remove SQLite migration script (after confirmation)
- [ ] Update deployment guides
- [ ] Announce completion

---

## Risk Assessment

### Low Risk ✅
- Removing SQLite code (not used when `DB_TYPE=postgresql`)
- Removing proxy service (not used for PostgreSQL)
- Simplifying database initialization

### Medium Risk ⚠️
- Removing conditional SQL in routes (need thorough testing)
- Updating migration system (affects database upgrades)

### Mitigation Strategies
1. **Gradual Removal**: Remove SQLite code in phases, test after each phase
2. **Feature Flags**: Keep `DB_TYPE` check temporarily, default to PostgreSQL
3. **Testing**: Comprehensive testing after each phase
4. **Rollback Plan**: Keep migration script available for rollback

---

## Estimated Timeline

- **Week 1**: Phase 1 (Remove SQLite infrastructure) - 30-40 hours
- **Week 2**: Phase 2 (Clean up routes) - 40-50 hours
- **Week 3**: Phase 3 (Clean up utilities) - 25-35 hours
- **Week 4**: Phase 4 (Documentation & configs) - 15-25 hours

**Total**: 110-150 hours (3-4 weeks)

---

## Key Decisions Needed

1. **Migration Script**: Keep `scripts/migrate-sqlite-to-postgres.js` for one-time use, or remove?
2. **Feature Flag**: Keep `DB_TYPE` environment variable, or hardcode PostgreSQL?
3. **Rollback**: Do we need ability to rollback to SQLite, or is PostgreSQL-only acceptable?
4. **Testing**: What level of testing is required before removing SQLite code?

---

## Summary

**Current State**:
- ✅ PostgreSQL is fully functional
- ✅ ~98-99% of queries migrated
- ⚠️ SQLite code still exists (not used when `DB_TYPE=postgresql`)
- ⚠️ SQLite proxy still exists (only for SQLite, not PostgreSQL)

**Next Steps**:
1. Remove SQLite dependencies and infrastructure
2. Remove SQLite proxy service (not needed for PostgreSQL)
3. Clean up conditional SQL in routes
4. Simplify utilities and migrations
5. Update documentation and configs

**Timeline**: 3-4 weeks (110-150 hours)

**Risk**: Low to Medium (SQLite code not used, but need thorough testing)
