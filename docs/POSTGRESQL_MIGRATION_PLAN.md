# PostgreSQL Migration Plan

## Overview

This document outlines the plan to migrate from SQLite to PostgreSQL, enabling:
- Better scalability and performance
- Native LISTEN/NOTIFY for real-time pub/sub (replacing most WebSocket publishes)
- Better multi-tenant support with schemas
- Production-grade database features
- Timezone-aware timestamps (TIMESTAMPTZ) for global deployments

---

## Architecture Changes

### Current (SQLite)
- **Single-tenant**: One database file per instance (`kanban.db`)
- **Multi-tenant**: One database file per tenant (`tenants/{tenantId}/kanban.db`)
- **Real-time**: Redis Pub/Sub → WebSocket

### Target (PostgreSQL)
- **Single-tenant**: One database (`kanban`) with `public` schema
- **Multi-tenant**: One database (`kanban`) with one schema per tenant (`{tenantId}`)
- **Real-time**: PostgreSQL LISTEN/NOTIFY → WebSocket (replaces most Redis publishes)

---

## Migration Steps

### Phase 1: Setup PostgreSQL Infrastructure ✅

1. **Add PostgreSQL to Docker Compose**
   - ✅ Created `postgres` service in `docker-compose.yml`
   - ✅ Configured health checks
   - ✅ Enabled LISTEN/NOTIFY support
   - ✅ Set up volumes for data persistence

2. **Environment Variables**
   ```bash
   DB_TYPE=postgresql
   POSTGRES_HOST=postgres
   POSTGRES_PORT=5432
   POSTGRES_DB=kanban
   POSTGRES_USER=kanban_user
   POSTGRES_PASSWORD=kanban_password
   ```

### Phase 2: Data Migration

1. **Run Migration Script**
   ```bash
   # Single-tenant
   node scripts/migrate-sqlite-to-postgres.js
   
   # Multi-tenant (per tenant)
   node scripts/migrate-sqlite-to-postgres.js --tenant-id <tenantId>
   ```

2. **Verify Migration**
   - Check row counts match
   - Verify data integrity
   - Test critical queries

### Phase 3: Code Migration

1. **Create Database Abstraction Layer**
   - Create `server/config/postgresDatabase.js`
   - Implement same interface as SQLite database
   - Support both SQLite and PostgreSQL (for gradual migration)

2. **Update Database Initialization**
   - Modify `server/config/database.js` to support PostgreSQL
   - Add schema creation for multi-tenant mode
   - Update connection logic

3. **Translate Queries**
   - SQLite → PostgreSQL syntax differences:
     - `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL PRIMARY KEY`
     - `TEXT` → `TEXT` (same)
     - `DATETIME` → `TIMESTAMP`
     - `BOOLEAN` (stored as INTEGER 0/1) → `BOOLEAN` (true/false)
     - `datetime()` function → `to_timestamp()`
     - `INSERT OR REPLACE` → `INSERT ... ON CONFLICT DO UPDATE`
     - `INSERT OR IGNORE` → `INSERT ... ON CONFLICT DO NOTHING`

4. **Update Query Helpers**
   - Modify `server/utils/dbAsync.js` to support PostgreSQL
   - Update `server/utils/queryLogger.js` if needed

### Phase 4: Implement LISTEN/NOTIFY

1. **Create PostgreSQL Notification Service**
   - `server/services/postgresNotifyService.js`
   - Subscribe to PostgreSQL notifications
   - Convert to WebSocket events

2. **Replace Redis Publishes with NOTIFY**
   - Update endpoints to use `pg_notify()` instead of `redisService.publish()`
   - Keep Redis for Socket.IO adapter (still needed for multi-pod)

3. **Update WebSocket Service**
   - Subscribe to PostgreSQL notifications
   - Emit WebSocket events based on notifications

### Phase 5: Testing & Validation

1. **Unit Tests**
   - Test database queries
   - Test LISTEN/NOTIFY functionality
   - Test multi-tenant schema isolation

2. **Integration Tests**
   - Test full CRUD operations
   - Test real-time updates
   - Test multi-tenant isolation

3. **Performance Tests**
   - Compare query performance
   - Test concurrent connections
   - Test LISTEN/NOTIFY latency

### Phase 6: Deployment

1. **Staging Deployment**
   - Deploy to staging environment
   - Run migration script
   - Monitor for issues

2. **Production Deployment**
   - Backup SQLite databases
   - Run migration during maintenance window
   - Verify application functionality
   - Monitor performance

---

## SQLite to PostgreSQL Translation Guide

### Data Types

| SQLite | PostgreSQL | Notes |
|--------|------------|-------|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` | Auto-increment |
| `INTEGER` | `INTEGER` | Same |
| `TEXT` | `TEXT` | Same |
| `DATETIME` | `TIMESTAMPTZ` | Date/time with timezone (recommended) |
| `DATE` | `DATE` | Same |
| `BOOLEAN` (INTEGER 0/1) | `BOOLEAN` | Convert 0/1 to false/true |
| `REAL` | `REAL` | Same |
| `BLOB` | `BYTEA` | Binary data |

### SQL Syntax Differences

| SQLite | PostgreSQL |
|--------|------------|
| `INSERT OR REPLACE INTO ...` | `INSERT INTO ... ON CONFLICT ... DO UPDATE SET ...` |
| `INSERT OR IGNORE INTO ...` | `INSERT INTO ... ON CONFLICT ... DO NOTHING` |
| `datetime('now')` | `CURRENT_TIMESTAMP` or `NOW()` (returns TIMESTAMPTZ) |
| `datetime(column)` | `to_timestamp(column)` or `column::TIMESTAMPTZ` |
| `||` (string concat) | `||` (same) or `CONCAT()` |

### Boolean Handling

SQLite stores booleans as INTEGER (0/1), PostgreSQL uses native BOOLEAN.

**Migration:**
- Convert `0` → `false`
- Convert `1` → `true`
- Convert `NULL` → `NULL`

**Query Translation:**
```sql
-- SQLite
WHERE is_active = 1

-- PostgreSQL
WHERE is_active = true
```

---

## Multi-Tenant Schema Strategy

### Schema Creation

```sql
-- Create schema for tenant
CREATE SCHEMA IF NOT EXISTS {tenantId};

-- Set search path
SET search_path TO {tenantId}, public;

-- Create tables in tenant schema
CREATE TABLE {tenantId}.users (...);
```

### Query Pattern

```javascript
// Set schema before queries
await pgClient.query(`SET search_path TO ${tenantId}, public`);

// Or use schema prefix in queries
await pgClient.query(`SELECT * FROM ${tenantId}.users`);
```

---

## LISTEN/NOTIFY Implementation

### Server-Side (Publish)

```javascript
// Instead of Redis publish
await redisService.publish('task-updated', data, tenantId);

// Use PostgreSQL NOTIFY
await pgClient.query(
  `SELECT pg_notify($1, $2)`,
  [`task-updated-${tenantId}`, JSON.stringify(data)]
);
```

### Server-Side (Subscribe)

```javascript
// Subscribe to notifications
const pgClient = new Client({ ... });
await pgClient.connect();
await pgClient.query('LISTEN task-updated');

pgClient.on('notification', (msg) => {
  const data = JSON.parse(msg.payload);
  // Emit to WebSocket clients
  io.to(`board-${data.boardId}`).emit('task-updated', data);
});
```

### Benefits

- ✅ **Transactional**: Notify only after commit
- ✅ **Ordered**: PostgreSQL guarantees order
- ✅ **No message queue**: Built into database
- ✅ **Better isolation**: Schema-based for multi-tenant

---

## Migration Script Usage

### Single-Tenant

```bash
# Set environment variables
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_DB=kanban
export POSTGRES_USER=kanban_user
export POSTGRES_PASSWORD=kanban_password

# Run migration
node scripts/migrate-sqlite-to-postgres.js
```

### Multi-Tenant

```bash
# Set environment variables
export MULTI_TENANT=true
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_DB=kanban
export POSTGRES_USER=kanban_user
export POSTGRES_PASSWORD=kanban_password

# Run migration for each tenant
node scripts/migrate-sqlite-to-postgres.js --tenant-id tenant1
node scripts/migrate-sqlite-to-postgres.js --tenant-id tenant2
```

---

## Rollback Plan

If migration fails:

1. **Keep SQLite databases** (don't delete until verified)
2. **Revert environment variables** to use SQLite
3. **Restart application** with SQLite
4. **Investigate issues** and fix migration script
5. **Retry migration** after fixes

---

## Testing Checklist

- [ ] Database connection works
- [ ] All tables created correctly
- [ ] All indexes created correctly
- [ ] Data migrated correctly (row counts match)
- [ ] Boolean values converted correctly
- [ ] Foreign keys work correctly
- [ ] Multi-tenant schema isolation works
- [ ] LISTEN/NOTIFY works for real-time updates
- [ ] Application queries work correctly
- [ ] Performance is acceptable
- [ ] No data loss

---

## Next Steps

1. ✅ Add PostgreSQL to Docker Compose
2. ✅ Create migration script
3. ⏳ Test migration script on development database
4. ⏳ Create PostgreSQL database abstraction layer
5. ⏳ Update database initialization code
6. ⏳ Translate queries from SQLite to PostgreSQL
7. ⏳ Implement LISTEN/NOTIFY service
8. ⏳ Replace Redis publishes with NOTIFY
9. ⏳ Test thoroughly
10. ⏳ Deploy to staging
11. ⏳ Deploy to production

---

## Notes

- **Keep Redis**: Still needed for Socket.IO adapter in multi-pod deployments
- **Gradual Migration**: Can support both SQLite and PostgreSQL during transition
- **Backup First**: Always backup SQLite databases before migration
- **Test Thoroughly**: Test all functionality before production deployment

